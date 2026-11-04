import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { loadConfig, sendText } from "./client";
import { dayKey } from "@/lib/period";

// Webhook da WhatsApp Cloud API: mensagens recebidas e status de envio/entrega/leitura.
// Cada evento é gravado com uma chave única antes de ser processado: se a Meta reenviar
// o mesmo evento, ele é ignorado (controle de duplicidade). Falhas ficam registradas e são
// reprocessadas depois.

/** Confere a assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo com o App Secret). */
export function validSignature(raw: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(raw, "utf8").digest();
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type WaContact = { wa_id: string; profile?: { name?: string } };
type WaMessage = {
  id: string; from: string; timestamp: string; type: string;
  text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
  image?: { id: string; mime_type?: string; caption?: string }; document?: { id: string; mime_type?: string; caption?: string; filename?: string };
  audio?: { id: string; mime_type?: string }; video?: { id: string; mime_type?: string; caption?: string }; sticker?: { id: string; mime_type?: string };
  location?: { latitude: number; longitude: number; name?: string };
  context?: { id: string };
};
type WaStatus = { id: string; status: "sent" | "delivered" | "read" | "failed"; timestamp: string; recipient_id: string; errors?: { code: number; title?: string; message?: string; error_data?: { details?: string } }[] };
type ChangeValue = { messaging_product?: string; metadata?: { phone_number_id?: string }; contacts?: WaContact[]; messages?: WaMessage[]; statuses?: WaStatus[] };
export type WebhookPayload = { object?: string; entry?: { id: string; changes?: { field: string; value: ChangeValue }[] }[] };

const OPT_OUT = new Set(["sair", "parar", "pare", "cancelar", "stop", "descadastrar", "nao quero mais mensagens", "não quero mais mensagens"]);

function describe(m: WaMessage): { body: string | null; mediaType: string | null; mediaId: string | null; mediaMime: string | null } {
  switch (m.type) {
    case "text": return { body: m.text?.body ?? "", mediaType: null, mediaId: null, mediaMime: null };
    case "button": return { body: m.button?.text ?? "", mediaType: null, mediaId: null, mediaMime: null };
    case "interactive": return { body: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "", mediaType: null, mediaId: null, mediaMime: null };
    case "image": return { body: m.image?.caption ?? null, mediaType: "image", mediaId: m.image?.id ?? null, mediaMime: m.image?.mime_type ?? null };
    case "document": return { body: m.document?.caption ?? m.document?.filename ?? null, mediaType: "document", mediaId: m.document?.id ?? null, mediaMime: m.document?.mime_type ?? null };
    case "audio": return { body: null, mediaType: "audio", mediaId: m.audio?.id ?? null, mediaMime: m.audio?.mime_type ?? null };
    case "video": return { body: m.video?.caption ?? null, mediaType: "video", mediaId: m.video?.id ?? null, mediaMime: m.video?.mime_type ?? null };
    case "sticker": return { body: null, mediaType: "sticker", mediaId: m.sticker?.id ?? null, mediaMime: m.sticker?.mime_type ?? null };
    case "location": return { body: `Localização: ${m.location?.name ?? ""} https://maps.google.com/?q=${m.location?.latitude},${m.location?.longitude}`.trim(), mediaType: null, mediaId: null, mediaMime: null };
    default: return { body: `[mensagem do tipo ${m.type} não suportada]`, mediaType: null, mediaId: null, mediaMime: null };
  }
}

const preview = (d: ReturnType<typeof describe>) =>
  (d.body || ({ image: "📷 Imagem", document: "📄 Documento", audio: "🎤 Áudio", video: "🎬 Vídeo", sticker: "Figurinha" } as Record<string, string>)[d.mediaType ?? ""] || "Mensagem").slice(0, 200);

async function processInbound(m: WaMessage, contact?: WaContact) {
  const e164 = `+${m.from.replace(/\D/g, "")}`;
  const at = new Date(Number(m.timestamp) * 1000 || Date.now());
  const d = describe(m);
  // Candidato com esse número (WhatsApp ou telefone), mais antigo primeiro.
  const candidate = await db.candidate.findFirst({
    where: { anonymizedAt: null, OR: [{ whatsappE164: e164 }, { phoneE164: e164 }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, fullName: true, ownerId: true, optedOutAt: true, processes: { orderBy: { lastMovedAt: "desc" }, take: 1, select: { recruiterId: true } } },
  });
  const conv = await db.conversation.upsert({
    where: { waContactE164: e164 },
    update: { waContactName: contact?.profile?.name ?? undefined, ...(candidate ? { candidateId: candidate.id } : {}) },
    create: {
      waContactE164: e164, waContactName: contact?.profile?.name ?? null, candidateId: candidate?.id ?? null,
      assignedToId: candidate?.processes[0]?.recruiterId ?? candidate?.ownerId ?? null,
    },
  });
  try {
    await db.message.create({
      data: { conversationId: conv.id, direction: "INBOUND", waMessageId: m.id, status: "RECEIVED", body: d.body, mediaType: d.mediaType, mediaId: d.mediaId, mediaMime: d.mediaMime, createdAt: at },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return; // já registrada
    throw e;
  }
  await db.conversation.update({
    where: { id: conv.id },
    data: { lastInboundAt: at, lastMessageAt: at, lastMessageText: preview(d), unreadCount: { increment: 1 }, status: "WAITING_TEAM" },
  });
  if (conv.assignedToId) {
    await db.notification.upsert({
      where: { userId_dedupeKey: { userId: conv.assignedToId, dedupeKey: `conv:${conv.id}:${dayKey(at)}` } },
      update: { body: preview(d).slice(0, 120), readAt: null, createdAt: new Date() },
      create: { userId: conv.assignedToId, type: "NEW_MESSAGE", title: `Nova mensagem de ${candidate?.fullName ?? contact?.profile?.name ?? e164}`, body: preview(d).slice(0, 120), link: `/mensagens?c=${conv.id}`, dedupeKey: `conv:${conv.id}:${dayKey(at)}` },
    }).catch(() => {});
  }

  // Descadastro: o candidato pediu para não receber mais mensagens.
  const normalized = (d.body ?? "").trim().toLowerCase().replace(/[.!]+$/, "");
  if (candidate && !candidate.optedOutAt && OPT_OUT.has(normalized)) {
    await db.$transaction(async (tx) => {
      await tx.candidate.update({ where: { id: candidate.id }, data: { optedOutAt: new Date() } });
      await tx.candidateConsent.updateMany({ where: { candidateId: candidate.id, purpose: "WHATSAPP_CONTACT", revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(tx, { actorId: null, action: "privacy.whatsapp_optout", entityType: "Candidate", entityId: candidate.id, summary: `${candidate.fullName} pediu para não receber mensagens no WhatsApp` });
    });
    const cfg = await loadConfig();
    if (cfg) {
      const text = "Pronto: você não receberá mais mensagens nossas por aqui. Se mudar de ideia, é só nos avisar.";
      const r = await sendText(cfg, e164, text).catch(() => null);
      await db.message.create({ data: { conversationId: conv.id, direction: "OUTBOUND", status: r ? "SENT" : "FAILED", body: text, waMessageId: r?.waMessageId, sentAt: r ? new Date() : null, attempts: 1 } });
    }
  }
}

const RANK = { QUEUED: 0, FAILED: 0, SENT: 1, DELIVERED: 2, READ: 3, RECEIVED: 0 } as const;

async function processStatus(s: WaStatus) {
  const m = await db.message.findUnique({ where: { waMessageId: s.id } });
  if (!m) return; // mensagem enviada fora do sistema
  const at = new Date(Number(s.timestamp) * 1000 || Date.now());
  if (s.status === "failed") {
    const err = s.errors?.[0];
    await db.message.update({ where: { id: m.id }, data: { status: "FAILED", failedAt: at, errorCode: err ? String(err.code) : null, errorMessage: err?.error_data?.details || err?.message || err?.title || "Falha informada pela Meta." } });
    if (m.sentById) {
      await db.notification.create({ data: { userId: m.sentById, type: "MESSAGE_FAILED", title: "Mensagem não entregue no WhatsApp", body: (err?.error_data?.details || err?.title || "").slice(0, 120) || null, link: `/mensagens?c=${m.conversationId}` } }).catch(() => {});
    }
    return;
  }
  const next = s.status === "read" ? "READ" : s.status === "delivered" ? "DELIVERED" : "SENT";
  if (RANK[next] <= RANK[m.status]) return; // status chega fora de ordem: nunca regride
  await db.message.update({
    where: { id: m.id },
    data: { status: next, ...(next === "DELIVERED" ? { deliveredAt: at } : next === "READ" ? { readAt: at, deliveredAt: m.deliveredAt ?? at } : { sentAt: m.sentAt ?? at }) },
  });
}

async function runEvent(id: string) {
  const ev = await db.webhookEvent.findUnique({ where: { id } });
  if (!ev || ev.processedAt) return;
  try {
    const p = ev.payload as { kind: "message"; message: WaMessage; contact?: WaContact } | { kind: "status"; status: WaStatus };
    if (p.kind === "message") await processInbound(p.message, p.contact);
    else await processStatus(p.status);
    await db.webhookEvent.update({ where: { id }, data: { processedAt: new Date(), attempts: { increment: 1 }, error: null } });
  } catch (e) {
    console.error("[webhook-whatsapp]", e);
    await db.webhookEvent.update({ where: { id }, data: { attempts: { increment: 1 }, error: e instanceof Error ? e.message.slice(0, 500) : "erro" } });
  }
}

/** Grava cada evento (ignorando duplicados) e processa. Devolve quantos eram novos. */
export async function handleWebhook(payload: WebhookPayload) {
  if (payload.object !== "whatsapp_business_account") return 0;
  const toRun: string[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const v = change.value;
      const items: { key: string; type: string; data: object }[] = [
        ...(v.messages ?? []).map((m) => ({ key: `msg:${m.id}`, type: "message", data: { kind: "message", message: m, contact: v.contacts?.find((c) => c.wa_id === m.from) ?? v.contacts?.[0] } })),
        ...(v.statuses ?? []).map((s) => ({ key: `status:${s.id}:${s.status}`, type: `status.${s.status}`, data: { kind: "status", status: s } })),
      ];
      for (const it of items) {
        try {
          const ev = await db.webhookEvent.create({ data: { eventKey: it.key, eventType: it.type, payload: it.data as Prisma.InputJsonValue } });
          toRun.push(ev.id);
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // duplicado
          throw e;
        }
      }
    }
  }
  // Mensagens antes de status (um "lido" pode chegar junto com a resposta).
  for (const id of toRun) await runEvent(id);
  if (toRun.length) await db.whatsAppIntegration.update({ where: { id: "default" }, data: { lastWebhookAt: new Date() } }).catch(() => {});
  return toRun.length;
}

/** Reprocessa eventos que falharam (até 5 tentativas). */
export async function reprocessPendingEvents(limit = 20) {
  const pending = await db.webhookEvent.findMany({ where: { processedAt: null, attempts: { lt: 5 }, receivedAt: { lt: new Date(Date.now() - 30000) } }, orderBy: { receivedAt: "asc" }, take: limit, select: { id: true } });
  for (const e of pending) await runEvent(e.id);
  return pending.length;
}
