import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { authorize, type Actor } from "@/server/authz/authorize";
import { AppError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/modules/users/schemas";
import { encryptionReady, encryptSecret, sha256Hex, MissingKeyError } from "@/server/crypto/secrets";
import { MetaError, phoneInfo, loadConfig } from "./client";

// Credenciais da Meta: IDs em claro (não são segredo), token e App Secret cifrados,
// Verify Token só como hash (é mostrado uma única vez, ao ser gerado).

const ids = z.string().trim().regex(/^\d{5,25}$/, "Use apenas os números do ID.");
const schema = z.object({
  appId: z.union([z.literal(""), ids]).optional().transform((v) => v || null),
  wabaId: ids,
  phoneNumberId: ids,
  accessToken: z.string().trim().max(1000).optional().transform((v) => v || null),
  appSecret: z.string().trim().max(200).optional().transform((v) => v || null),
});

export async function integrationStatus() {
  const i = await db.whatsAppIntegration.findUnique({ where: { id: "default" } });
  return {
    status: i?.status ?? "NOT_CONNECTED",
    appId: i?.appId ?? null, wabaId: i?.wabaId ?? null, phoneNumberId: i?.phoneNumberId ?? null,
    displayPhone: i?.displayPhone ?? null, verifiedName: i?.verifiedName ?? null, qualityRating: i?.qualityRating ?? null,
    accessTokenLast4: i?.accessTokenLast4 ?? null, hasAppSecret: !!i?.appSecretEnc, hasVerifyToken: !!i?.verifyTokenHash,
    lastCheckedAt: i?.lastCheckedAt ?? null, lastError: i?.lastError ?? null, lastWebhookAt: i?.lastWebhookAt ?? null,
    encryptionReady: encryptionReady(),
  };
}

export async function saveCredentials(actor: Actor, raw: z.input<typeof schema>, ip?: string | null) {
  authorize(actor, "integrations.manage");
  if (!encryptionReady()) throw new MissingKeyError();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const current = await db.whatsAppIntegration.findUnique({ where: { id: "default" } });
  if (!d.accessToken && !current?.accessTokenEnc) throw new ValidationError({ accessToken: ["Informe o token de acesso."] });
  if (d.accessToken && d.accessToken.length < 50) throw new ValidationError({ accessToken: ["Token muito curto: cole o token permanente completo."] });
  if (!d.appSecret && !current?.appSecretEnc) throw new ValidationError({ appSecret: ["Informe o App Secret (usado para validar o webhook)."] });
  const data = {
    appId: d.appId, wabaId: d.wabaId, phoneNumberId: d.phoneNumberId,
    ...(d.accessToken ? { accessTokenEnc: encryptSecret(d.accessToken), accessTokenLast4: d.accessToken.slice(-4) } : {}),
    ...(d.appSecret ? { appSecretEnc: encryptSecret(d.appSecret) } : {}),
    status: "NOT_CONNECTED" as const, lastError: null,
  };
  await db.$transaction(async (tx) => {
    await tx.whatsAppIntegration.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
    await audit(tx, {
      actorId: actor.id, action: "integration.whatsapp.save", entityType: "WhatsAppIntegration", ipAddress: ip,
      summary: `Atualizou as credenciais do WhatsApp${d.accessToken ? " (novo token)" : ""}${d.appSecret ? " (novo App Secret)" : ""}`,
    });
  });
  return testConnection(actor, ip);
}

/** Consulta o número na Meta: confirma que token e Phone Number ID funcionam. */
export async function testConnection(actor: Actor, ip?: string | null) {
  authorize(actor, "integrations.manage");
  const cfg = await loadConfig();
  if (!cfg) throw new AppError("VALIDATION", "Cadastre as credenciais antes de testar.");
  const now = new Date();
  try {
    const info = await phoneInfo(cfg);
    await db.whatsAppIntegration.update({
      where: { id: "default" },
      data: { status: "CONNECTED", displayPhone: info.display_phone_number ?? null, verifiedName: info.verified_name ?? null, qualityRating: info.quality_rating ?? null, lastCheckedAt: now, lastError: null },
    });
    await audit(db, { actorId: actor.id, action: "integration.whatsapp.test", entityType: "WhatsAppIntegration", ipAddress: ip, summary: `Testou a conexão com o WhatsApp: conectado (${info.display_phone_number ?? "número"})` });
    return { ok: true as const, displayPhone: info.display_phone_number ?? null };
  } catch (e) {
    const message = e instanceof MetaError ? e.message : "Não foi possível falar com a Meta.";
    await db.whatsAppIntegration.update({ where: { id: "default" }, data: { status: "ERROR", lastCheckedAt: now, lastError: message } });
    return { ok: false as const, message };
  }
}

/** Gera um novo Verify Token. O valor só é mostrado agora; guardamos apenas o hash. */
export async function generateVerifyToken(actor: Actor, ip?: string | null) {
  authorize(actor, "integrations.manage");
  const token = `nexo_${randomBytes(24).toString("base64url")}`;
  await db.whatsAppIntegration.upsert({ where: { id: "default" }, update: { verifyTokenHash: sha256Hex(token) }, create: { id: "default", verifyTokenHash: sha256Hex(token) } });
  await audit(db, { actorId: actor.id, action: "integration.whatsapp.verify_token", entityType: "WhatsAppIntegration", ipAddress: ip, summary: "Gerou um novo Verify Token do webhook do WhatsApp" });
  return token;
}

export async function disconnect(actor: Actor, ip?: string | null) {
  authorize(actor, "integrations.manage");
  await db.whatsAppIntegration.update({
    where: { id: "default" },
    data: { accessTokenEnc: null, accessTokenLast4: null, appSecretEnc: null, verifyTokenHash: null, status: "NOT_CONNECTED", lastError: null, displayPhone: null, verifiedName: null, qualityRating: null },
  });
  await audit(db, { actorId: actor.id, action: "integration.whatsapp.disconnect", entityType: "WhatsAppIntegration", ipAddress: ip, summary: "Desconectou o WhatsApp (credenciais apagadas)" });
}
