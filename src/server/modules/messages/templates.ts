import "server-only";
import { z } from "zod";
import type { TemplateApproval } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { authorize, type Actor } from "@/server/authz/authorize";
import { AppError, NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/modules/users/schemas";
import { createMetaTemplate, listMetaTemplates, loadConfig, MetaError } from "@/server/whatsapp/client";
import { slugify } from "@/lib/text";

// Modelos de mensagem. O texto é escrito com variáveis por nome — {nome}, {vaga}... — e convertido
// para o formato da Meta ({{1}}, {{2}}...) na hora de enviar para aprovação e de disparar.

export const VARIABLES = {
  nome: { label: "Primeiro nome do candidato", example: "Ana" },
  nome_completo: { label: "Nome completo", example: "Ana Souza" },
  vaga: { label: "Vaga", example: "Vendedor(a) de Loja" },
  loja: { label: "Loja", example: "Loja Centro" },
  endereco_loja: { label: "Endereço da loja", example: "Rua XV de Novembro, 100" },
  data: { label: "Data da entrevista", example: "10/11/2026" },
  hora: { label: "Horário da entrevista", example: "14:30" },
  local_ou_link: { label: "Link ou local da entrevista", example: "https://meet.google.com/abc-defg-hij" },
  recrutador: { label: "Nome de quem envia", example: "Carla" },
  empresa: { label: "Nome da empresa", example: "Nossa empresa" },
  link_vaga: { label: "Link da vaga no site", example: "https://exemplo.com/trabalhe-conosco/vagas/vendedor" },
} as const;
export type VarKey = keyof typeof VARIABLES;
export const isKnownVar = (k: string): k is VarKey => k in VARIABLES;

export const APPROVAL_LABEL: Record<TemplateApproval, string> = { LOCAL_ONLY: "Só no sistema", PENDING: "Em análise na Meta", APPROVED: "Aprovado pela Meta", REJECTED: "Recusado pela Meta" };
export const PURPOSES = ["Convocação para entrevista", "Lembrete de entrevista", "Confirmação de inscrição", "Informações da vaga", "Aprovação", "Reprovação", "Outro"] as const;

/** "{nome}, sua entrevista..." → { metaBody: "{{1}}, sua entrevista...", variables: ["nome"] } */
export function toMetaFormat(text: string) {
  const variables: string[] = [];
  const metaBody = text.replace(/\{([a-z_0-9]+)\}/gi, (_, raw: string) => {
    const k = raw.toLowerCase();
    let i = variables.indexOf(k);
    if (i < 0) i = variables.push(k) - 1;
    return `{{${i + 1}}}`;
  });
  return { metaBody, variables };
}

/** Volta do formato da Meta para o formato com nomes. */
export function fromMetaFormat(metaBody: string, variables: string[]) {
  return metaBody.replace(/\{\{(\d+)\}\}/g, (_, n: string) => `{${variables[Number(n) - 1] ?? `texto${n}`}}`);
}

export function renderTemplate(metaBody: string, values: string[]) {
  return metaBody.replace(/\{\{(\d+)\}\}/g, (_, n: string) => values[Number(n) - 1] ?? "");
}

const SUGGESTED = [
  { purpose: "Convocação para entrevista", name: "Convocação para entrevista", text: "Olá, {nome}! Aqui é {recrutador}, da {empresa}. Gostaríamos de convidar você para uma entrevista para a vaga de {vaga}, no dia {data} às {hora}. Local ou link: {local_ou_link}. Você confirma presença?" },
  { purpose: "Lembrete de entrevista", name: "Lembrete de entrevista", text: "Olá, {nome}! Passando para lembrar da sua entrevista para {vaga} no dia {data} às {hora}. Local ou link: {local_ou_link}. Qualquer imprevisto, é só responder esta mensagem." },
  { purpose: "Confirmação de inscrição", name: "Confirmação de inscrição", text: "Olá, {nome}! Recebemos sua inscrição para a vaga de {vaga} na {loja}. Nossa equipe vai analisar seu perfil e retornar por aqui." },
  { purpose: "Informações da vaga", name: "Informações da vaga", text: "Olá, {nome}! Temos uma vaga de {vaga} na {loja} que combina com seu perfil. Veja os detalhes e candidate-se pelo link {link_vaga} — esperamos você!" },
  { purpose: "Aprovação", name: "Aprovação no processo", text: "Parabéns, {nome}! Você foi aprovado(a) no processo seletivo para {vaga}. Em breve entraremos em contato com os próximos passos." },
  { purpose: "Reprovação", name: "Retorno do processo seletivo", text: "Olá, {nome}. Agradecemos sua participação no processo para {vaga}. Desta vez seguiremos com outro perfil, mas seu currículo continua no nosso banco de talentos para novas oportunidades." },
];

const schema = z.object({
  name: z.string().trim().min(3, "Dê um nome ao modelo.").max(60),
  purpose: z.string().trim().min(2, "Escolha a finalidade.").max(60),
  category: z.enum(["UTILITY", "MARKETING"], "Escolha a categoria."),
  text: z
    .string()
    .trim()
    .min(10, "Escreva o texto da mensagem.")
    .max(1024, "Máximo de 1.024 caracteres (limite da Meta).")
    .refine((t) => !/\{\s*\}/.test(t), "Há uma variável vazia: use {nome}, {vaga}...")
    .refine((t) => !/^\s*\{[a-z_0-9]+\}|\{[a-z_0-9]+\}\s*[.!?]?\s*$/i.test(t), "A Meta não aceita variável no começo ou no fim do texto."),
});

export async function listTemplates(opts: { activeOnly?: boolean } = {}) {
  const rows = await db.messageTemplate.findMany({ where: opts.activeOnly ? { active: true } : {}, orderBy: [{ active: "desc" }, { purpose: "asc" }, { name: "asc" }] });
  return rows.map((t) => ({ ...t, vars: (t.variables as string[] | null) ?? [], text: fromMetaFormat(t.body, (t.variables as string[] | null) ?? []) }));
}

export async function saveTemplate(actor: Actor, id: string | null, raw: z.input<typeof schema>) {
  authorize(actor, "templates.manage");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const { metaBody, variables } = toMetaFormat(d.text);
  const unknown = variables.filter((v) => !isKnownVar(v));
  if (unknown.length > 3) throw new ValidationError({ text: [`Variáveis não reconhecidas: ${unknown.map((u) => `{${u}}`).join(", ")}.`] });
  const before = id ? await db.messageTemplate.findUnique({ where: { id } }) : null;
  if (id && !before) throw new NotFoundError("Modelo não encontrado.");
  const textChanged = !before || before.body !== metaBody || before.category !== d.category;
  const t = await db.$transaction(async (tx) => {
    const saved = before
      ? await tx.messageTemplate.update({
          where: { id: before.id },
          data: {
            name: d.name, purpose: d.purpose, category: d.category, body: metaBody, variables, updatedById: actor.id,
            // Texto mudou: o aprovado na Meta não vale mais; ao reenviar, sai com um nome novo.
            ...(textChanged && before.approval !== "LOCAL_ONLY" ? { approval: "LOCAL_ONLY" as const, metaName: null, rejectionReason: null } : {}),
          },
        })
      : await tx.messageTemplate.create({
          data: { key: `${slugify(d.name).replace(/-/g, "_").slice(0, 40)}_${Date.now().toString(36)}`, name: d.name, purpose: d.purpose, category: d.category, body: metaBody, variables, updatedById: actor.id },
        });
    await audit(tx, { actorId: actor.id, action: before ? "template.update" : "template.create", entityType: "MessageTemplate", entityId: saved.id, summary: `${before ? "Editou" : "Criou"} o modelo de mensagem ${saved.name}` });
    return saved;
  });
  return t;
}

export async function setTemplateActive(actor: Actor, id: string, active: boolean) {
  authorize(actor, "templates.manage");
  await db.messageTemplate.update({ where: { id }, data: { active, updatedById: actor.id } });
}

export async function createSuggestedTemplates(actor: Actor) {
  authorize(actor, "templates.manage");
  const existing = new Set((await db.messageTemplate.findMany({ select: { purpose: true } })).map((t) => t.purpose));
  let n = 0;
  for (const s of SUGGESTED) {
    if (existing.has(s.purpose)) continue;
    await saveTemplate(actor, null, { name: s.name, purpose: s.purpose, category: "UTILITY", text: s.text });
    n++;
  }
  return n;
}

function metaNameFor(t: { key: string }) {
  return `nexo_${t.key}`.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 512);
}

/** Envia o modelo para análise da Meta (exemplos das variáveis são obrigatórios). */
export async function submitTemplate(actor: Actor, id: string) {
  authorize(actor, "templates.manage");
  const cfg = await loadConfig();
  if (!cfg) throw new AppError("VALIDATION", "Conecte o WhatsApp em Configurações → Integração WhatsApp antes de enviar modelos para a Meta.");
  const t = await db.messageTemplate.findUnique({ where: { id } });
  if (!t) throw new NotFoundError("Modelo não encontrado.");
  if (t.approval === "PENDING" || t.approval === "APPROVED") throw new ValidationError({ approval: ["Este modelo já foi enviado para a Meta."] });
  const vars = (t.variables as string[] | null) ?? [];
  const name = t.approval === "REJECTED" ? `${metaNameFor(t)}_${Date.now().toString(36)}` : metaNameFor(t);
  try {
    const r = await createMetaTemplate(cfg, { name, language: t.language, category: t.category, body: t.body, examples: vars.map((v) => (isKnownVar(v) ? VARIABLES[v].example : "texto")) });
    const approval: TemplateApproval = r.status === "APPROVED" ? "APPROVED" : r.status === "REJECTED" ? "REJECTED" : "PENDING";
    await db.messageTemplate.update({ where: { id }, data: { metaName: name, approval, rejectionReason: null, lastSyncedAt: new Date(), updatedById: actor.id } });
    await audit(db, { actorId: actor.id, action: "template.submit", entityType: "MessageTemplate", entityId: id, summary: `Enviou o modelo ${t.name} para aprovação da Meta` });
    return approval;
  } catch (e) {
    if (e instanceof MetaError) throw new AppError("VALIDATION", e.message);
    throw e;
  }
}

/** Atualiza o status de aprovação e importa modelos aprovados criados direto na Meta. */
export async function syncTemplates(actor: Actor) {
  authorize(actor, "templates.manage");
  const cfg = await loadConfig();
  if (!cfg) throw new AppError("VALIDATION", "Conecte o WhatsApp antes de sincronizar os modelos.");
  let remote;
  try {
    remote = await listMetaTemplates(cfg);
  } catch (e) {
    if (e instanceof MetaError) throw new AppError("VALIDATION", e.message);
    throw e;
  }
  const local = await db.messageTemplate.findMany();
  let updated = 0, imported = 0;
  const now = new Date();
  for (const r of remote) {
    const approval: TemplateApproval = r.status === "APPROVED" ? "APPROVED" : r.status === "REJECTED" ? "REJECTED" : r.status === "PENDING" || r.status === "IN_APPEAL" ? "PENDING" : "LOCAL_ONLY";
    const match = local.find((l) => l.metaName === r.name && l.language === r.language);
    if (match) {
      await db.messageTemplate.update({ where: { id: match.id }, data: { approval, rejectionReason: r.rejected_reason && r.rejected_reason !== "NONE" ? r.rejected_reason : null, lastSyncedAt: now } });
      updated++;
    } else if (approval === "APPROVED" && (r.category === "UTILITY" || r.category === "MARKETING")) {
      const body = r.components?.find((c) => c.type === "BODY")?.text;
      if (!body) continue;
      const count = new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;
      await db.messageTemplate.create({
        data: {
          key: `meta_${r.name}_${r.language}`.slice(0, 80), name: r.name.replace(/_/g, " "), purpose: "Outro", body, language: r.language,
          category: r.category, metaName: r.name, approval, variables: Array.from({ length: count }, (_, i) => `texto${i + 1}`), lastSyncedAt: now, updatedById: actor.id,
        },
      }).catch(() => null);
      imported++;
    }
  }
  return { updated, imported };
}
