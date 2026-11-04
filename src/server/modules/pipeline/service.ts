import "server-only";
import type { Prisma, ProcessStatus, StageKind } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { authorize, type Actor } from "@/server/authz/authorize";
import { ROLES } from "@/server/authz/catalog";
import { visibleJobsWhere } from "@/server/authz/scopes";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { getCompanySettings } from "@/server/modules/settings/service";
import { addDays } from "@/lib/period";

// Funil de recrutamento: cada cartão é uma candidatura (candidato × vaga).
// Quem vê: processos das vagas das lojas do usuário. Quem move: pipeline.move e,
// para o recrutador, só os processos dele (ou sem responsável, que ele assume ao mover).

export type BoardFilters = { storeId?: string; jobId?: string; recruiterId?: string; days?: string; q?: string; stalled?: boolean };
const PER_COLUMN = 60;

/** Status do processo de acordo com o tipo da etapa de destino. */
export function statusForKind(kind: StageKind): ProcessStatus {
  return kind === "HIRED" ? "HIRED" : kind === "REJECTED" ? "REJECTED" : kind === "WITHDRAWN" ? "WITHDRAWN" : "ACTIVE";
}

export function canMoveProcess(actor: Actor, p: { recruiterId: string | null; job: { storeId: string } }): boolean {
  if (!actor.permissions.has("pipeline.move")) return false;
  if (!actor.allStores && !actor.storeIds.includes(p.job.storeId)) return false;
  if (!ROLES[actor.roleKey].ownRecordsOnly) return true;
  return p.recruiterId === null || p.recruiterId === actor.id;
}

/** Dias sem movimentação a partir dos quais o processo conta como parado. */
async function stalledLimits() {
  const [settings, stages] = await Promise.all([getCompanySettings(), db.recruitmentStage.findMany({ where: { active: true }, orderBy: { order: "asc" } })]);
  return { stages, limit: (stageId: string) => stages.find((s) => s.id === stageId)?.stalledDays ?? settings.stalledDays, defaultDays: settings.stalledDays };
}

function boardWhere(actor: Actor, f: BoardFilters): Prisma.CandidateJobWhereInput {
  const and: Prisma.CandidateJobWhereInput[] = [{ job: visibleJobsWhere(actor) }, { candidate: { anonymizedAt: null } }];
  if (f.storeId) and.push({ job: { storeId: f.storeId } });
  if (f.jobId) and.push({ jobId: f.jobId });
  if (f.recruiterId === "sem") and.push({ recruiterId: null });
  else if (f.recruiterId) and.push({ recruiterId: f.recruiterId });
  const days = Number(f.days);
  if ([7, 30, 90].includes(days)) and.push({ appliedAt: { gte: addDays(new Date(), -days) } });
  const q = f.q?.trim();
  if (q) and.push({ candidate: { fullName: { contains: q, mode: "insensitive" } } });
  return { AND: and };
}

export async function getBoard(actor: Actor, f: BoardFilters = {}) {
  authorize(actor, "pipeline.view");
  const where = boardWhere(actor, f);
  const { stages, limit } = await stalledLimits();
  const now = Date.now();

  const columns = await Promise.all(
    stages.map(async (s) => {
      // Etapas finais mostram os mais recentes; as em andamento, os mais antigos primeiro (quem espera há mais tempo).
      const stageWhere: Prisma.CandidateJobWhereInput = { AND: [where, { stageId: s.id }] };
      if (f.stalled) (stageWhere.AND as Prisma.CandidateJobWhereInput[]).push({ status: "ACTIVE", lastMovedAt: { lt: new Date(now - limit(s.id) * 86400000) } });
      const [items, total] = await Promise.all([
        db.candidateJob.findMany({
          where: stageWhere,
          orderBy: { lastMovedAt: s.kind === "OPEN" ? "asc" : "desc" },
          take: PER_COLUMN,
          select: {
            id: true, status: true, appliedAt: true, lastMovedAt: true, source: true, recruiterId: true, salaryExpectation: true,
            candidate: { select: { id: true, fullName: true, city: true, phoneE164: true, whatsappE164: true } },
            job: { select: { id: true, title: true, storeId: true, store: { select: { name: true } } } },
            recruiter: { select: { name: true } },
            interviews: { where: { status: "SCHEDULED", scheduledAt: { gte: new Date(now) } }, orderBy: { scheduledAt: "asc" }, take: 1, select: { id: true, scheduledAt: true, mode: true } },
          },
        }),
        db.candidateJob.count({ where: stageWhere }),
      ]);
      return {
        id: s.id, key: s.key, name: s.name, kind: s.kind, total,
        cards: items.map((p) => {
          const idleDays = Math.floor((now - p.lastMovedAt.getTime()) / 86400000);
          return {
            ...p,
            idleDays,
            stalled: p.status === "ACTIVE" && idleDays >= limit(s.id),
            canMove: canMoveProcess(actor, p),
            nextInterview: p.interviews[0] ?? null,
          };
        }),
      };
    }),
  );
  const stalledTotal = columns.reduce((n, c) => n + c.cards.filter((x) => x.stalled).length, 0);
  return { columns, stalledTotal };
}

export async function boardFilterOptions(actor: Actor) {
  const [stores, jobs, recruiters] = await Promise.all([
    db.store.findMany({ where: actor.allStores ? {} : { id: { in: actor.storeIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.job.findMany({ where: { AND: [visibleJobsWhere(actor), { status: { in: ["OPEN", "PAUSED"] } }] }, select: { id: true, title: true, store: { select: { name: true } } }, orderBy: { title: "asc" } }),
    db.user.findMany({ where: { status: "ACTIVE", role: { key: { in: ["RECRUITER", "HR_MANAGER", "ADMIN"] } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { stores, jobs, recruiters };
}

/**
 * Move a candidatura para outra etapa, registrando etapa anterior, nova etapa, data, usuário e observação.
 * Etapas finais encerram o processo (contratado, reprovado, desistente); voltar para uma etapa em andamento reabre.
 */
export async function moveProcess(actor: Actor, processId: string, toStageKey: string, note?: string | null, ip?: string | null) {
  authorize(actor, "pipeline.move");
  const p = await db.candidateJob.findFirst({
    where: { AND: [{ id: processId }, { job: visibleJobsWhere(actor) }, { candidate: { anonymizedAt: null } }] },
    include: { stage: true, job: { select: { id: true, title: true, storeId: true, openings: true } }, candidate: { select: { id: true, fullName: true } } },
  });
  if (!p) throw new NotFoundError("Processo não encontrado.");
  if (!canMoveProcess(actor, p)) throw new ForbiddenError("Este candidato está sob responsabilidade de outro recrutador.");
  const to = await db.recruitmentStage.findFirst({ where: { key: toStageKey, active: true } });
  if (!to) throw new ValidationError({ stage: ["Etapa não encontrada."] });
  if (to.id === p.stageId) return p;
  const text = note?.trim() || null;
  if (text && text.length > 1000) throw new ValidationError({ note: ["Observação muito longa (máx. 1.000 caracteres)."] });

  const status = statusForKind(to.kind);
  const now = new Date();
  const assume = ROLES[actor.roleKey].ownRecordsOnly && p.recruiterId === null;
  return db.$transaction(async (tx) => {
    const updated = await tx.candidateJob.update({
      where: { id: p.id },
      data: {
        stageId: to.id, status, lastMovedAt: now,
        hiredAt: status === "HIRED" ? now : null,
        closedAt: status === "ACTIVE" ? null : now,
        ...(assume ? { recruiterId: actor.id } : {}),
      },
    });
    await tx.stageHistory.create({ data: { candidateJobId: p.id, fromStageId: p.stageId, toStageId: to.id, movedById: actor.id, note: text, movedAt: now } });
    await tx.candidate.update({ where: { id: p.candidateId }, data: { updatedAt: now } });
    await audit(tx, {
      actorId: actor.id, action: "application.move", entityType: "CandidateJob", entityId: p.id, storeId: p.job.storeId, ipAddress: ip,
      summary: `Moveu ${p.candidate.fullName} de ${p.stage.name} para ${to.name} (${p.job.title})`,
      before: { stage: p.stage.key }, after: { stage: to.key, ...(text ? { note: text } : {}) },
    });
    return updated;
  });
}

/** Processos parados (para alertas): ativos e sem movimentação além do limite da etapa. */
export async function stalledProcesses(actor: Actor, take = 20) {
  authorize(actor, "pipeline.view");
  const { stages, limit } = await stalledLimits();
  const now = Date.now();
  const own = ROLES[actor.roleKey].ownRecordsOnly;
  const lists = await Promise.all(
    stages
      .filter((s) => s.kind === "OPEN")
      .map((s) =>
        db.candidateJob.findMany({
          where: {
            AND: [
              { stageId: s.id, status: "ACTIVE", lastMovedAt: { lt: new Date(now - limit(s.id) * 86400000) } },
              { job: visibleJobsWhere(actor) }, { candidate: { anonymizedAt: null } },
              ...(own ? [{ recruiterId: actor.id }] : []),
            ],
          },
          orderBy: { lastMovedAt: "asc" },
          take,
          select: {
            id: true, lastMovedAt: true, recruiterId: true,
            candidate: { select: { id: true, fullName: true } }, job: { select: { title: true } }, stage: { select: { key: true, name: true } },
          },
        }),
      ),
  );
  return lists.flat().sort((a, b) => a.lastMovedAt.getTime() - b.lastMovedAt.getTime()).slice(0, take)
    .map((p) => ({ ...p, idleDays: Math.floor((now - p.lastMovedAt.getTime()) / 86400000) }));
}

/** Renomear etapa e ajustar o prazo de alerta. A ordem e o tipo ficam fixos (o processo depende deles). */
export async function updateStage(actor: Actor, id: string, raw: { name: string; stalledDays: string }) {
  authorize(actor, "settings.manage");
  const name = raw.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) throw new ValidationError({ name: ["O nome deve ter de 2 a 40 caracteres."] });
  const days = raw.stalledDays.trim() === "" ? null : Number(raw.stalledDays);
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 60)) throw new ValidationError({ stalledDays: ["Use de 1 a 60 dias, ou deixe em branco para o padrão."] });
  const before = await db.recruitmentStage.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("Etapa não encontrada.");
  await db.$transaction(async (tx) => {
    await tx.recruitmentStage.update({ where: { id }, data: { name, stalledDays: before.kind === "OPEN" ? days : null } });
    await audit(tx, {
      actorId: actor.id, action: "stage.update", entityType: "RecruitmentStage", entityId: id,
      summary: `Atualizou a etapa ${before.name}${before.name !== name ? ` (agora ${name})` : ""}`,
      before: { name: before.name, stalledDays: before.stalledDays }, after: { name, stalledDays: days },
    });
  });
}
