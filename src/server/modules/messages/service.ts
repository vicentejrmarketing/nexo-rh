import "server-only";
import type { ConversationStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { authorize, type Actor } from "@/server/authz/authorize";
import { ROLES } from "@/server/authz/catalog";
import { visibleCandidatesWhere } from "@/server/authz/scopes";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { getCompanySettings } from "@/server/modules/settings/service";
import { loadConfig, markRead, MetaError, sendTemplate, sendText } from "@/server/whatsapp/client";
import { formatDate } from "@/lib/format";
import { timeKey } from "@/lib/period";
import { isKnownVar, renderTemplate, VARIABLES, type VarKey } from "./templates";

export const WINDOW_MS = 24 * 3600 * 1000;
export const MAX_ATTEMPTS = 5;
export const CONVERSATION_STATUS_LABEL: Record<ConversationStatus, string> = {
  OPEN: "Aberta", WAITING_CANDIDATE: "Aguardando candidato", WAITING_TEAM: "Aguardando equipe", CLOSED: "Encerrada",
};

export const windowOpen = (lastInboundAt: Date | null, now = Date.now()) => !!lastInboundAt && now - lastInboundAt.getTime() < WINDOW_MS;

/** Conversas visíveis: com candidato visível ao usuário, atribuídas a ele, ou de contatos ainda não identificados. */
export function visibleConversationsWhere(actor: Actor): Prisma.ConversationWhereInput {
  if (actor.allStores) return {};
  return { OR: [{ candidate: visibleCandidatesWhere(actor) }, { assignedToId: actor.id }, { candidateId: null }] };
}

export type ConversationFilters = { q?: string; filter?: "nao-lidas" | "minhas" | "sem-responsavel" | ""; assignedToId?: string; status?: string };

export async function listConversations(actor: Actor, f: ConversationFilters = {}) {
  authorize(actor, "messages.view");
  const and: Prisma.ConversationWhereInput[] = [visibleConversationsWhere(actor)];
  const q = f.q?.trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    and.push({
      OR: [
        { candidate: { fullName: { contains: q, mode: "insensitive" } } }, { waContactName: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 4 ? [{ waContactE164: { contains: digits } }] : []),
      ],
    });
  }
  if (f.filter === "nao-lidas") and.push({ unreadCount: { gt: 0 } });
  if (f.filter === "minhas") and.push({ assignedToId: actor.id });
  if (f.filter === "sem-responsavel") and.push({ assignedToId: null });
  if (f.assignedToId) and.push({ assignedToId: f.assignedToId });
  if (f.status && f.status in CONVERSATION_STATUS_LABEL) and.push({ status: f.status as ConversationStatus });
  else and.push({ status: { not: "CLOSED" } });
  return db.conversation.findMany({
    where: { AND: and },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true, waContactE164: true, waContactName: true, lastMessageAt: true, lastMessageText: true, lastInboundAt: true, unreadCount: true, status: true,
      candidate: { select: { id: true, fullName: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
}

export async function getConversation(actor: Actor, id: string) {
  authorize(actor, "messages.view");
  const c = await db.conversation.findFirst({
    where: { AND: [{ id }, visibleConversationsWhere(actor)] },
    include: {
      assignedTo: { select: { id: true, name: true } },
      candidate: {
        select: {
          id: true, fullName: true, phoneE164: true, whatsappE164: true, email: true, city: true, optedOutAt: true, ownerId: true,
          owner: { select: { name: true } },
          processes: {
            orderBy: { lastMovedAt: "desc" }, take: 5,
            select: {
              id: true, status: true, recruiterId: true,
              job: { select: { id: true, title: true, store: { select: { name: true } } } },
              stage: { select: { key: true, name: true } }, recruiter: { select: { name: true } },
              interviews: { where: { status: "SCHEDULED" }, orderBy: { scheduledAt: "asc" }, take: 1, select: { id: true, scheduledAt: true } },
            },
          },
          consents: { where: { purpose: "WHATSAPP_CONTACT" }, orderBy: { grantedAt: "desc" }, take: 1, select: { grantedAt: true, revokedAt: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" }, take: 200,
        select: {
          id: true, direction: true, body: true, status: true, mediaType: true, mediaId: true, errorMessage: true, attempts: true, nextAttemptAt: true,
          createdAt: true, sentAt: true, deliveredAt: true, readAt: true, failedAt: true, sentBy: { select: { name: true } }, template: { select: { name: true } },
        },
      },
    },
  });
  if (!c) throw new NotFoundError("Conversa não encontrada.");
  return { conversation: { ...c, messages: c.messages.reverse() }, windowOpen: windowOpen(c.lastInboundAt), canSend: actor.permissions.has("messages.send") };
}

/** Abre (ou reaproveita) a conversa com o candidato, pelo WhatsApp (ou telefone) do cadastro. */
export async function ensureConversation(actor: Actor, candidateId: string) {
  authorize(actor, "messages.view");
  const c = await db.candidate.findFirst({
    where: { AND: [{ id: candidateId }, visibleCandidatesWhere(actor)] },
    select: { id: true, fullName: true, whatsappE164: true, phoneE164: true, ownerId: true, processes: { orderBy: { lastMovedAt: "desc" }, take: 1, select: { recruiterId: true } } },
  });
  if (!c) throw new NotFoundError("Candidato não encontrado.");
  const phone = c.whatsappE164 ?? c.phoneE164;
  if (!phone) throw new ValidationError({ phone: ["O candidato não tem WhatsApp nem telefone cadastrado."] });
  const existing = await db.conversation.findUnique({ where: { waContactE164: phone } });
  if (existing) {
    if (!existing.candidateId) await db.conversation.update({ where: { id: existing.id }, data: { candidateId: c.id } });
    return existing;
  }
  return db.conversation.create({ data: { waContactE164: phone, candidateId: c.id, assignedToId: c.processes[0]?.recruiterId ?? c.ownerId ?? actor.id } });
}

// ───────── Envio ─────────

async function assertCanMessage(actor: Actor, conversationId: string) {
  authorize(actor, "messages.send");
  const c = await db.conversation.findFirst({
    where: { AND: [{ id: conversationId }, visibleConversationsWhere(actor)] },
    include: { candidate: { select: { id: true, fullName: true, optedOutAt: true, anonymizedAt: true } } },
  });
  if (!c) throw new NotFoundError("Conversa não encontrada.");
  if (c.candidate?.optedOutAt) throw new ValidationError({ body: ["O candidato pediu para não receber mensagens. Só é possível responder se ele voltar a autorizar."] });
  if (ROLES[actor.roleKey].ownRecordsOnly && c.assignedToId && c.assignedToId !== actor.id) {
    throw new ForbiddenError("Esta conversa está com outro recrutador.");
  }
  return c;
}

const backoffMs = (attempt: number) => [60, 300, 900, 3600][Math.min(attempt - 1, 3)] * 1000;

/** Tenta enviar uma mensagem já registrada (primeira tentativa ou reenvio). */
export async function deliver(messageId: string) {
  const m = await db.message.findUnique({ where: { id: messageId }, include: { conversation: true, template: true } });
  if (!m || m.direction !== "OUTBOUND" || (m.status !== "QUEUED" && m.status !== "FAILED")) return;
  const cfg = await loadConfig();
  const attempts = m.attempts + 1;
  if (!cfg) {
    await db.message.update({ where: { id: m.id }, data: { status: "FAILED", attempts, failedAt: new Date(), errorMessage: "WhatsApp não conectado.", nextAttemptAt: null } });
    return;
  }
  try {
    const params = (m.templateParams as string[] | null) ?? [];
    const r = m.template?.metaName
      ? await sendTemplate(cfg, m.conversation.waContactE164, m.template.metaName, m.template.language, params)
      : await sendText(cfg, m.conversation.waContactE164, m.body ?? "");
    await db.message.update({ where: { id: m.id }, data: { status: "SENT", waMessageId: r.waMessageId, sentAt: new Date(), attempts, errorCode: null, errorMessage: null, nextAttemptAt: null } });
  } catch (e) {
    const err = e instanceof MetaError ? e : new MetaError(0, "Erro inesperado ao enviar.", true, 0);
    const retry = err.retryable && attempts < MAX_ATTEMPTS;
    await db.message.update({
      where: { id: m.id },
      data: {
        status: retry ? "QUEUED" : "FAILED", attempts, errorCode: String(err.code), errorMessage: err.message,
        nextAttemptAt: retry ? new Date(Date.now() + backoffMs(attempts)) : null, failedAt: retry ? null : new Date(),
      },
    });
    if (err.code === 190) await db.whatsAppIntegration.update({ where: { id: "default" }, data: { status: "ERROR", lastError: err.message } }).catch(() => {});
  }
}

/** Reenvia o que está na fila e já passou da hora (chamado ao abrir as Mensagens; sem agendador externo). */
export async function processRetryQueue(limit = 20) {
  const due = await db.message.findMany({
    where: { direction: "OUTBOUND", status: "QUEUED", nextAttemptAt: { lte: new Date() }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { nextAttemptAt: "asc" }, take: limit, select: { id: true },
  });
  for (const m of due) await deliver(m.id);
  return due.length;
}

async function record(conversationId: string, actorId: string, data: { body: string; templateId?: string; templateParams?: string[] }) {
  const now = new Date();
  const m = await db.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: { conversationId, direction: "OUTBOUND", status: "QUEUED", body: data.body, templateId: data.templateId, templateParams: data.templateParams, sentById: actorId },
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now, lastMessageText: data.body.slice(0, 200), status: "WAITING_CANDIDATE", assignedToId: undefined } });
    return msg;
  });
  await deliver(m.id);
  return db.message.findUniqueOrThrow({ where: { id: m.id } });
}

export async function sendTextMessage(actor: Actor, conversationId: string, body: string) {
  const c = await assertCanMessage(actor, conversationId);
  const text = body.trim();
  if (!text) throw new ValidationError({ body: ["Escreva a mensagem."] });
  if (text.length > 4096) throw new ValidationError({ body: ["Máximo de 4.096 caracteres."] });
  if (!windowOpen(c.lastInboundAt)) {
    throw new ValidationError({ body: ["Fora da janela de 24 horas: o candidato não escreveu nas últimas 24 h. Envie um modelo aprovado pela Meta."] });
  }
  if (!(await loadConfig())) throw new AppError("VALIDATION", "O WhatsApp não está conectado. Configure em Configurações → Integração WhatsApp.");
  if (!c.assignedToId) await db.conversation.update({ where: { id: c.id }, data: { assignedToId: actor.id } });
  return record(c.id, actor.id, { body: text });
}

/** Valores das variáveis do modelo, a partir do candidato, da vaga e da entrevista relacionados. */
export async function templateContext(actor: Actor, conversationId: string, opts: { interviewId?: string; jobId?: string } = {}) {
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { candidateId: true, waContactName: true, candidate: { select: { fullName: true } } },
  });
  const settings = await getCompanySettings();
  const site = process.env.PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  const interview = conv?.candidateId
    ? await db.interview.findFirst({
        where: opts.interviewId ? { id: opts.interviewId, candidateJob: { candidateId: conv.candidateId } } : { status: "SCHEDULED", scheduledAt: { gte: new Date() }, candidateJob: { candidateId: conv.candidateId } },
        orderBy: { scheduledAt: "asc" },
        select: { scheduledAt: true, mode: true, meetingUrl: true, location: true, store: { select: { name: true, address: true, city: true } }, candidateJob: { select: { job: { select: { title: true, slug: true } } } } },
      })
    : null;
  const proc = conv?.candidateId
    ? await db.candidateJob.findFirst({
        where: { candidateId: conv.candidateId, ...(opts.jobId ? { jobId: opts.jobId } : {}) },
        orderBy: [{ status: "asc" }, { lastMovedAt: "desc" }],
        select: { job: { select: { title: true, slug: true, store: { select: { name: true, address: true, city: true } } } } },
      })
    : null;
  const job = interview?.candidateJob.job ?? proc?.job;
  const store = interview?.store ?? proc?.job.store;
  const full = conv?.candidate?.fullName ?? conv?.waContactName ?? "";
  const values: Partial<Record<VarKey, string>> = {
    nome: full.split(" ")[0] || undefined,
    nome_completo: full || undefined,
    vaga: job?.title,
    loja: store?.name,
    endereco_loja: store ? [store.address, store.city].filter(Boolean).join(", ") || store.name : undefined,
    data: interview ? formatDate(interview.scheduledAt) : undefined,
    hora: interview ? timeKey(interview.scheduledAt) : undefined,
    local_ou_link: interview ? (interview.mode === "ONLINE" ? interview.meetingUrl ?? "link enviado em seguida" : interview.location || [interview.store.address, interview.store.city].filter(Boolean).join(", ") || interview.store.name) : undefined,
    recrutador: actor.name.split(" ")[0],
    empresa: settings.companyName || undefined,
    link_vaga: job && site ? `${site}/trabalhe-conosco/vagas/${job.slug}` : undefined,
  };
  return values;
}

export async function sendTemplateMessage(actor: Actor, conversationId: string, templateId: string, provided: Record<string, string>) {
  const c = await assertCanMessage(actor, conversationId);
  const t = await db.messageTemplate.findFirst({ where: { id: templateId, active: true } });
  if (!t) throw new ValidationError({ templateId: ["Modelo não encontrado."] });
  const open = windowOpen(c.lastInboundAt);
  if (!open && (t.approval !== "APPROVED" || !t.metaName)) {
    throw new ValidationError({ templateId: ["Fora da janela de 24 horas só é possível enviar modelos aprovados pela Meta."] });
  }
  if (!(await loadConfig())) throw new AppError("VALIDATION", "O WhatsApp não está conectado. Configure em Configurações → Integração WhatsApp.");
  const vars = (t.variables as string[] | null) ?? [];
  const missing: string[] = [];
  const values = vars.map((v) => {
    const val = (provided[v] ?? "").trim();
    if (!val) missing.push(isKnownVar(v) ? VARIABLES[v].label : v);
    return val.slice(0, 500);
  });
  if (missing.length) throw new ValidationError({ templateId: [`Preencha: ${missing.join(", ")}.`] });
  const body = renderTemplate(t.body, values);
  if (!c.assignedToId) await db.conversation.update({ where: { id: c.id }, data: { assignedToId: actor.id } });
  // Aprovado na Meta → envia como modelo (funciona fora da janela). Só local → texto livre (dentro da janela).
  return t.approval === "APPROVED" && t.metaName
    ? record(c.id, actor.id, { body, templateId: t.id, templateParams: values })
    : record(c.id, actor.id, { body });
}

export async function retryMessage(actor: Actor, messageId: string) {
  authorize(actor, "messages.send");
  const m = await db.message.findFirst({ where: { id: messageId, direction: "OUTBOUND", conversation: visibleConversationsWhere(actor) } });
  if (!m) throw new NotFoundError("Mensagem não encontrada.");
  if (m.status !== "FAILED" && m.status !== "QUEUED") throw new ValidationError({ status: ["Esta mensagem já foi enviada."] });
  await db.message.update({ where: { id: m.id }, data: { status: "QUEUED", attempts: 0, nextAttemptAt: null } });
  await deliver(m.id);
}

// ───────── Organização da conversa ─────────

export async function markConversationRead(actor: Actor, id: string) {
  const c = await db.conversation.findFirst({ where: { AND: [{ id }, visibleConversationsWhere(actor)] }, select: { id: true, unreadCount: true } });
  if (!c || c.unreadCount === 0) return;
  await db.conversation.update({ where: { id }, data: { unreadCount: 0 } });
  const last = await db.message.findFirst({ where: { conversationId: id, direction: "INBOUND", waMessageId: { not: null } }, orderBy: { createdAt: "desc" }, select: { waMessageId: true } });
  const cfg = await loadConfig();
  if (cfg && last?.waMessageId) await markRead(cfg, last.waMessageId);
}

export async function assignConversation(actor: Actor, id: string, userId: string | null) {
  authorize(actor, "messages.send");
  const c = await db.conversation.findFirst({ where: { AND: [{ id }, visibleConversationsWhere(actor)] } });
  if (!c) throw new NotFoundError("Conversa não encontrada.");
  if (ROLES[actor.roleKey].ownRecordsOnly && userId !== actor.id) throw new ForbiddenError("Você só pode assumir a conversa para si.");
  await db.conversation.update({ where: { id }, data: { assignedToId: userId } });
}

export async function setConversationStatus(actor: Actor, id: string, status: ConversationStatus) {
  authorize(actor, "messages.send");
  const c = await db.conversation.findFirst({ where: { AND: [{ id }, visibleConversationsWhere(actor)] } });
  if (!c) throw new NotFoundError("Conversa não encontrada.");
  await db.conversation.update({ where: { id }, data: { status } });
}

/** Vincula um contato não identificado a um candidato do cadastro. */
export async function linkConversationCandidate(actor: Actor, id: string, candidateId: string) {
  authorize(actor, "messages.send");
  const [c, cand] = await Promise.all([
    db.conversation.findFirst({ where: { AND: [{ id }, visibleConversationsWhere(actor)] } }),
    db.candidate.findFirst({ where: { AND: [{ id: candidateId }, visibleCandidatesWhere(actor)] }, select: { id: true, fullName: true, whatsappE164: true } }),
  ]);
  if (!c || !cand) throw new NotFoundError("Conversa ou candidato não encontrado.");
  await db.$transaction(async (tx) => {
    await tx.conversation.update({ where: { id }, data: { candidateId: cand.id } });
    if (!cand.whatsappE164) await tx.candidate.update({ where: { id: cand.id }, data: { whatsappE164: c.waContactE164 } });
    await audit(tx, { actorId: actor.id, action: "conversation.link", entityType: "Conversation", entityId: id, summary: `Vinculou a conversa ${c.waContactE164} a ${cand.fullName}` });
  });
}

/** O candidato pediu para voltar a receber mensagens (registrado por quem atendeu). */
export async function reactivateMessaging(actor: Actor, candidateId: string, ip?: string | null) {
  authorize(actor, "messages.send");
  const cand = await db.candidate.findFirst({ where: { AND: [{ id: candidateId }, visibleCandidatesWhere(actor)] }, select: { id: true, fullName: true } });
  if (!cand) throw new NotFoundError("Candidato não encontrado.");
  const settings = await getCompanySettings();
  await db.$transaction(async (tx) => {
    await tx.candidate.update({ where: { id: cand.id }, data: { optedOutAt: null } });
    await tx.candidateConsent.create({ data: { candidateId: cand.id, purpose: "WHATSAPP_CONTACT", policyVersion: settings.privacyVersion ?? "sem-versao", source: "MANUAL", ipAddress: ip ?? null } });
    await audit(tx, { actorId: actor.id, action: "privacy.whatsapp_optin", entityType: "Candidate", entityId: cand.id, ipAddress: ip, summary: `Registrou que ${cand.fullName} voltou a autorizar mensagens no WhatsApp` });
  });
}

export async function unreadTotal(actor: Actor) {
  if (!actor.permissions.has("messages.view")) return 0;
  const r = await db.conversation.aggregate({ where: visibleConversationsWhere(actor), _sum: { unreadCount: true } });
  return r._sum.unreadCount ?? 0;
}
