import "server-only";
import { z } from "zod";
import type { InterviewStatus, Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { authorize, type Actor } from "@/server/authz/authorize";
import { ROLES } from "@/server/authz/catalog";
import { visibleJobsWhere } from "@/server/authz/scopes";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/modules/users/schemas";
import { formatDateTime } from "@/lib/format";
import { parseDateTimeSP } from "@/lib/period";

export const INTERVIEW_STATUS_LABEL: Record<InterviewStatus, string> = {
  SCHEDULED: "Agendada", COMPLETED: "Realizada", CANCELED: "Cancelada", RESCHEDULED: "Reagendada", NO_SHOW: "Não compareceu",
};
export const RECOMMENDATION_LABEL = { ADVANCE: "Avançar", HOLD: "Em dúvida", REJECT: "Não seguir" } as const;
export const MODE_LABEL = { ONLINE: "Online", IN_PERSON: "Presencial" } as const;

/** Entrevistas visíveis: das lojas do usuário ou em que ele é o entrevistador. */
export function visibleInterviewsWhere(actor: Actor): Prisma.InterviewWhereInput {
  const base: Prisma.InterviewWhereInput = { candidateJob: { candidate: { anonymizedAt: null } } };
  if (actor.allStores) return base;
  return { AND: [base, { OR: [{ storeId: { in: actor.storeIds } }, { interviewerId: actor.id }] }] };
}

type ManageCheck = { storeId: string; createdById: string | null; interviewerId: string | null; candidateJob: { recruiterId: string | null } };

export function canManageInterview(actor: Actor, i: ManageCheck): boolean {
  if (!actor.permissions.has("interviews.manage")) return false;
  if (!actor.allStores && !actor.storeIds.includes(i.storeId)) return false;
  if (!ROLES[actor.roleKey].ownRecordsOnly) return true;
  return i.candidateJob.recruiterId === null || i.candidateJob.recruiterId === actor.id || i.createdById === actor.id;
}

export function canEvaluateInterview(actor: Actor, i: ManageCheck): boolean {
  if (!actor.permissions.has("interviews.evaluate")) return false;
  return i.interviewerId === actor.id || canManageInterview(actor, i);
}

// ───────── Consulta ─────────

const listSelect = {
  id: true, scheduledAt: true, durationMinutes: true, mode: true, status: true, meetingUrl: true, location: true, storeId: true, interviewerId: true, createdById: true,
  store: { select: { id: true, name: true } },
  interviewer: { select: { id: true, name: true } },
  candidateJob: {
    select: {
      id: true, recruiterId: true,
      candidate: { select: { id: true, fullName: true, phoneE164: true, whatsappE164: true } },
      job: { select: { id: true, title: true } },
      stage: { select: { key: true, name: true } },
    },
  },
  _count: { select: { evaluations: true } },
} satisfies Prisma.InterviewSelect;

export type InterviewFilters = { storeId?: string; interviewerId?: string; status?: string; mine?: boolean };

export async function listInterviews(actor: Actor, from: Date, to: Date, f: InterviewFilters = {}) {
  authorize(actor, "interviews.view");
  const and: Prisma.InterviewWhereInput[] = [visibleInterviewsWhere(actor), { scheduledAt: { gte: from, lt: to } }];
  if (f.storeId) and.push({ storeId: f.storeId });
  if (f.interviewerId) and.push({ interviewerId: f.interviewerId });
  if (f.status && f.status in INTERVIEW_STATUS_LABEL) and.push({ status: f.status as InterviewStatus });
  else and.push({ status: { not: "RESCHEDULED" } }); // a remarcação aparece no novo horário
  if (f.mine) and.push({ OR: [{ interviewerId: actor.id }, { createdById: actor.id }, { candidateJob: { recruiterId: actor.id } }] });
  return db.interview.findMany({ where: { AND: and }, orderBy: { scheduledAt: "asc" }, take: 1000, select: listSelect });
}

export async function upcomingInterviews(actor: Actor, take = 6) {
  authorize(actor, "interviews.view");
  return db.interview.findMany({
    where: { AND: [visibleInterviewsWhere(actor), { status: "SCHEDULED", scheduledAt: { gte: new Date(Date.now() - 30 * 60000) } }] },
    orderBy: { scheduledAt: "asc" }, take, select: listSelect,
  });
}

/** Entrevistas que já passaram e ainda estão como "Agendada" (falta registrar o resultado). */
export async function pendingResults(actor: Actor) {
  authorize(actor, "interviews.view");
  return db.interview.count({ where: { AND: [visibleInterviewsWhere(actor), { status: "SCHEDULED", scheduledAt: { lt: new Date(Date.now() - 60 * 60000) } }] } });
}

export async function getInterview(actor: Actor, id: string) {
  authorize(actor, "interviews.view");
  const i = await db.interview.findFirst({
    where: { AND: [{ id }, visibleInterviewsWhere(actor)] },
    include: {
      store: { select: { id: true, name: true, address: true, city: true } },
      interviewer: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      rescheduledFrom: { select: { id: true, scheduledAt: true } },
      rescheduledTo: { select: { id: true, scheduledAt: true } },
      evaluations: { orderBy: { createdAt: "desc" }, include: { evaluator: { select: { id: true, name: true } } } },
      candidateJob: {
        select: {
          id: true, recruiterId: true, status: true,
          candidate: { select: { id: true, fullName: true, phoneE164: true, whatsappE164: true, email: true, city: true } },
          job: { select: { id: true, title: true } },
          stage: { select: { key: true, name: true } },
        },
      },
    },
  });
  if (!i) throw new NotFoundError("Entrevista não encontrada.");
  // "Começou" = já dá para registrar resultado/avaliação (15 min de tolerância).
  const started = i.scheduledAt.getTime() <= Date.now() + 15 * 60000;
  return { interview: i, started, canManage: canManageInterview(actor, i), canEvaluate: canEvaluateInterview(actor, i) };
}

export async function interviewFormOptions(actor: Actor) {
  const [stores, interviewers] = await Promise.all([
    db.store.findMany({ where: { status: "ACTIVE", ...(actor.allStores ? {} : { id: { in: actor.storeIds } }) }, select: { id: true, name: true, address: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, role: { select: { name: true } } }, orderBy: { name: "asc" } }),
  ]);
  return { stores, interviewers };
}

/** Processos ativos que o usuário pode agendar (busca por nome ou telefone). */
export async function searchProcessesForInterview(actor: Actor, q: string) {
  authorize(actor, "interviews.manage");
  const term = q.trim();
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, "");
  const own = ROLES[actor.roleKey].ownRecordsOnly;
  const rows = await db.candidateJob.findMany({
    where: {
      AND: [
        { status: "ACTIVE" }, { job: visibleJobsWhere(actor) },
        { candidate: digits.length >= 4 ? { anonymizedAt: null, OR: [{ phoneE164: { contains: digits } }, { whatsappE164: { contains: digits } }] } : { anonymizedAt: null, fullName: { contains: term, mode: "insensitive" } } },
        ...(own ? [{ OR: [{ recruiterId: actor.id }, { recruiterId: null }] }] : []),
      ],
    },
    take: 10,
    orderBy: { lastMovedAt: "desc" },
    select: { id: true, candidate: { select: { fullName: true } }, job: { select: { title: true, storeId: true, store: { select: { name: true } } } }, stage: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, label: r.candidate.fullName, detail: `${r.job.title} · ${r.job.store.name} · ${r.stage.name}`, storeId: r.job.storeId }));
}

export async function processForInterview(actor: Actor, processId: string) {
  const p = await db.candidateJob.findFirst({
    where: { AND: [{ id: processId }, { job: visibleJobsWhere(actor) }, { candidate: { anonymizedAt: null } }] },
    select: { id: true, status: true, candidate: { select: { fullName: true } }, job: { select: { title: true, storeId: true, store: { select: { name: true } } } }, stage: { select: { name: true } } },
  });
  return p ? { id: p.id, label: p.candidate.fullName, detail: `${p.job.title} · ${p.job.store.name} · ${p.stage.name}`, storeId: p.job.storeId, active: p.status === "ACTIVE" } : null;
}

// ───────── Agendar, reagendar, cancelar ─────────

const slotSchema = z
  .object({
    date: z.string().min(1, "Informe a data."),
    time: z.string().min(1, "Informe o horário."),
    durationMinutes: z.coerce.number().int().min(10, "Mínimo de 10 minutos.").max(480, "Máximo de 8 horas."),
    mode: z.enum(["ONLINE", "IN_PERSON"], "Escolha a modalidade."),
    interviewerId: z.string().optional().transform((v) => v || null),
    meetingUrl: z.union([z.literal(""), z.url("Link inválido. Comece com https://").refine((u) => /^https:\/\//i.test(u), "Use um link https://")]).optional().transform((v) => v || null),
    location: z.string().trim().max(200).optional().transform((v) => v || null),
    storeId: z.string().min(1, "Selecione a loja."),
    notes: z.string().trim().max(2000).optional().transform((v) => v || null),
  })
  .transform((v, ctx) => {
    const at = parseDateTimeSP(v.date, v.time);
    if (!at) {
      ctx.addIssue({ code: "custom", path: ["time"], message: "Data ou horário inválido." });
      return z.NEVER;
    }
    return { ...v, scheduledAt: at };
  });

export type SlotInput = z.input<typeof slotSchema>;

async function assertFree(tx: Tx | typeof db, start: Date, minutes: number, who: { interviewerId: string | null; candidateId: string }, ignoreId?: string) {
  const end = new Date(start.getTime() + minutes * 60000);
  // Busca uma janela larga e confere a sobreposição considerando a duração de cada entrevista.
  const nearby = await tx.interview.findMany({
    where: {
      status: "SCHEDULED", id: ignoreId ? { not: ignoreId } : undefined,
      scheduledAt: { gte: new Date(start.getTime() - 8 * 3600000), lt: end },
      OR: [...(who.interviewerId ? [{ interviewerId: who.interviewerId }] : []), { candidateJob: { candidateId: who.candidateId } }],
    },
    select: { scheduledAt: true, durationMinutes: true, interviewerId: true, candidateJob: { select: { candidate: { select: { fullName: true } } } } },
  });
  const clash = nearby.find((i) => i.scheduledAt.getTime() + i.durationMinutes * 60000 > start.getTime());
  if (clash) {
    const sameInterviewer = who.interviewerId && clash.interviewerId === who.interviewerId;
    throw new ValidationError({
      time: [sameInterviewer
        ? `O entrevistador já tem entrevista às ${formatDateTime(clash.scheduledAt)} (${clash.candidateJob.candidate.fullName}).`
        : `O candidato já tem entrevista agendada para ${formatDateTime(clash.scheduledAt)}.`],
    });
  }
}

async function validateSlotRefs(actor: Actor, d: { storeId: string; interviewerId: string | null; mode: string; meetingUrl: string | null; scheduledAt: Date }, isNew: boolean) {
  if (!actor.allStores && !actor.storeIds.includes(d.storeId)) throw new ValidationError({ storeId: ["Escolha uma das suas lojas."] });
  const store = await db.store.findFirst({ where: { id: d.storeId, status: "ACTIVE" }, select: { id: true } });
  if (!store) throw new ValidationError({ storeId: ["Loja não encontrada ou inativa."] });
  if (d.interviewerId && !(await db.user.findFirst({ where: { id: d.interviewerId, status: "ACTIVE" }, select: { id: true } }))) {
    throw new ValidationError({ interviewerId: ["Entrevistador não encontrado ou inativo."] });
  }
  if (isNew && d.scheduledAt.getTime() < Date.now() - 5 * 60000) throw new ValidationError({ date: ["Escolha uma data e horário futuros."] });
}

const STAGE_FOR_MODE = { ONLINE: "online_interview", IN_PERSON: "onsite_interview" } as const;

/** Notifica o entrevistador (quando não é quem agendou). */
async function notifyInterviewer(tx: Tx, interviewerId: string | null, actorId: string, title: string, body: string, link: string, dedupeKey: string) {
  if (!interviewerId || interviewerId === actorId) return;
  await tx.notification.upsert({
    where: { userId_dedupeKey: { userId: interviewerId, dedupeKey } },
    update: { title, body, link, readAt: null, createdAt: new Date() },
    create: { userId: interviewerId, type: "SYSTEM", title, body, link, dedupeKey },
  });
}

export async function scheduleInterview(actor: Actor, processId: string, raw: SlotInput & { moveStage?: string }, ip?: string | null) {
  authorize(actor, "interviews.manage");
  if (!processId) throw new ValidationError({ processId: ["Selecione o candidato e a vaga."] });
  const p = await db.candidateJob.findFirst({
    where: { AND: [{ id: processId }, { job: visibleJobsWhere(actor) }, { candidate: { anonymizedAt: null } }] },
    include: { stage: true, candidate: { select: { id: true, fullName: true } }, job: { select: { title: true, storeId: true } } },
  });
  if (!p) throw new ValidationError({ processId: ["Candidatura não encontrada."] });
  if (p.status !== "ACTIVE") throw new ValidationError({ processId: ["Este processo já foi encerrado. Reabra-o no funil para agendar."] });
  if (ROLES[actor.roleKey].ownRecordsOnly && p.recruiterId && p.recruiterId !== actor.id) throw new ForbiddenError("Este candidato está sob responsabilidade de outro recrutador.");
  const parsed = slotSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  const d = parsed.data;
  await validateSlotRefs(actor, d, true);

  return db.$transaction(async (tx) => {
    await assertFree(tx, d.scheduledAt, d.durationMinutes, { interviewerId: d.interviewerId, candidateId: p.candidateId });
    const i = await tx.interview.create({
      data: {
        candidateJobId: p.id, storeId: d.storeId, interviewerId: d.interviewerId, scheduledAt: d.scheduledAt, durationMinutes: d.durationMinutes,
        mode: d.mode, meetingUrl: d.mode === "ONLINE" ? d.meetingUrl : null, location: d.location, notes: d.notes, createdById: actor.id,
      },
    });
    // Leva o candidato para a etapa de entrevista correspondente (só avança, nunca recua).
    if (raw.moveStage === "on") {
      const target = await tx.recruitmentStage.findUnique({ where: { key: STAGE_FOR_MODE[d.mode] } });
      if (target && target.order > p.stage.order && target.active) {
        await tx.candidateJob.update({ where: { id: p.id }, data: { stageId: target.id, lastMovedAt: new Date(), ...(p.recruiterId ? {} : ROLES[actor.roleKey].ownRecordsOnly ? { recruiterId: actor.id } : {}) } });
        await tx.stageHistory.create({ data: { candidateJobId: p.id, fromStageId: p.stageId, toStageId: target.id, movedById: actor.id, note: `Entrevista agendada para ${formatDateTime(d.scheduledAt)}` } });
      } else {
        await tx.candidateJob.update({ where: { id: p.id }, data: { lastMovedAt: new Date() } });
      }
    }
    await audit(tx, {
      actorId: actor.id, action: "interview.schedule", entityType: "Interview", entityId: i.id, storeId: d.storeId, ipAddress: ip,
      summary: `Agendou entrevista ${MODE_LABEL[d.mode].toLowerCase()} de ${p.candidate.fullName} para ${formatDateTime(d.scheduledAt)} (${p.job.title})`,
    });
    await notifyInterviewer(tx, d.interviewerId, actor.id, `Entrevista agendada: ${p.candidate.fullName}`, `${formatDateTime(d.scheduledAt)} · ${MODE_LABEL[d.mode]} · ${p.job.title}`, `/entrevistas/${i.id}`, `interview:${i.id}:assigned`);
    return i;
  });
}

async function loadManageable(actor: Actor, id: string) {
  const i = await db.interview.findFirst({
    where: { AND: [{ id }, visibleInterviewsWhere(actor)] },
    include: { candidateJob: { select: { id: true, recruiterId: true, candidateId: true, candidate: { select: { fullName: true } }, job: { select: { title: true } } } } },
  });
  if (!i) throw new NotFoundError("Entrevista não encontrada.");
  if (!canManageInterview(actor, i)) throw new ForbiddenError("Você não pode alterar esta entrevista.");
  return i;
}

/** Reagendar cria uma nova entrevista ligada à anterior (que fica como "Reagendada"), preservando o histórico. */
export async function rescheduleInterview(actor: Actor, id: string, raw: SlotInput & { reason?: string }, ip?: string | null) {
  authorize(actor, "interviews.manage");
  const old = await loadManageable(actor, id);
  if (old.status !== "SCHEDULED") throw new ValidationError({ status: ["Só entrevistas agendadas podem ser reagendadas."] });
  const parsed = slotSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  const d = parsed.data;
  await validateSlotRefs(actor, d, true);
  const reason = raw.reason?.trim().slice(0, 500) || null;
  return db.$transaction(async (tx) => {
    await assertFree(tx, d.scheduledAt, d.durationMinutes, { interviewerId: d.interviewerId, candidateId: old.candidateJob.candidateId }, old.id);
    await tx.interview.update({ where: { id: old.id }, data: { status: "RESCHEDULED", canceledReason: reason } });
    const next = await tx.interview.create({
      data: {
        candidateJobId: old.candidateJobId, storeId: d.storeId, interviewerId: d.interviewerId, scheduledAt: d.scheduledAt, durationMinutes: d.durationMinutes,
        mode: d.mode, meetingUrl: d.mode === "ONLINE" ? d.meetingUrl : null, location: d.location, notes: d.notes ?? old.notes, createdById: actor.id, rescheduledFromId: old.id,
      },
    });
    await audit(tx, {
      actorId: actor.id, action: "interview.reschedule", entityType: "Interview", entityId: next.id, storeId: d.storeId, ipAddress: ip,
      summary: `Reagendou a entrevista de ${old.candidateJob.candidate.fullName}: ${formatDateTime(old.scheduledAt)} → ${formatDateTime(d.scheduledAt)}`,
      before: { scheduledAt: old.scheduledAt.toISOString() }, after: { scheduledAt: d.scheduledAt.toISOString(), ...(reason ? { reason } : {}) },
    });
    await notifyInterviewer(tx, d.interviewerId, actor.id, `Entrevista reagendada: ${old.candidateJob.candidate.fullName}`, `Novo horário: ${formatDateTime(d.scheduledAt)}`, `/entrevistas/${next.id}`, `interview:${next.id}:assigned`);
    return next;
  });
}

export async function cancelInterview(actor: Actor, id: string, reason: string, ip?: string | null) {
  authorize(actor, "interviews.manage");
  const i = await loadManageable(actor, id);
  if (i.status !== "SCHEDULED") throw new ValidationError({ status: ["Só entrevistas agendadas podem ser canceladas."] });
  const text = reason.trim();
  if (text.length < 3) throw new ValidationError({ reason: ["Informe o motivo do cancelamento."] });
  await db.$transaction(async (tx) => {
    await tx.interview.update({ where: { id }, data: { status: "CANCELED", canceledReason: text.slice(0, 500) } });
    await audit(tx, {
      actorId: actor.id, action: "interview.cancel", entityType: "Interview", entityId: id, storeId: i.storeId, ipAddress: ip,
      summary: `Cancelou a entrevista de ${i.candidateJob.candidate.fullName} (${formatDateTime(i.scheduledAt)}): ${text.slice(0, 120)}`,
    });
    await notifyInterviewer(tx, i.interviewerId, actor.id, `Entrevista cancelada: ${i.candidateJob.candidate.fullName}`, `${formatDateTime(i.scheduledAt)} · ${text.slice(0, 80)}`, `/entrevistas/${id}`, `interview:${id}:canceled`);
  });
}

/** Registra se a entrevista aconteceu ou se o candidato faltou. */
export async function setInterviewOutcome(actor: Actor, id: string, outcome: "COMPLETED" | "NO_SHOW", ip?: string | null) {
  authorize(actor, "interviews.view");
  const i = await db.interview.findFirst({
    where: { AND: [{ id }, visibleInterviewsWhere(actor)] },
    include: { candidateJob: { select: { recruiterId: true, candidate: { select: { fullName: true } } } } },
  });
  if (!i) throw new NotFoundError("Entrevista não encontrada.");
  if (!canEvaluateInterview(actor, i) && !canManageInterview(actor, i)) throw new ForbiddenError("Você não pode alterar esta entrevista.");
  if (i.status !== "SCHEDULED") throw new ValidationError({ status: ["O resultado desta entrevista já foi registrado."] });
  if (i.scheduledAt.getTime() > Date.now() + 15 * 60000) throw new ValidationError({ status: ["A entrevista ainda não aconteceu."] });
  await db.$transaction(async (tx) => {
    await tx.interview.update({ where: { id }, data: { status: outcome } });
    await audit(tx, {
      actorId: actor.id, action: outcome === "COMPLETED" ? "interview.complete" : "interview.no_show", entityType: "Interview", entityId: id, storeId: i.storeId, ipAddress: ip,
      summary: outcome === "COMPLETED" ? `Registrou a entrevista de ${i.candidateJob.candidate.fullName} como realizada` : `Registrou falta de ${i.candidateJob.candidate.fullName} na entrevista`,
    });
  });
}

// ───────── Avaliação ─────────

const score = z.coerce.number().int().min(1, "De 1 a 5.").max(5, "De 1 a 5.");
const optScore = z.union([z.literal(""), score]).optional().transform((v) => (v === "" || v === undefined ? null : v));
const evaluationSchema = z.object({
  communication: optScore, experience: optScore, attitude: optScore, availability: optScore,
  overall: z.union([z.literal(""), score]).refine((v) => v !== "", "Dê a nota geral (1 a 5).").transform((v) => Number(v)),
  recommendation: z.enum(["ADVANCE", "HOLD", "REJECT"], "Escolha a recomendação."),
  comments: z.string().trim().max(4000).optional().transform((v) => v || null),
});
export type EvaluationInput = z.input<typeof evaluationSchema>;

/** Uma avaliação por avaliador: avaliar de novo atualiza a sua. Avaliar marca a entrevista como realizada. */
export async function evaluateInterview(actor: Actor, id: string, raw: EvaluationInput, ip?: string | null) {
  authorize(actor, "interviews.evaluate");
  const i = await db.interview.findFirst({
    where: { AND: [{ id }, visibleInterviewsWhere(actor)] },
    include: { candidateJob: { select: { recruiterId: true, candidate: { select: { fullName: true } } } } },
  });
  if (!i) throw new NotFoundError("Entrevista não encontrada.");
  if (!canEvaluateInterview(actor, i)) throw new ForbiddenError("Só o entrevistador ou quem cuida do processo pode avaliar.");
  if (i.status === "CANCELED" || i.status === "RESCHEDULED" || i.status === "NO_SHOW") throw new ValidationError({ status: ["Esta entrevista não aconteceu; não dá para avaliar."] });
  if (i.scheduledAt.getTime() > Date.now() + 15 * 60000) throw new ValidationError({ status: ["Avalie depois que a entrevista acontecer."] });
  const parsed = evaluationSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  const d = parsed.data;
  return db.$transaction(async (tx) => {
    const existing = await tx.interviewEvaluation.findFirst({ where: { interviewId: id, evaluatorId: actor.id } });
    const ev = existing
      ? await tx.interviewEvaluation.update({ where: { id: existing.id }, data: d })
      : await tx.interviewEvaluation.create({ data: { ...d, interviewId: id, evaluatorId: actor.id } });
    if (i.status === "SCHEDULED") await tx.interview.update({ where: { id }, data: { status: "COMPLETED" } });
    await audit(tx, {
      actorId: actor.id, action: "interview.evaluate", entityType: "Interview", entityId: id, storeId: i.storeId, ipAddress: ip,
      summary: `Avaliou a entrevista de ${i.candidateJob.candidate.fullName}: nota ${d.overall}, ${RECOMMENDATION_LABEL[d.recommendation].toLowerCase()}`,
    });
    return ev;
  });
}
