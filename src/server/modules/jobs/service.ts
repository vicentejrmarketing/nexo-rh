import "server-only";
import { z } from "zod";
import type { ContractType, JobStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { authorize, canAccessStore, type Actor } from "@/server/authz/authorize";
import { canEditJob, visibleJobsWhere } from "@/server/authz/scopes";
import { ROLES } from "@/server/authz/catalog";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/modules/users/schemas";
import { parseMoneyBR } from "@/lib/form";
import { jobSlug } from "@/lib/text";
import { parseDateSP } from "@/lib/period";

export const JOB_STATUS_LABEL: Record<JobStatus, string> = { DRAFT: "Rascunho", OPEN: "Aberta", PAUSED: "Pausada", CLOSED: "Encerrada", CANCELED: "Cancelada" };
export const CONTRACT_LABEL: Record<ContractType, string> = {
  CLT: "CLT (efetivo)", INTERNSHIP: "Estágio", TEMPORARY: "Temporário", APPRENTICE: "Jovem Aprendiz", PJ: "PJ", PART_TIME: "Meio período",
};
export const PRIORITY_LABEL = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", URGENT: "Urgente" } as const;

const money = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const n = parseMoneyBR(v ?? "");
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: "custom", message: "Valor inválido. Ex.: 1.800,00" });
      return z.NEVER;
    }
    return n;
  });

const optionalDate = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const d = parseDateSP(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "Data inválida." });
      return z.NEVER;
    }
    return d;
  });

const jobSchema = z
  .object({
    title: z.string().trim().min(3, "Informe o nome da vaga.").max(120),
    description: z.string().trim().min(10, "Descreva a vaga (mínimo 10 caracteres).").max(10000),
    requirements: z.string().trim().max(5000).optional().transform((v) => v || null),
    responsibilities: z.string().trim().max(5000).optional().transform((v) => v || null),
    contractType: z.enum(["CLT", "INTERNSHIP", "TEMPORARY", "APPRENTICE", "PJ", "PART_TIME"], "Selecione o tipo de contratação.").default("CLT"),
    showSalary: z.string().optional().transform((v) => v === "on" || v === "true"),
    salaryMin: money,
    salaryMax: money,
    salaryText: z.string().trim().max(80).optional().transform((v) => v || null),
    benefits: z.string().trim().max(5000).optional().transform((v) => v || null),
    openings: z.coerce.number().int("Use um número inteiro.").min(1, "Mínimo de 1 vaga.").max(500),
    storeId: z.string().min(1, "Selecione a loja."),
    positionId: z.string().optional().transform((v) => v || null),
    city: z.string().trim().max(80).optional().transform((v) => v || ""),
    recruiterId: z.string().optional().transform((v) => v || null),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
    expectedCloseAt: optionalDate,
    publishedOnline: z.string().optional().transform((v) => v === "on" || v === "true"),
    status: z.enum(["DRAFT", "OPEN"]).optional(),
  })
  .refine((v) => v.salaryMin === null || v.salaryMax === null || v.salaryMin <= v.salaryMax, { path: ["salaryMax"], message: "O máximo deve ser maior que o mínimo." });

export type JobInput = z.input<typeof jobSchema>;

const listSelect = {
  id: true, title: true, status: true, priority: true, openings: true, city: true, openedAt: true, expectedCloseAt: true, createdAt: true,
  storeId: true, recruiterId: true,
  store: { select: { id: true, name: true } },
  position: { select: { name: true } },
  recruiter: { select: { id: true, name: true } },
} satisfies Prisma.JobSelect;

export async function listJobs(actor: Actor, f: { q?: string; status?: string; storeId?: string; recruiterId?: string; priority?: string; mine?: boolean } = {}) {
  authorize(actor, "jobs.view");
  const and: Prisma.JobWhereInput[] = [visibleJobsWhere(actor)];
  if (f.q?.trim()) and.push({ OR: [{ title: { contains: f.q.trim(), mode: "insensitive" } }, { city: { contains: f.q.trim(), mode: "insensitive" } }] });
  if (f.status && f.status in JOB_STATUS_LABEL) and.push({ status: f.status as JobStatus });
  else and.push({ status: { notIn: ["CLOSED", "CANCELED"] } }); // padrão: o que está em andamento
  if (f.storeId) and.push({ storeId: f.storeId });
  if (f.recruiterId) and.push({ recruiterId: f.recruiterId });
  if (f.priority && f.priority in PRIORITY_LABEL) and.push({ priority: f.priority as keyof typeof PRIORITY_LABEL });
  if (f.mine) and.push({ recruiterId: actor.id });
  const jobs = await db.job.findMany({
    where: { AND: and },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: { ...listSelect, _count: { select: { processes: true } } },
  });
  const ids = jobs.map((j) => j.id);
  const hired = await db.candidateJob.groupBy({ by: ["jobId"], where: { jobId: { in: ids }, status: "HIRED" }, _count: true });
  const hiredMap = new Map(hired.map((h) => [h.jobId, h._count]));
  return jobs.map((j) => ({ ...j, applicants: j._count.processes, hired: hiredMap.get(j.id) ?? 0, canEdit: canEditJob(actor, j) }));
}

export async function getJob(actor: Actor, id: string) {
  authorize(actor, "jobs.view");
  const job = await db.job.findFirst({
    where: { AND: [{ id }, visibleJobsWhere(actor)] },
    include: {
      store: { select: { id: true, name: true, city: true, state: true } },
      position: { select: { id: true, name: true } },
      recruiter: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!job) throw new NotFoundError("Vaga não encontrada.");
  const [processes, stages] = await Promise.all([
    db.candidateJob.findMany({
      where: { jobId: id, candidate: { anonymizedAt: null } },
      orderBy: [{ lastMovedAt: "desc" }],
      select: {
        id: true, status: true, appliedAt: true, lastMovedAt: true, source: true,
        candidate: { select: { id: true, fullName: true, phoneE164: true, city: true } },
        stage: { select: { key: true, name: true, order: true, kind: true } },
        recruiter: { select: { name: true } },
      },
    }),
    db.recruitmentStage.findMany({ where: { active: true }, orderBy: { order: "asc" }, select: { key: true, name: true, kind: true } }),
  ]);
  const byStage = stages.map((s) => ({ ...s, count: processes.filter((p) => p.stage.key === s.key).length }));
  const hired = processes.filter((p) => p.status === "HIRED").length;
  const daysOpen = job.openedAt ? Math.max(0, Math.floor(((job.closedAt ?? new Date()).getTime() - job.openedAt.getTime()) / 86400000)) : null;
  return {
    job, processes, byStage,
    stats: { applicants: processes.length, active: processes.filter((p) => p.status === "ACTIVE").length, hired, remaining: Math.max(0, job.openings - hired), daysOpen },
    canEdit: canEditJob(actor, job),
    canCreate: actor.permissions.has("jobs.create"),
    canDelete: actor.permissions.has("jobs.delete") && canAccessStore(actor, job.storeId),
  };
}

export async function jobFormOptions(actor: Actor) {
  const [stores, positions, recruiters] = await Promise.all([
    db.store.findMany({ where: { status: "ACTIVE", ...(actor.allStores ? {} : { id: { in: actor.storeIds } }) }, select: { id: true, name: true, city: true }, orderBy: { name: "asc" } }),
    db.position.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({
      where: { status: "ACTIVE", role: { key: { in: ["RECRUITER", "HR_MANAGER", "ADMIN"] } } },
      select: { id: true, name: true, role: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return { stores, positions, recruiters };
}

async function validateRefs(actor: Actor, data: { storeId: string; positionId: string | null; recruiterId: string | null }) {
  if (!canAccessStore(actor, data.storeId)) throw new ValidationError({ storeId: ["Esta loja não está entre as suas lojas autorizadas."] });
  const [store, position, recruiter] = await Promise.all([
    db.store.findUnique({ where: { id: data.storeId }, select: { city: true, name: true } }),
    data.positionId ? db.position.findUnique({ where: { id: data.positionId }, select: { id: true } }) : Promise.resolve({ id: "" }),
    data.recruiterId ? db.user.findFirst({ where: { id: data.recruiterId, status: "ACTIVE" }, select: { id: true } }) : Promise.resolve({ id: "" }),
  ]);
  if (!store) throw new ValidationError({ storeId: ["Loja não encontrada."] });
  if (!position) throw new ValidationError({ positionId: ["Cargo não encontrado."] });
  if (!recruiter) throw new ValidationError({ recruiterId: ["Responsável não encontrado ou inativo."] });
  return store;
}

function auditData(j: { title: string; status: string; storeId: string; recruiterId: string | null; openings: number; priority: string }) {
  return { title: j.title, status: j.status, storeId: j.storeId, recruiterId: j.recruiterId, openings: j.openings, priority: j.priority };
}

export async function createJob(actor: Actor, raw: JobInput, ip?: string | null) {
  authorize(actor, "jobs.create");
  const parsed = jobSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  const { status, ...data } = parsed.data;
  // Recrutador que cria a vaga fica como responsável, a menos que escolha outro.
  if (!data.recruiterId && ROLES[actor.roleKey].ownRecordsOnly) data.recruiterId = actor.id;
  const store = await validateRefs(actor, data);
  const finalStatus = status ?? "OPEN";
  return db.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        ...data, city: data.city || store.city, slug: jobSlug(data.title, data.city || store.city), status: finalStatus,
        openedAt: finalStatus === "OPEN" ? new Date() : null, createdById: actor.id,
        publishedAt: finalStatus === "OPEN" && data.publishedOnline ? new Date() : null,
      },
    });
    await audit(tx, {
      actorId: actor.id, action: "job.create", entityType: "Job", entityId: job.id, storeId: job.storeId, ipAddress: ip,
      summary: `Criou a vaga ${job.title} – ${store.name}${finalStatus === "DRAFT" ? " (rascunho)" : ""}`, after: auditData(job),
    });
    return job;
  });
}

async function loadEditable(actor: Actor, id: string) {
  const job = await db.job.findFirst({ where: { AND: [{ id }, visibleJobsWhere(actor)] } });
  if (!job) throw new NotFoundError("Vaga não encontrada.");
  if (!canEditJob(actor, job)) throw new ForbiddenError("Só o responsável pela vaga ou a gestão de RH pode alterá-la.");
  return job;
}

export async function updateJob(actor: Actor, id: string, raw: JobInput, ip?: string | null) {
  authorize(actor, "jobs.update");
  const before = await loadEditable(actor, id);
  const parsed = jobSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  const { status: _ignored, ...data } = parsed.data;
  const store = await validateRefs(actor, data);
  return db.$transaction(async (tx) => {
    const job = await tx.job.update({
      where: { id },
      data: { ...data, city: data.city || store.city, publishedAt: publishedAtFor({ status: before.status, publishedOnline: data.publishedOnline, publishedAt: before.publishedAt }) },
    });
    await audit(tx, {
      actorId: actor.id, action: "job.update", entityType: "Job", entityId: id, storeId: job.storeId, ipAddress: ip,
      summary: `Atualizou a vaga ${job.title}`, before: auditData(before), after: auditData(job),
    });
    return job;
  });
}

// Transições permitidas: rascunho→aberta; aberta⇄pausada; aberta/pausada→encerrada; encerrada→aberta (reabrir).
// Cancelada: vaga que não vai mais acontecer (some do site); pode voltar a rascunho.
const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ["OPEN", "CANCELED"], OPEN: ["PAUSED", "CLOSED", "CANCELED"], PAUSED: ["OPEN", "CLOSED", "CANCELED"], CLOSED: ["OPEN"], CANCELED: ["DRAFT"],
};
const VERB: Record<JobStatus, string> = { OPEN: "Abriu", PAUSED: "Pausou", CLOSED: "Encerrou", DRAFT: "Voltou para rascunho", CANCELED: "Cancelou" };

/** Data da primeira publicação: quando a vaga fica aberta E marcada para o site. */
export function publishedAtFor(j: { status: JobStatus; publishedOnline: boolean; publishedAt: Date | null }): Date | null | undefined {
  return j.status === "OPEN" && j.publishedOnline && !j.publishedAt ? new Date() : undefined;
}

export async function setJobStatus(actor: Actor, id: string, status: JobStatus, ip?: string | null) {
  authorize(actor, "jobs.update");
  const job = await loadEditable(actor, id);
  if (job.status === status) return job;
  if (!TRANSITIONS[job.status].includes(status)) {
    throw new ValidationError({ status: [`Não é possível passar de "${JOB_STATUS_LABEL[job.status]}" para "${JOB_STATUS_LABEL[status]}".`] });
  }
  return db.$transaction(async (tx) => {
    const updated = await tx.job.update({
      where: { id },
      data: {
        status,
        openedAt: status === "OPEN" && !job.openedAt ? new Date() : undefined,
        closedAt: status === "CLOSED" || status === "CANCELED" ? new Date() : status === "OPEN" ? null : undefined,
        publishedAt: publishedAtFor({ status, publishedOnline: job.publishedOnline, publishedAt: job.publishedAt }),
      },
    });
    await audit(tx, {
      actorId: actor.id, action: `job.${status.toLowerCase()}`, entityType: "Job", entityId: id, storeId: job.storeId, ipAddress: ip,
      summary: `${job.status === "CLOSED" && status === "OPEN" ? "Reabriu" : VERB[status]} a vaga ${job.title}`,
      before: { status: job.status }, after: { status },
    });
    return updated;
  });
}

export async function duplicateJob(actor: Actor, id: string, ip?: string | null) {
  authorize(actor, "jobs.create");
  const src = await db.job.findFirst({ where: { AND: [{ id }, visibleJobsWhere(actor)] } });
  if (!src) throw new NotFoundError("Vaga não encontrada.");
  return db.$transaction(async (tx) => {
    const copy = await tx.job.create({
      data: {
        title: src.title, description: src.description, requirements: src.requirements, salaryMin: src.salaryMin, salaryMax: src.salaryMax,
        salaryText: src.salaryText, benefits: src.benefits, openings: src.openings, storeId: src.storeId, positionId: src.positionId,
        city: src.city, recruiterId: src.recruiterId, priority: src.priority, publishedOnline: src.publishedOnline,
        contractType: src.contractType, responsibilities: src.responsibilities, showSalary: src.showSalary,
        status: "DRAFT", slug: jobSlug(src.title, src.city), createdById: actor.id,
      },
    });
    await audit(tx, {
      actorId: actor.id, action: "job.duplicate", entityType: "Job", entityId: copy.id, storeId: copy.storeId, ipAddress: ip,
      summary: `Duplicou a vaga ${src.title} (nova vaga em rascunho)`,
    });
    return copy;
  });
}

export async function deleteJob(actor: Actor, id: string, ip?: string | null) {
  authorize(actor, "jobs.delete");
  const job = await db.job.findFirst({ where: { AND: [{ id }, visibleJobsWhere(actor)] }, include: { _count: { select: { processes: true } } } });
  if (!job) throw new NotFoundError("Vaga não encontrada.");
  if (job._count.processes > 0) {
    throw new ForbiddenError(`Esta vaga tem ${job._count.processes} candidato(s) vinculado(s). Encerre a vaga em vez de excluir, para manter o histórico.`);
  }
  await db.$transaction(async (tx) => {
    await tx.job.delete({ where: { id } });
    await audit(tx, {
      actorId: actor.id, action: "job.delete", entityType: "Job", entityId: id, storeId: job.storeId, ipAddress: ip,
      summary: `Excluiu a vaga ${job.title}`, before: auditData(job),
    });
  });
}

/** Publica ou retira a vaga do site de vagas (independente do status administrativo). */
export async function setJobPublished(actor: Actor, id: string, published: boolean, ip?: string | null) {
  authorize(actor, "jobs.update");
  const job = await loadEditable(actor, id);
  if (job.publishedOnline === published) return job;
  return db.$transaction(async (tx) => {
    const updated = await tx.job.update({
      where: { id },
      data: { publishedOnline: published, publishedAt: publishedAtFor({ status: job.status, publishedOnline: published, publishedAt: job.publishedAt }) },
    });
    await audit(tx, {
      actorId: actor.id, action: published ? "job.publish" : "job.unpublish", entityType: "Job", entityId: id, storeId: job.storeId, ipAddress: ip,
      summary: `${published ? "Publicou" : "Retirou"} a vaga ${job.title} ${published ? "no" : "do"} site`,
    });
    return updated;
  });
}
