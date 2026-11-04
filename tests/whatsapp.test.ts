// Etapa 4 — WhatsApp Cloud API. A API da Meta é substituída por um servidor falso APENAS nos testes
// (fetch interceptado); o sistema real só fala com graph.facebook.com.
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { ValidationError } from "@/server/errors";
import { decryptSecret, encryptSecret } from "@/server/crypto/secrets";
import { createCandidate } from "@/server/modules/candidates/service";
import { ensureConversation, processRetryQueue, sendTemplateMessage, sendTextMessage } from "@/server/modules/messages/service";
import { createSuggestedTemplates, fromMetaFormat, saveTemplate, submitTemplate, syncTemplates, toMetaFormat } from "@/server/modules/messages/templates";
import { generateVerifyToken, saveCredentials } from "@/server/whatsapp/settings";
import { handleWebhook, validSignature } from "@/server/whatsapp/webhook";
import { GET as verifyRoute, POST as webhookRoute } from "@/app/api/webhooks/whatsapp/route";
import { adminActor, resetDatabase } from "./support/db";

const TOKEN = "EAAG" + "x".repeat(120);
const SECRET = "app-secret-de-teste";
type Call = { url: string; body: unknown };
let calls: Call[] = [];
let submitted: string | null = null;
let nextSend: () => Response = () => json({ messages: [{ id: `wamid.${calls.length}` }] });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

function fakeMeta() {
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (!url.startsWith("https://graph.facebook.com/")) throw new Error("rede real bloqueada no teste");
    if (url.includes("?fields=display_phone_number")) return json({ id: "123456", display_phone_number: "+55 47 3333-0000", verified_name: "Loja Teste", quality_rating: "GREEN" });
    if (url.endsWith("/messages")) return body?.status === "read" ? json({ success: true }) : nextSend();
    if (url.includes("/message_templates") && init?.method === "POST") {
      submitted = (body as { name: string }).name;
      return json({ id: "tpl1", status: "PENDING", category: "UTILITY" });
    }
    if (url.includes("/message_templates")) return json({ data: submitted ? [{ id: "tpl1", name: submitted, language: "pt_BR", status: "APPROVED", category: "UTILITY" }] : [] });
    return json({ error: { code: 100, message: "not mocked" } }, 400);
  });
}

async function connected() {
  const admin = await adminActor();
  await saveCredentials(admin, { appId: "111111", wabaId: "222222", phoneNumberId: "333333", accessToken: TOKEN, appSecret: SECRET });
  return admin;
}

const inbound = (from: string, text: string, id = `wamid.in.${Math.random()}`) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "222222", changes: [{ field: "messages", value: { messaging_product: "whatsapp", contacts: [{ wa_id: from, profile: { name: "Contato" } }], messages: [{ id, from, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }] } }] }],
});
const status = (id: string, s: "sent" | "delivered" | "read" | "failed", errors?: { code: number; title?: string }[]) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "222222", changes: [{ field: "messages", value: { statuses: [{ id, status: s, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: "5547999990000", errors }] } }] }],
});

beforeEach(async () => {
  await resetDatabase();
  calls = [];
  submitted = null;
  nextSend = () => json({ messages: [{ id: `wamid.${calls.length}` }] });
  fakeMeta();
});
afterEach(() => vi.unstubAllGlobals());

describe("segredos e credenciais", () => {
  it("cifra o token no banco e conecta consultando o número na Meta", async () => {
    expect(decryptSecret(encryptSecret("abc"))).toBe("abc");
    await connected();
    const i = await db.whatsAppIntegration.findUniqueOrThrow({ where: { id: "default" } });
    expect(i.status).toBe("CONNECTED");
    expect(i.displayPhone).toBe("+55 47 3333-0000");
    expect(i.accessTokenEnc).not.toContain(TOKEN.slice(0, 20));
    expect(JSON.stringify(i)).not.toContain(SECRET);
    expect(i.accessTokenLast4).toBe("xxxx");
  });

  it("webhook: verificação pelo Verify Token e recusa de assinatura inválida", async () => {
    const admin = await connected();
    const vt = await generateVerifyToken(admin);
    const ok = await verifyRoute(new NextRequest(`http://x/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${vt}&hub.challenge=987`));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("987");
    const bad = await verifyRoute(new NextRequest(`http://x/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1`));
    expect(bad.status).toBe(403);
    const raw = JSON.stringify(inbound("5547999990000", "oi"));
    const unsigned = await webhookRoute(new NextRequest("http://x/api/webhooks/whatsapp", { method: "POST", body: raw, headers: { "x-hub-signature-256": "sha256=00" } }));
    expect(unsigned.status).toBe(401);
    const sig = "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex");
    expect(validSignature(raw, sig, SECRET)).toBe(true);
    const signed = await webhookRoute(new NextRequest("http://x/api/webhooks/whatsapp", { method: "POST", body: raw, headers: { "x-hub-signature-256": sig } }));
    expect(signed.status).toBe(200);
    expect(await db.message.count({ where: { direction: "INBOUND" } })).toBe(1);
  });
});

describe("recebimento", () => {
  it("vincula ao candidato pelo número, conta não lidas, abre a janela e ignora evento duplicado", async () => {
    const admin = await connected();
    const c = await createCandidate(admin, { fullName: "Paula Ramos", phone: "(47) 99999-0000", sameWhatsapp: "on", source: "MANUAL", consent: "on" });
    const payload = inbound("5547999990000", "Olá, vi a vaga", "wamid.A");
    await handleWebhook(payload);
    await handleWebhook(payload); // a Meta reenviou
    const conv = await db.conversation.findUniqueOrThrow({ where: { waContactE164: "+5547999990000" } });
    expect(conv.candidateId).toBe(c.id);
    expect(conv.unreadCount).toBe(1);
    expect(conv.lastInboundAt).not.toBeNull();
    expect(await db.message.count({ where: { conversationId: conv.id } })).toBe(1);
    expect(await db.webhookEvent.count()).toBe(1);
  });

  it("descadastro: SAIR registra o pedido, confirma ao candidato e bloqueia novos envios", async () => {
    const admin = await connected();
    const c = await createCandidate(admin, { fullName: "Rafael Lima", phone: "(47) 98888-0000", sameWhatsapp: "on", source: "MANUAL", consent: "on" });
    await handleWebhook(inbound("5547988880000", "SAIR"));
    expect((await db.candidate.findUniqueOrThrow({ where: { id: c.id } })).optedOutAt).not.toBeNull();
    expect(calls.some((x) => x.url.endsWith("/messages") && (x.body as { text?: { body: string } })?.text?.body.includes("não receberá"))).toBe(true);
    const conv = await ensureConversation(admin, c.id);
    await expect(sendTextMessage(admin, conv.id, "Oi?")).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("envio", () => {
  it("texto livre só dentro da janela de 24 h; status evolui e nunca regride", async () => {
    const admin = await connected();
    const c = await createCandidate(admin, { fullName: "Bianca Melo", phone: "(47) 97777-0000", sameWhatsapp: "on", source: "MANUAL", consent: "on" });
    const conv = await ensureConversation(admin, c.id);
    await expect(sendTextMessage(admin, conv.id, "Olá")).rejects.toBeInstanceOf(ValidationError); // janela fechada
    await handleWebhook(inbound("5547977770000", "Oi!"));
    const m = await sendTextMessage(admin, conv.id, "Olá, Bianca!");
    expect(m.status).toBe("SENT");
    expect(calls.at(-1)!.body).toMatchObject({ to: "5547977770000", type: "text" });
    await handleWebhook(status(m.waMessageId!, "read"));
    await handleWebhook(status(m.waMessageId!, "delivered")); // chegou fora de ordem
    expect((await db.message.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("READ");
  });

  it("fora da janela envia modelo aprovado com as variáveis preenchidas", async () => {
    const admin = await connected();
    expect(await createSuggestedTemplates(admin)).toBe(6);
    const t = await db.messageTemplate.findFirstOrThrow({ where: { purpose: "Aprovação" } });
    await submitTemplate(admin, t.id);
    await syncTemplates(admin);
    const approved = await db.messageTemplate.findUniqueOrThrow({ where: { id: t.id } });
    expect(approved.approval).toBe("APPROVED");
    const c = await createCandidate(admin, { fullName: "Diego Alves", phone: "(47) 96666-0000", sameWhatsapp: "on", source: "MANUAL", consent: "on" });
    const conv = await ensureConversation(admin, c.id);
    await expect(sendTemplateMessage(admin, conv.id, t.id, { nome: "Diego" })).rejects.toBeInstanceOf(ValidationError); // falta {vaga}
    const m = await sendTemplateMessage(admin, conv.id, t.id, { nome: "Diego", vaga: "Vendedor" });
    expect(m.body).toContain("Parabéns, Diego!");
    expect(calls.at(-1)!.body).toMatchObject({ type: "template", template: { name: approved.metaName, components: [{ type: "body", parameters: [{ type: "text", text: "Diego" }, { type: "text", text: "Vendedor" }] }] } });
  });

  it("erro temporário entra na fila de reenvio; erro definitivo fica como falha", async () => {
    const admin = await connected();
    const c = await createCandidate(admin, { fullName: "Elisa Rocha", phone: "(47) 95555-0000", sameWhatsapp: "on", source: "MANUAL", consent: "on" });
    const conv = await ensureConversation(admin, c.id);
    await handleWebhook(inbound("5547955550000", "oi"));
    nextSend = () => json({ error: { code: 130429, message: "Rate limit hit" } }, 429);
    const m = await sendTextMessage(admin, conv.id, "Tudo bem?");
    expect(m.status).toBe("QUEUED");
    expect(m.nextAttemptAt).not.toBeNull();
    await db.message.update({ where: { id: m.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    nextSend = () => json({ messages: [{ id: "wamid.ok" }] });
    await processRetryQueue();
    expect((await db.message.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("SENT");
    nextSend = () => json({ error: { code: 131026, message: "Undeliverable" } }, 400);
    const f = await sendTextMessage(admin, conv.id, "Outra");
    expect(f.status).toBe("FAILED");
    expect(f.errorMessage).toMatch(/Não foi possível entregar/);
  });
});

describe("modelos", () => {
  it("converte variáveis por nome para o formato da Meta e de volta; recusa variável na ponta", async () => {
    const r = toMetaFormat("Oi {nome}, sua vaga {vaga} saiu, {nome}!");
    expect(r.metaBody).toBe("Oi {{1}}, sua vaga {{2}} saiu, {{1}}!");
    expect(r.variables).toEqual(["nome", "vaga"]);
    expect(fromMetaFormat(r.metaBody, r.variables)).toBe("Oi {nome}, sua vaga {vaga} saiu, {nome}!");
    const admin = await adminActor();
    await expect(saveTemplate(admin, null, { name: "Teste", purpose: "Outro", category: "UTILITY", text: "{nome} tudo bem com você hoje" })).rejects.toBeInstanceOf(ValidationError);
  });
});
