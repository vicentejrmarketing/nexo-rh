import "server-only";
import type { DispatchStatus, Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { authorize, type Actor } from "@/server/authz/authorize";
import { ROLES } from "@/server/authz/catalog";
import { visibleJobsWhere } from "@/server/authz/scopes";
import { NotFoundError, ValidationError } from "@/server/errors";
import { getCompanySettings } from "@/server/modules/settings/service";
import { isKnownVar, renderTemplate, saveTemplate, VARIABLES, type VarKey } from "@/server/modules/messages/templates";
import { formatDate } from "@/lib/format";
import { timeKey } from "@/lib/period";
import { digitsOnly } from "@/lib/phone";

// Mensagens automáticas em modo "1 clique" (custo zero):
// eventos do processo seletivo viram itens na fila, com o texto pronto. O recrutador clica,
// o WhatsApp abre com a mensagem e o envio fica registrado. Cada evento gera no máximo um item
// por candidatura (chave única). O mesmo motor poderá enviar pela API oficial no futuro.

type Default = { event: string; name: string; sort: number; enabled?: boolean; offsetMinutes?: number; text: string; required: VarKey[] };

export const DEFAULT_RULES: Default[] = [
  { event: "stage:applied", name: "Inscrição recebida", sort: 1, required: ["nome", "vaga"], text: "Olá, {nome}! Recebemos sua candidatura para a vaga de {vaga} na {loja}. Obrigado pelo interesse! Nossa equipe vai analisar seu perfil e retornar por aqui." },
  { event: "stage:contacted", name: "Contato iniciado", sort: 2, required: ["nome", "vaga"], text: "Olá, {nome}! Aqui é {recrutador}, da equipe de recrutamento. Gostaríamos de conversar com você sobre a vaga de {vaga}. Podemos falar por aqui?" },
  { event: "interview:online", name: "Entrevista online agendada", sort: 3, required: ["nome", "vaga", "data", "horario", "link"], text: "Olá, {nome}! Sua entrevista online para a vaga de {vaga} está marcada para {data} às {horario}. Link de acesso: {link}. Por favor, confirme sua presença respondendo esta mensagem." },
  { event: "interview:in_person", name: "Entrevista presencial agendada", sort: 4, required: ["nome", "vaga", "data", "horario", "endereco"], text: "Olá, {nome}! Sua entrevista presencial para a vaga de {vaga} está marcada para {data} às {horario}, no endereço {endereco}. Por favor, confirme sua presença respondendo esta mensagem." },
  { event: "interview:rescheduled", name: "Entrevista reagendada", sort: 5, required: ["nome", "vaga", "data", "horario", "local_ou_link"], text: "Olá, {nome}! Sua entrevista para a vaga de {vaga} foi reagendada para {data} às {horario}. Local ou link: {local_ou_link}. Qualquer dúvida, é só responder." },
  { event: "interview:canceled", name: "Entrevista cancelada", sort: 6, required: ["nome", "vaga", "data", "horario"], text: "Olá, {nome}. A entrevista para a vaga de {vaga} marcada para {data} às {horario} foi cancelada. Em breve entraremos em contato sobre os próximos passos." },
  { event: "reminder:1440", name: "Lembrete 24 horas antes", sort: 7, offsetMinutes: 1440, required: ["nome", "vaga", "data", "horario", "local_ou_link"], text: "Olá, {nome}! Lembrete: amanhã, {data}, às {horario}, você tem entrevista para a vaga de {vaga}. Local ou link: {local_ou_link}. Até lá!" },
  { event: "reminder:60", name: "Lembrete 1 hora antes", sort: 8, offsetMinutes: 60, required: ["nome", "horario", "local_ou_link"], text: "Olá, {nome}! Sua entrevista começa às {horario}. Local ou link: {local_ou_link}. Boa sorte!" },
  { event: "stage:trial", name: "Em teste", sort: 9, required: ["nome", "vaga"], text: "Olá, {nome}! Ótima notícia: você avançou para a etapa de teste da vaga de {vaga}. Em seguida enviaremos as orientações por aqui." },
  { event: "stage:approved", name: "Aprovado", sort: 10, required: ["nome", "vaga"], text: "Parabéns, {nome}! Você foi aprovado(a) no processo seletivo para a vaga de {vaga}. Em breve falaremos sobre os próximos passos." },
  { event: "stage:hired", name: "Contratado", sort: 11, required: ["nome", "vaga"], text: "Seja muito bem-vindo(a), {nome}! Sua contratação para a vaga de {vaga} na {loja} foi confirmada. Vamos combinar por aqui os documentos e o primeiro dia." },
  { event: "stage:rejected", name: "Reprovado", sort: 12, required: ["nome", "vaga"], text: "Olá, {nome}. Agradecemos muito sua participação no processo para a vaga de {vaga}. Desta vez seguiremos com outro perfil, mas seu cadastro continua conosco para novas oportunidades." },
  { event: "stage:withdrawn", name: "Desistência", sort: 13, enabled: false, required: ["nome", "vaga"], text: "Olá, {nome}. Registramos sua desistência do processo para a vaga de {vaga}. Obrigado pelo retorno e conte conosco no futuro." },
];

/** Etapas de entrevista: a mensagem com data/hora/link sai pela entrevista, não pela etapa. */
const INTERVIEW_STAGES = new Set(["online_interview", "onsite_interview"]);

export const DISPATCH_STATUS_LABEL: Record<DispatchStatus, string> = {
  PENDING: "Para enviar", BLOCKED: "Falta informação", SENT: "Enviada", SKIPPED: "Não enviada", CANCELED: "Cancelada",
};

/** Cria as regras e os textos padrão na primeira vez (idempotente). */
export async function ensureDefaultRules(actor?: Actor | null) {
  const existing = new Set((await db.automationRule.findMany({ select: { event: true } })).map((r) => r.event));
  const missing = DEFAULT_RULES.filter((d) => !existing.has(d.event) && !(d.event.startsWith("reminder:") && [...existing].some((e) => e.startsWith("reminder:"))));
  if (!missing.length) return;
  const systemActor = actor ?? (await systemActorForTemplates());
  for (const d of missing) {
    const t = systemActor
      ? await saveTemplate(systemActor, null, { name: d.name, purpose: "Automação", category: "UTILITY", text: d.text })
      : null;
    try {
      await db.automationRule.create({ data: { event: d.event, name: d.name, sort: d.sort, enabled: d.enabled ?? true, offsetMinutes: d.offsetMinutes, templateId: t?.id ?? null } });
    } catch {
      // Outra requisição criou a mesma regra ao mesmo tempo: descarta o texto duplicado.
      if (t) await db.messageTemplate.delete({ where: { id: t.id } }).catch(() => {});
    }
  }
}

async function systemActorForTemplates(): Promise<Actor | null> {
  const { loadActorById } = await import("@/server/auth/current-user");
  const admin = await db.user.findFirst({ where: { status: "ACTIVE", role: { key: "ADMIN" } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return admin ? loadActorById(admin.id) : null;
}

// ───────── Gatilhos (chamados dentro da mesma transação do evento) ─────────

async function rulesFor(tx: Tx, event: string) {
  return tx.automationRule.findMany({ where: { event, enabled: true } });
}

async function enqueue(tx: Tx, rule: { id: string }, data: { candidateJobId: string; interviewId?: string | null; stageKey?: string | null; dueAt?: Date }) {
  const dedupeKey = `${rule.id}:${data.candidateJobId}:${data.interviewId ?? "-"}`;
  await tx.messageDispatch.createMany({
    data: [{ ruleId: rule.id, candidateJobId: data.candidateJobId, interviewId: data.interviewId ?? null, stageKey: data.stageKey ?? null, dedupeKey, dueAt: data.dueAt ?? new Date() }],
    skipDuplicates: true,
  });
}

/** Mudança de etapa (incluindo a inscrição, etapa "applied"). */
export async function onStageEntered(tx: Tx, candidateJobId: string, stageKey: string) {
  if (INTERVIEW_STAGES.has(stageKey)) {
    // Sem entrevista agendada, a mensagem não teria data/horário: avisa o recrutador para agendar.
    const scheduled = await tx.interview.count({ where: { candidateJobId, status: "SCHEDULED", scheduledAt: { gte: new Date() } } });
    if (scheduled) return;
    const rule = (await rulesFor(tx, stageKey === "online_interview" ? "interview:online" : "interview:in_person"))[0];
    if (!rule) return;
    await enqueue(tx, rule, { candidateJobId, stageKey, interviewId: null });
    return;
  }
  for (const rule of await rulesFor(tx, `stage:${stageKey}`)) await enqueue(tx, rule, { candidateJobId, stageKey });
}

async function interviewReminders(tx: Tx, i: { id: string; candidateJobId: string; scheduledAt: Date }, stageKey: string | null) {
  const reminders = await tx.automationRule.findMany({ where: { event: { startsWith: "reminder:" }, enabled: true } });
  for (const r of reminders) {
    const due = new Date(i.scheduledAt.getTime() - (r.offsetMinutes ?? 0) * 60000);
    if (due.getTime() < Date.now() - 5 * 60000) continue; // a entrevista está perto demais para este lembrete
    await enqueue(tx, r, { candidateJobId: i.candidateJobId, interviewId: i.id, stageKey, dueAt: due });
  }
}

async function currentStage(tx: Tx, candidateJobId: string) {
  return (await tx.candidateJob.findUnique({ where: { id: candidateJobId }, select: { stage: { select: { key: true } } } }))?.stage.key ?? null;
}

export async function onInterviewScheduled(tx: Tx, i: { id: string; candidateJobId: string; scheduledAt: Date; mode: "ONLINE" | "IN_PERSON" }) {
  const stageKey = await currentStage(tx, i.candidateJobId);
  // Itens "agende a entrevista" da etapa deixam de ser necessários.
  await tx.messageDispatch.updateMany({
    where: { candidateJobId: i.candidateJobId, interviewId: null, status: { in: ["PENDING", "BLOCKED"] }, rule: { event: { in: ["interview:online", "interview:in_person"] } } },
    data: { status: "CANCELED", reason: "Substituída pela mensagem da entrevista agendada." },
  });
  const rule = (await rulesFor(tx, i.mode === "ONLINE" ? "interview:online" : "interview:in_person"))[0];
  if (rule) await enqueue(tx, rule, { candidateJobId: i.candidateJobId, interviewId: i.id, stageKey });
  await interviewReminders(tx, i, stageKey);
}

/** Cancela o que ainda não foi enviado da entrevista e diz se o candidato já tinha sido avisado dela. */
async function retireInterview(tx: Tx, interviewId: string, reason: string) {
  await tx.messageDispatch.updateMany({ where: { interviewId, status: { in: ["PENDING", "BLOCKED"] } }, data: { status: "CANCELED", reason } });
  return (await tx.messageDispatch.count({ where: { interviewId, status: "SENT" } })) > 0;
}

export async function onInterviewRescheduled(tx: Tx, oldId: string, next: { id: string; candidateJobId: string; scheduledAt: Date; mode: "ONLINE" | "IN_PERSON" }) {
  const informed = await retireInterview(tx, oldId, "Entrevista reagendada.");
  const stageKey = await currentStage(tx, next.candidateJobId);
  if (informed) {
    const rule = (await rulesFor(tx, "interview:rescheduled"))[0];
    if (rule) await enqueue(tx, rule, { candidateJobId: next.candidateJobId, interviewId: next.id, stageKey });
    await interviewReminders(tx, next, stageKey);
  } else {
    // O candidato não chegou a ser avisado do horário antigo: segue como um agendamento novo.
    await onInterviewScheduled(tx, next);
  }
}

export async function onInterviewCanceled(tx: Tx, i: { id: string; candidateJobId: string }) {
  const informed = await retireInterview(tx, i.id, "Entrevista cancelada.");
  if (!informed) return;
  const rule = (await rulesFor(tx, "interview:canceled"))[0];
  if (rule) await enqueue(tx, rule, { candidateJobId: i.candidateJobId, interviewId: i.id, stageKey: await currentStage(tx, i.candidateJobId) });
}

// ───────── Montagem do texto e situação de cada item ─────────

const dispatchInclude = {
  rule: { include: { template: true } },
  interview: { select: { id: true, scheduledAt: true, mode: true, meetingUrl: true, location: true, status: true, store: { select: { name: true, address: true, city: true, state: true } } } },
  candidateJob: {
    select: {
      id: true, status: true, recruiterId: true,
      stage: { select: { key: true, name: true } },
      recruiter: { select: { name: true } },
      candidate: { select: { id: true, fullName: true, whatsappE164: true, phoneE164: true, optedOutAt: true, anonymizedAt: true } },
      job: { select: { id: true, title: true, slug: true, storeId: true, recruiterId: true, store: { select: { name: true, address: true, city: true, state: true } } } },
    },
  },
} satisfies Prisma.MessageDispatchInclude;
type DispatchRow = Prisma.MessageDispatchGetPayload<{ include: typeof dispatchInclude }>;

const addressOf = (s: { name: string; address: string | null; city: string; state?: string | null }) => (s.address ? [s.address, [s.city, s.state].filter(Boolean).join("/")].join(" - ") : null);

function values(d: DispatchRow, senderName: string, companyName: string, site: string): Partial<Record<VarKey, string>> {
  const c = d.candidateJob.candidate;
  const job = d.candidateJob.job;
  const i = d.interview;
  const place = i ? (i.mode === "ONLINE" ? i.meetingUrl : i.location || addressOf(i.store)) : null;
  return {
    nome: c.fullName.split(" ")[0], nome_completo: c.fullName, vaga: job.title, loja: job.store.name,
    endereco_loja: addressOf(job.store) ?? undefined,
    data: i ? formatDate(i.scheduledAt) : undefined, hora: i ? timeKey(i.scheduledAt) : undefined, horario: i ? timeKey(i.scheduledAt) : undefined,
    link: i?.mode === "ONLINE" ? i.meetingUrl ?? undefined : undefined,
    endereco: i?.mode === "IN_PERSON" ? (i.location || addressOf(i.store)) ?? undefined : undefined,
    local_ou_link: place ?? undefined,
    recrutador: (d.candidateJob.recruiter?.name ?? senderName).split(" ")[0],
    empresa: companyName || undefined,
    link_vaga: site ? `${site}/trabalhe-conosco/vagas/${job.slug}` : undefined,
  };
}

type Evaluation = { status: DispatchStatus; reason: string | null; body: string | null; phone: string | null };

/** Decide se o item pode ser enviado agora, e com qual texto. Nunca envia com dado faltando. */
function evaluate(d: DispatchRow, senderName: string, companyName: string, site: string, now = Date.now()): Evaluation {
  const c = d.candidateJob.candidate;
  const phone = c.whatsappE164 ?? c.phoneE164;
  if (c.anonymizedAt) return { status: "CANCELED", reason: "Dados do candidato anonimizados.", body: null, phone: null };
  if (c.optedOutAt) return { status: "SKIPPED", reason: "O candidato pediu para não receber mensagens.", body: null, phone };
  if (!d.rule.enabled) return { status: "SKIPPED", reason: "Automação desativada.", body: null, phone };
  const ev = d.rule.event;
  if (ev.startsWith("stage:") && d.stageKey && d.candidateJob.stage.key !== d.stageKey) return { status: "SKIPPED", reason: `O candidato já mudou para ${d.candidateJob.stage.name}.`, body: null, phone };
  if (d.interview) {
    if (ev !== "interview:canceled" && d.interview.status !== "SCHEDULED") return { status: "CANCELED", reason: "A entrevista não está mais agendada.", body: null, phone };
    if (d.interview.scheduledAt.getTime() < now) return { status: "SKIPPED", reason: "A entrevista já passou.", body: null, phone };
  }
  if (!d.interview && (ev === "interview:online" || ev === "interview:in_person")) {
    return { status: "BLOCKED", reason: "Agende a entrevista para enviar data, horário e " + (ev === "interview:online" ? "link." : "endereço."), body: null, phone };
  }
  if (!phone) return { status: "BLOCKED", reason: "O candidato não tem WhatsApp nem telefone no cadastro.", body: null, phone: null };
  const t = d.rule.template;
  if (!t) return { status: "BLOCKED", reason: "A automação está sem texto. Edite em Configurações → Mensagens automáticas.", body: null, phone };
  const vars = (t.variables as string[] | null) ?? [];
  const v = values(d, senderName, companyName, site) as Record<string, string | undefined>;
  const missing = vars.filter((k) => !v[k]?.trim());
  if (missing.length) {
    return { status: "BLOCKED", reason: `Falta: ${missing.map((k) => (isKnownVar(k) ? VARIABLES[k].label.toLowerCase() : k)).join(", ")}.`, body: null, phone };
  }
  return { status: "PENDING", reason: null, body: renderTemplate(t.body, vars.map((k) => v[k]!.trim())), phone };
}

function siteUrl() {
  return process.env.PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
}

/** Itens da fila que o usuário pode ver: lojas dele; recrutador, só os processos dele ou sem responsável. */
function scopeWhere(actor: Actor): Prisma.MessageDispatchWhereInput {
  const own = ROLES[actor.roleKey].ownRecordsOnly;
  return {
    candidateJob: {
      job: visibleJobsWhere(actor),
      ...(own ? { OR: [{ recruiterId: actor.id }, { recruiterId: null }] } : {}),
    },
  };
}

/** Atualiza a situação dos itens que já venceram (bloqueia/desbloqueia/pula) e avisa o recrutador quando falta dado. */
async function refreshDue(rows: DispatchRow[], actor: Actor) {
  const settings = await getCompanySettings();
  const site = siteUrl();
  const out: (DispatchRow & { eval: Evaluation })[] = [];
  for (const d of rows) {
    const e = evaluate(d, actor.name, settings.companyName, site);
    if (e.status !== d.status || (e.reason ?? null) !== (d.reason ?? null)) {
      await db.messageDispatch.update({ where: { id: d.id }, data: { status: e.status, reason: e.reason } });
      if (e.status === "BLOCKED" && d.status !== "BLOCKED") {
        const to = d.candidateJob.recruiterId ?? d.candidateJob.job.recruiterId;
        if (to) {
          await db.notification.upsert({
            where: { userId_dedupeKey: { userId: to, dedupeKey: `dispatch:${d.id}:blocked` } },
            update: {},
            create: { userId: to, type: "SYSTEM", title: `Mensagem parada: ${d.candidateJob.candidate.fullName}`, body: `${d.rule.name} — ${e.reason}`, link: "/mensagens/enviar", dedupeKey: `dispatch:${d.id}:blocked` },
          }).catch(() => {});
        }
      }
    }
    out.push({ ...d, status: e.status, reason: e.reason, eval: e });
  }
  return out;
}

/** Fila "Para enviar": itens vencidos, prontos ou bloqueados. */
export async function pendingQueue(actor: Actor) {
  authorize(actor, "messages.send");
  await ensureDefaultRules(actor);
  const rows = await db.messageDispatch.findMany({
    where: { AND: [scopeWhere(actor), { status: { in: ["PENDING", "BLOCKED"] } }, { dueAt: { lte: new Date() } }] },
    orderBy: { dueAt: "asc" }, take: 200, include: dispatchInclude,
  });
  const fresh = await refreshDue(rows, actor);
  const upcoming = await db.messageDispatch.count({ where: { AND: [scopeWhere(actor), { status: "PENDING" }, { dueAt: { gt: new Date() } }] } });
  return {
    ready: fresh.filter((d) => d.status === "PENDING"),
    blocked: fresh.filter((d) => d.status === "BLOCKED"),
    upcoming,
  };
}

export async function pendingCount(actor: Actor) {
  if (!actor.permissions.has("messages.send")) return 0;
  return db.messageDispatch.count({ where: { AND: [scopeWhere(actor), { status: "PENDING" }, { dueAt: { lte: new Date() } }] } });
}

export function waLink(phoneE164: string, text: string) {
  return `https://wa.me/${digitsOnly(phoneE164)}?text=${encodeURIComponent(text)}`;
}

/**
 * O recrutador clicou em Enviar: registra a mensagem (canal "WhatsApp do recrutador") e devolve o link
 * do WhatsApp com o texto pronto. Confere tudo de novo antes; item já enviado não é registrado duas vezes.
 */
export async function sendDispatch(actor: Actor, id: string) {
  authorize(actor, "messages.send");
  const d = await db.messageDispatch.findFirst({ where: { AND: [{ id }, scopeWhere(actor)] }, include: dispatchInclude });
  if (!d) throw new NotFoundError("Mensagem não encontrada na fila.");
  if (d.status === "SENT") throw new ValidationError({ status: ["Esta mensagem já foi enviada."] });
  if (d.status === "CANCELED") throw new ValidationError({ status: ["Esta mensagem foi cancelada."] });
  const settings = await getCompanySettings();
  const e = evaluate(d, actor.name, settings.companyName, siteUrl());
  if (e.status !== "PENDING" || !e.body || !e.phone) {
    await db.messageDispatch.update({ where: { id }, data: { status: e.status, reason: e.reason } });
    throw new ValidationError({ status: [e.reason ?? "Não é possível enviar agora."] });
  }
  const body = e.body;
  const phone = e.phone;
  const now = new Date();
  await db.$transaction(async (tx) => {
    // Trava otimista: só um clique "ganha" (evita duplicar com dois recrutadores ao mesmo tempo).
    const claimed = await tx.messageDispatch.updateMany({ where: { id, status: { in: ["PENDING", "SKIPPED"] } }, data: { status: "SENT", sentAt: now, sentById: actor.id, body, reason: null } });
    if (!claimed.count) throw new ValidationError({ status: ["Esta mensagem já foi enviada."] });
    const conv = await tx.conversation.upsert({
      where: { waContactE164: phone },
      update: { candidateId: d.candidateJob.candidate.id, lastMessageAt: now, lastMessageText: body.slice(0, 200) },
      create: { waContactE164: phone, candidateId: d.candidateJob.candidate.id, assignedToId: d.candidateJob.recruiterId ?? actor.id, lastMessageAt: now, lastMessageText: body.slice(0, 200) },
    });
    const msg = await tx.message.create({
      data: {
        conversationId: conv.id, direction: "OUTBOUND", channel: "MANUAL_LINK", status: "SENT", body, sentById: actor.id, sentAt: now, attempts: 1,
        templateId: d.rule.templateId, candidateJobId: d.candidateJobId, stageKey: d.candidateJob.stage.key,
      },
    });
    await tx.messageDispatch.update({ where: { id }, data: { messageId: msg.id } });
    await audit(tx, {
      actorId: actor.id, action: "message.manual_send", entityType: "CandidateJob", entityId: d.candidateJobId, storeId: d.candidateJob.job.storeId,
      summary: `Enviou "${d.rule.name}" para ${d.candidateJob.candidate.fullName} pelo WhatsApp`,
    });
  });
  return { url: waLink(phone, body) };
}

export async function skipDispatch(actor: Actor, id: string, reason: string) {
  authorize(actor, "messages.send");
  const d = await db.messageDispatch.findFirst({ where: { AND: [{ id }, scopeWhere(actor)] } });
  if (!d) throw new NotFoundError("Mensagem não encontrada na fila.");
  if (d.status === "SENT") throw new ValidationError({ status: ["Esta mensagem já foi enviada."] });
  await db.messageDispatch.update({ where: { id }, data: { status: "SKIPPED", reason: reason.trim().slice(0, 200) || "Pulada pelo recrutador." } });
}

/** Reprocessar: volta para a fila um item pulado, cancelado por engano ou bloqueado. Enviado não volta (evita duplicar). */
export async function requeueDispatch(actor: Actor, id: string) {
  authorize(actor, "messages.send");
  const d = await db.messageDispatch.findFirst({ where: { AND: [{ id }, scopeWhere(actor)] } });
  if (!d) throw new NotFoundError("Mensagem não encontrada.");
  if (d.status === "SENT") throw new ValidationError({ status: ["Mensagem já enviada não volta para a fila, para não duplicar."] });
  await db.messageDispatch.update({ where: { id }, data: { status: "PENDING", reason: null } });
}

// ───────── Configuração e histórico ─────────

export async function listRules(actor: Actor) {
  authorize(actor, "templates.manage");
  await ensureDefaultRules(actor);
  return db.automationRule.findMany({ orderBy: { sort: "asc" }, include: { template: true, _count: { select: { dispatches: { where: { status: "SENT" } } } } } });
}

export async function setRuleEnabled(actor: Actor, id: string, enabled: boolean) {
  authorize(actor, "templates.manage");
  const r = await db.automationRule.update({ where: { id }, data: { enabled, updatedById: actor.id } });
  await audit(db, { actorId: actor.id, action: enabled ? "automation.enable" : "automation.disable", entityType: "AutomationRule", entityId: id, summary: `${enabled ? "Ativou" : "Desativou"} a automação ${r.name}` });
  // Desativar não apaga a fila: os itens pendentes passam a aparecer como "não enviada" na próxima atualização.
}

export async function setReminderOffset(actor: Actor, id: string, minutes: number) {
  authorize(actor, "templates.manage");
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 7 * 1440) throw new ValidationError({ offset: ["Use de 15 minutos a 7 dias."] });
  const r = await db.automationRule.findUnique({ where: { id } });
  if (!r?.event.startsWith("reminder:")) throw new NotFoundError("Lembrete não encontrado.");
  if (await db.automationRule.findFirst({ where: { event: `reminder:${minutes}`, id: { not: id } } })) throw new ValidationError({ offset: ["Já existe um lembrete com essa antecedência."] });
  await db.automationRule.update({ where: { id }, data: { event: `reminder:${minutes}`, offsetMinutes: minutes, name: reminderName(minutes), updatedById: actor.id } });
}

export function reminderName(m: number) {
  return m % 1440 === 0 ? `Lembrete ${m / 1440} dia(s) antes` : m % 60 === 0 ? `Lembrete ${m / 60} hora(s) antes` : `Lembrete ${m} minutos antes`;
}

export async function addReminder(actor: Actor, minutes: number) {
  authorize(actor, "templates.manage");
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 7 * 1440) throw new ValidationError({ offset: ["Use de 15 minutos a 7 dias."] });
  if (await db.automationRule.findUnique({ where: { event: `reminder:${minutes}` } })) throw new ValidationError({ offset: ["Já existe um lembrete com essa antecedência."] });
  const base = DEFAULT_RULES.find((d) => d.event === "reminder:1440")!;
  const t = await saveTemplate(actor, null, { name: reminderName(minutes), purpose: "Automação", category: "UTILITY", text: base.text.replace("amanhã, ", "") });
  await db.automationRule.create({ data: { event: `reminder:${minutes}`, name: reminderName(minutes), offsetMinutes: minutes, sort: 8, templateId: t.id, updatedById: actor.id } });
}

export async function removeReminder(actor: Actor, id: string) {
  authorize(actor, "templates.manage");
  const r = await db.automationRule.findUnique({ where: { id } });
  if (!r?.event.startsWith("reminder:")) throw new NotFoundError("Lembrete não encontrado.");
  await db.$transaction(async (tx) => {
    await tx.messageDispatch.updateMany({ where: { ruleId: id, status: { in: ["PENDING", "BLOCKED"] } }, data: { status: "CANCELED", reason: "Lembrete removido." } });
    await tx.automationRule.update({ where: { id }, data: { enabled: false, updatedById: actor.id } });
  });
}

export async function dispatchHistory(actor: Actor, f: { status?: string; ruleId?: string } = {}) {
  authorize(actor, "messages.send");
  const and: Prisma.MessageDispatchWhereInput[] = [scopeWhere(actor)];
  if (f.status && f.status in DISPATCH_STATUS_LABEL) and.push({ status: f.status as DispatchStatus });
  if (f.ruleId) and.push({ ruleId: f.ruleId });
  return db.messageDispatch.findMany({
    where: { AND: and }, orderBy: { updatedAt: "desc" }, take: 150,
    include: { rule: { select: { name: true } }, sentBy: { select: { name: true } }, candidateJob: { select: { candidate: { select: { id: true, fullName: true } }, job: { select: { title: true } } } } },
  });
}

/** Prévia com dados de exemplo e texto pronto para "Enviar teste" ao próprio número. */
export async function previewRule(actor: Actor, ruleId: string) {
  authorize(actor, "templates.manage");
  const r = await db.automationRule.findUnique({ where: { id: ruleId }, include: { template: true } });
  if (!r?.template) throw new NotFoundError("Automação sem texto.");
  const vars = (r.template.variables as string[] | null) ?? [];
  return renderTemplate(r.template.body, vars.map((k) => (isKnownVar(k) ? VARIABLES[k].example : k)));
}

/** Histórico de comunicação do candidato (todas as candidaturas): enviadas, recebidas e as que estão na fila. */
export async function candidateCommunication(actor: Actor, candidateId: string) {
  authorize(actor, "candidates.view");
  const [messages, queue] = await Promise.all([
    db.message.findMany({
      where: { conversation: { candidateId } }, orderBy: { createdAt: "desc" }, take: 100,
      select: {
        id: true, direction: true, channel: true, body: true, status: true, errorMessage: true, createdAt: true, stageKey: true, mediaType: true,
        sentBy: { select: { name: true } }, candidateJob: { select: { job: { select: { title: true } } } }, conversationId: true,
      },
    }),
    db.messageDispatch.findMany({
      where: { candidateJob: { candidateId }, status: { in: ["PENDING", "BLOCKED"] } }, orderBy: { dueAt: "asc" },
      select: { id: true, status: true, reason: true, dueAt: true, rule: { select: { name: true } }, candidateJob: { select: { job: { select: { title: true } } } } },
    }),
  ]);
  return { messages, queue };
}

/** O candidato pediu (por telefone, WhatsApp ou pessoalmente) para não receber mais mensagens. */
export async function recordOptOut(actor: Actor, candidateId: string, ip?: string | null) {
  authorize(actor, "candidates.update");
  const c = await db.candidate.findUnique({ where: { id: candidateId }, select: { fullName: true, optedOutAt: true } });
  if (!c) throw new NotFoundError("Candidato não encontrado.");
  if (c.optedOutAt) return;
  await db.$transaction(async (tx) => {
    await tx.candidate.update({ where: { id: candidateId }, data: { optedOutAt: new Date() } });
    await tx.candidateConsent.updateMany({ where: { candidateId, purpose: "WHATSAPP_CONTACT", revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.messageDispatch.updateMany({ where: { candidateJob: { candidateId }, status: { in: ["PENDING", "BLOCKED"] } }, data: { status: "SKIPPED", reason: "O candidato pediu para não receber mensagens." } });
    await audit(tx, { actorId: actor.id, action: "privacy.whatsapp_optout", entityType: "Candidate", entityId: candidateId, ipAddress: ip, summary: `Registrou que ${c.fullName} pediu para não receber mensagens` });
  });
}

