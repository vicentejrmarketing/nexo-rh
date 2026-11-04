import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { authorize, canAccessStore, type Actor } from "@/server/authz/authorize";
import { visibleStoresWhere } from "@/server/authz/scopes";
import { NotFoundError, ValidationError, ForbiddenError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/modules/users/schemas";
import { addDays, startOfDaySP } from "@/lib/period";

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

const storeSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da loja.").max(80),
  city: z.string().trim().min(2, "Informe a cidade.").max(80),
  state: z.enum(UFS, "Selecione o estado."),
  address: z.string().trim().max(200).optional().transform((v) => v || null),
  managerId: z.string().optional().transform((v) => v || null),
  employeeCount: z.coerce.number().int("Use um número inteiro.").min(0, "Não pode ser negativo.").max(100000),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
export type StoreInput = z.input<typeof storeSchema>;

export async function listStores(actor: Actor, f: { q?: string; status?: string } = {}) {
  authorize(actor, "stores.view");
  const where: Prisma.StoreWhereInput = { AND: [visibleStoresWhere(actor)] };
  const and = where.AND as Prisma.StoreWhereInput[];
  if (f.q?.trim()) and.push({ OR: [{ name: { contains: f.q.trim(), mode: "insensitive" } }, { city: { contains: f.q.trim(), mode: "insensitive" } }] });
  if (f.status === "ACTIVE" || f.status === "INACTIVE") and.push({ status: f.status });
  const stores = await db.store.findMany({
    where,
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, city: true, state: true, status: true, employeeCount: true,
      manager: { select: { name: true } },
      _count: { select: { jobs: { where: { status: "OPEN" } } } },
    },
  });
  // Processos ativos e contratações dos últimos 90 dias por loja, em duas consultas agrupadas.
  const ids = stores.map((s) => s.id);
  const since = addDays(startOfDaySP(new Date()), -90);
  const [active, hires] = await Promise.all([
    db.candidateJob.findMany({ where: { status: "ACTIVE", job: { storeId: { in: ids } } }, select: { job: { select: { storeId: true } } } }),
    db.candidateJob.findMany({ where: { hiredAt: { gte: since }, job: { storeId: { in: ids } } }, select: { job: { select: { storeId: true } } } }),
  ]);
  const count = (rows: { job: { storeId: string } }[]) => rows.reduce((m, r) => m.set(r.job.storeId, (m.get(r.job.storeId) ?? 0) + 1), new Map<string, number>());
  const a = count(active), h = count(hires);
  return stores.map((s) => ({ ...s, openJobs: s._count.jobs, activeProcesses: a.get(s.id) ?? 0, hires90: h.get(s.id) ?? 0 }));
}

/** Ranking: contratações, inscrições e conversão (contratados ÷ inscritos) no período. */
export async function storeRanking(actor: Actor, from: Date, to: Date) {
  authorize(actor, "stores.view");
  const rows = await db.candidateJob.findMany({
    where: { job: { store: visibleStoresWhere(actor) }, OR: [{ appliedAt: { gte: from, lt: to } }, { hiredAt: { gte: from, lt: to } }] },
    select: { appliedAt: true, hiredAt: true, job: { select: { store: { select: { id: true, name: true, city: true } } } } },
  });
  const map = new Map<string, { id: string; name: string; city: string; applications: number; hires: number }>();
  for (const r of rows) {
    const s = r.job.store;
    const e = map.get(s.id) ?? { ...s, applications: 0, hires: 0 };
    if (r.appliedAt >= from && r.appliedAt < to) e.applications++;
    if (r.hiredAt && r.hiredAt >= from && r.hiredAt < to) e.hires++;
    map.set(s.id, e);
  }
  return [...map.values()]
    .map((e) => ({ ...e, conversion: e.applications ? Math.round((e.hires / e.applications) * 100) : null }))
    .sort((x, y) => y.hires - x.hires || y.applications - x.applications)
    .slice(0, 10);
}

export async function getStore(actor: Actor, id: string) {
  authorize(actor, "stores.view");
  if (!canAccessStore(actor, id)) throw new NotFoundError("Loja não encontrada.");
  const store = await db.store.findUnique({ where: { id }, include: { manager: { select: { id: true, name: true } } } });
  if (!store) throw new NotFoundError("Loja não encontrada.");
  const since = addDays(startOfDaySP(new Date()), -30);
  const [jobs, processes, interviews, hires, activity, stageCounts] = await Promise.all([
    db.job.findMany({
      where: { storeId: id, status: { in: ["OPEN", "PAUSED"] } },
      orderBy: [{ priority: "desc" }, { openedAt: "desc" }],
      select: { id: true, title: true, status: true, priority: true, openings: true, recruiter: { select: { name: true } }, _count: { select: { processes: true } } },
    }),
    db.candidateJob.findMany({
      where: { job: { storeId: id }, status: "ACTIVE", candidate: { anonymizedAt: null } },
      orderBy: { lastMovedAt: "desc" },
      take: 12,
      select: { id: true, lastMovedAt: true, candidate: { select: { id: true, fullName: true } }, job: { select: { title: true } }, stage: { select: { key: true, name: true } } },
    }),
    db.interview.findMany({
      where: { storeId: id, scheduledAt: { gte: startOfDaySP(new Date()) }, status: "SCHEDULED" },
      orderBy: { scheduledAt: "asc" },
      take: 8,
      select: { id: true, scheduledAt: true, mode: true, candidateJob: { select: { candidate: { select: { fullName: true } }, job: { select: { title: true } } } } },
    }),
    db.candidateJob.findMany({
      where: { job: { storeId: id }, status: "HIRED" },
      orderBy: { hiredAt: "desc" },
      take: 8,
      select: { id: true, hiredAt: true, candidate: { select: { id: true, fullName: true } }, job: { select: { title: true } } },
    }),
    db.activityLog.findMany({ where: { storeId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, summary: true, createdAt: true, actor: { select: { name: true } } } }),
    db.candidateJob.groupBy({ by: ["status"], where: { job: { storeId: id } }, _count: true }),
  ]);
  const [applications30, hires30] = await Promise.all([
    db.candidateJob.count({ where: { job: { storeId: id }, appliedAt: { gte: since } } }),
    db.candidateJob.count({ where: { job: { storeId: id }, hiredAt: { gte: since } } }),
  ]);
  const byStatus = Object.fromEntries(stageCounts.map((g) => [g.status, g._count]));
  return {
    store, jobs, processes, interviews, hires, activity,
    stats: {
      openJobs: jobs.filter((j) => j.status === "OPEN").length,
      openings: jobs.filter((j) => j.status === "OPEN").reduce((a, j) => a + j.openings, 0),
      active: byStatus.ACTIVE ?? 0,
      applications30, hires30,
      conversion30: applications30 ? Math.round((hires30 / applications30) * 100) : null,
    },
  };
}

export async function listStoreManagers() {
  return db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function saveStore(actor: Actor, id: string | null, raw: StoreInput, ip?: string | null) {
  authorize(actor, "stores.manage");
  const parsed = storeSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  const data = parsed.data;
  if (id && !canAccessStore(actor, id)) throw new ForbiddenError();
  if (data.managerId && !(await db.user.findUnique({ where: { id: data.managerId }, select: { id: true } }))) {
    throw new ValidationError({ managerId: ["Responsável não encontrado."] });
  }
  try {
    return await db.$transaction(async (tx) => {
      const before = id ? await tx.store.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundError("Loja não encontrada.");
      const store = id ? await tx.store.update({ where: { id }, data }) : await tx.store.create({ data });
      await audit(tx, {
        actorId: actor.id, action: id ? "store.update" : "store.create", entityType: "Store", entityId: store.id, storeId: store.id, ipAddress: ip,
        summary: id ? `Atualizou a loja ${store.name}` : `Cadastrou a loja ${store.name} (${store.city}/${store.state})`,
        before: before ? { name: before.name, city: before.city, state: before.state, status: before.status, managerId: before.managerId } : undefined,
        after: { name: store.name, city: store.city, state: store.state, status: store.status, managerId: store.managerId },
      });
      return store;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ValidationError({ name: ["Já existe uma loja com este nome nesta cidade."] });
    throw e;
  }
}

/**
 * O que impede excluir a loja. Vagas sem candidatos saem junto com a loja;
 * vagas com candidatos (histórico) e entrevistas marcadas na loja bloqueiam a exclusão.
 */
export async function storeDeletionCheck(id: string) {
  const [jobs, interviews] = await Promise.all([
    db.job.findMany({ where: { storeId: id }, select: { id: true, _count: { select: { processes: true } } } }),
    db.interview.count({ where: { storeId: id } }),
  ]);
  const withCandidates = jobs.filter((j) => j._count.processes > 0).length;
  return { emptyJobs: jobs.length - withCandidates, jobsWithCandidates: withCandidates, interviews, allowed: withCandidates === 0 && interviews === 0 };
}

export async function deleteStore(actor: Actor, id: string, ip?: string | null) {
  authorize(actor, "stores.manage");
  if (!canAccessStore(actor, id)) throw new NotFoundError("Loja não encontrada.");
  const store = await db.store.findUnique({ where: { id } });
  if (!store) throw new NotFoundError("Loja não encontrada.");
  const check = await storeDeletionCheck(id);
  if (!check.allowed) {
    const parts = [
      check.jobsWithCandidates ? `${check.jobsWithCandidates} vaga(s) com candidatos` : null,
      check.interviews ? `${check.interviews} entrevista(s) registrada(s)` : null,
    ].filter(Boolean).join(" e ");
    throw new ForbiddenError(`Esta loja tem ${parts}. Para manter o histórico, inative a loja em vez de excluir.`);
  }
  await db.$transaction(async (tx) => {
    // Revalida dentro da transação: ninguém pode ter vinculado candidato no meio do caminho.
    const busy = await tx.job.count({ where: { storeId: id, processes: { some: {} } } });
    if (busy || (await tx.interview.count({ where: { storeId: id } }))) throw new ForbiddenError("A loja ganhou candidatos ou entrevistas agora há pouco. Atualize a página.");
    const removed = await tx.job.deleteMany({ where: { storeId: id } });
    await tx.store.delete({ where: { id } }); // acessos de usuários saem junto; candidatos perdem só a "loja desejada"
    await audit(tx, {
      actorId: actor.id, action: "store.delete", entityType: "Store", entityId: id, ipAddress: ip,
      summary: `Excluiu a loja ${store.name} (${store.city}/${store.state})${removed.count ? ` e ${removed.count} vaga(s) sem candidatos` : ""}`,
      before: { name: store.name, city: store.city, state: store.state, status: store.status, managerId: store.managerId },
    });
  });
}
