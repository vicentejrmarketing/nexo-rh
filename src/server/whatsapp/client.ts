import "server-only";
import { db } from "@/server/db/client";
import { decryptSecret } from "@/server/crypto/secrets";

// Cliente da WhatsApp Cloud API (Graph API da Meta). Só roda no servidor.
// As credenciais vêm do banco, cifradas; o token nunca sai daqui.

export const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v25.0";
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type WaConfig = { phoneNumberId: string; wabaId: string; appId: string | null; accessToken: string; appSecret: string | null };

/** Configuração completa para enviar; null quando falta algo (o sistema mostra "Não conectado"). */
export async function loadConfig(): Promise<WaConfig | null> {
  const i = await db.whatsAppIntegration.findUnique({ where: { id: "default" } });
  if (!i?.phoneNumberId || !i.wabaId || !i.accessTokenEnc) return null;
  try {
    return {
      phoneNumberId: i.phoneNumberId, wabaId: i.wabaId, appId: i.appId,
      accessToken: decryptSecret(i.accessTokenEnc), appSecret: i.appSecretEnc ? decryptSecret(i.appSecretEnc) : null,
    };
  } catch {
    return null;
  }
}

// Erros que costumam passar sozinhos (limite de taxa, instabilidade) → vale tentar de novo.
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 80007, 130429, 131000, 131016, 133004]);
// Erros com explicação clara para quem usa o sistema.
const FRIENDLY: Record<number, string> = {
  190: "O token de acesso da Meta expirou ou é inválido. Atualize em Configurações → Integração WhatsApp.",
  131047: "Fora da janela de 24 horas: o candidato não respondeu nas últimas 24 h. Use um modelo aprovado pela Meta.",
  131026: "Não foi possível entregar: o número pode não ter WhatsApp ou não aceitou a mensagem.",
  131051: "Tipo de mensagem não suportado.",
  132000: "A quantidade de variáveis não confere com o modelo aprovado na Meta.",
  132001: "Modelo não encontrado na Meta (nome ou idioma diferente, ou ainda não aprovado).",
  132007: "O texto do modelo viola as políticas da Meta.",
  132012: "Formato das variáveis do modelo não confere com o aprovado.",
  133010: "O número de telefone da empresa ainda não está registrado na Cloud API.",
  368: "A conta foi temporariamente bloqueada pela Meta por violação de políticas.",
  131049: "A Meta não entregou para preservar a experiência do usuário (limite de mensagens de marketing). Tente mais tarde.",
};

export class MetaError extends Error {
  constructor(public code: number, message: string, public retryable: boolean, public httpStatus: number) {
    super(message);
  }
}

async function call<T>(cfg: Pick<WaConfig, "accessToken">, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${cfg.accessToken}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new MetaError(0, "Sem resposta da Meta (rede ou tempo esgotado).", true, 0);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { code?: number; message?: string; error_data?: { details?: string } } } & T;
  if (!res.ok || json.error) {
    const code = json.error?.code ?? res.status;
    const detail = json.error?.error_data?.details || json.error?.message || `HTTP ${res.status}`;
    const retryable = res.status >= 500 || res.status === 429 || RETRYABLE_CODES.has(code);
    throw new MetaError(code, FRIENDLY[code] ?? `Meta: ${detail}`, retryable, res.status);
  }
  return json;
}

const toWa = (e164: string) => e164.replace(/\D/g, "");

export type SendResult = { waMessageId: string };

export async function sendText(cfg: WaConfig, toE164: string, body: string): Promise<SendResult> {
  const r = await call<{ messages?: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: toWa(toE164), type: "text", text: { preview_url: true, body } }),
  });
  const id = r.messages?.[0]?.id;
  if (!id) throw new MetaError(0, "A Meta não devolveu o id da mensagem.", true, 200);
  return { waMessageId: id };
}

export async function sendTemplate(cfg: WaConfig, toE164: string, name: string, language: string, params: string[]): Promise<SendResult> {
  const r = await call<{ messages?: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp", to: toWa(toE164), type: "template",
      template: { name, language: { code: language }, components: params.length ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] : [] },
    }),
  });
  const id = r.messages?.[0]?.id;
  if (!id) throw new MetaError(0, "A Meta não devolveu o id da mensagem.", true, 200);
  return { waMessageId: id };
}

export async function markRead(cfg: WaConfig, waMessageId: string) {
  await call(cfg, `${cfg.phoneNumberId}/messages`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: waMessageId }) }).catch(() => {});
}

export async function phoneInfo(cfg: Pick<WaConfig, "accessToken" | "phoneNumberId">) {
  return call<{ display_phone_number?: string; verified_name?: string; quality_rating?: string; id: string }>(
    cfg, `${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
  );
}

export type MetaTemplate = { id: string; name: string; language: string; status: string; category: string; rejected_reason?: string; components?: { type: string; text?: string }[] };

export async function listMetaTemplates(cfg: WaConfig): Promise<MetaTemplate[]> {
  const out: MetaTemplate[] = [];
  let path: string | null = `${cfg.wabaId}/message_templates?fields=id,name,language,status,category,rejected_reason,components&limit=100`;
  for (let page = 0; path && page < 10; page++) {
    const r: { data: MetaTemplate[]; paging?: { next?: string } } = await call(cfg, path);
    out.push(...r.data);
    path = r.paging?.next ? r.paging.next.replace(`${BASE}/`, "") : null;
  }
  return out;
}

export async function createMetaTemplate(cfg: WaConfig, t: { name: string; language: string; category: string; body: string; examples: string[] }) {
  return call<{ id: string; status: string; category: string }>(cfg, `${cfg.wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({
      name: t.name, language: t.language, category: t.category,
      components: [{ type: "BODY", text: t.body, ...(t.examples.length ? { example: { body_text: [t.examples] } } : {}) }],
    }),
  });
}

/** Baixa uma mídia recebida (a URL da Meta é temporária e exige o token). */
export async function downloadMedia(cfg: WaConfig, mediaId: string): Promise<{ data: Buffer; mime: string }> {
  const meta = await call<{ url: string; mime_type: string }>(cfg, mediaId);
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${cfg.accessToken}` }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new MetaError(res.status, "Não foi possível baixar a mídia (pode ter expirado).", false, res.status);
  return { data: Buffer.from(await res.arrayBuffer()), mime: meta.mime_type };
}
