import "server-only";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { authorize, type Actor } from "@/server/authz/authorize";
import { visibleJobsWhere, visibleCandidatesWhere } from "@/server/authz/scopes";
import { NotFoundError, ValidationError } from "@/server/errors";
import { anonymizeCandidate } from "@/server/modules/candidates/service";
import { addDays } from "@/lib/period";

/** Painel "Site de vagas": vagas do alcance do usuário, com situação no site e inscrições recebidas por ele. */
export async function siteOverview(actor: Actor) {
  authorize(actor, "jobs.view");
  const jobs = await db.job.findMany({
    where: { AND: [visibleJobsWhere(actor), { status: { in: ["OPEN", "PAUSED", "CLOSED", "DRAFT"] } }] },
    orderBy: [{ status: "asc" }, { publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true, slug: true, title: true, status: true, publishedOnline: true, publishedAt: true, recruiterId: true, storeId: true,
      store: { select: { name: true, status: true } },
    },
  });
  const ids = jobs.map((j) => j.id);
  const since = addDays(new Date(), -7);
  const [all, week] = await Promise.all([
    db.candidateJob.groupBy({ by: ["jobId"], where: { jobId: { in: ids }, source: "ONLINE_FORM" }, _count: true }),
    db.candidateJob.groupBy({ by: ["jobId"], where: { jobId: { in: ids }, source: "ONLINE_FORM", appliedAt: { gte: since } }, _count: true }),
  ]);
  const allMap = new Map(all.map((a) => [a.jobId, a._count]));
  const weekMap = new Map(week.map((a) => [a.jobId, a._count]));
  const rows = jobs.map((j) => ({
    ...j,
    live: j.publishedOnline && j.status === "OPEN" && j.store.status === "ACTIVE",
    siteApplications: allMap.get(j.id) ?? 0,
    siteApplications7: weekMap.get(j.id) ?? 0,
  }));
  return {
    rows,
    stats: {
      live: rows.filter((r) => r.live).length,
      total: rows.reduce((s, r) => s + r.siteApplications, 0),
      week: rows.reduce((s, r) => s + r.siteApplications7, 0),
    },
  };
}

export async function recentSiteApplications(actor: Actor, take = 12) {
  authorize(actor, "candidates.view");
  return db.candidateJob.findMany({
    where: { source: "ONLINE_FORM", job: visibleJobsWhere(actor), candidate: { AND: [visibleCandidatesWhere(actor), { anonymizedAt: null }] } },
    orderBy: { appliedAt: "desc" },
    take,
    select: {
      id: true, appliedAt: true, salaryExpectation: true, currentlyEmployed: true,
      candidate: { select: { id: true, fullName: true, city: true, state: true } },
      job: { select: { id: true, title: true, store: { select: { name: true } } } },
      stage: { select: { key: true, name: true } },
    },
  });
}

// ───────── Pedidos de privacidade ─────────

export async function listPrivacyRequests(actor: Actor) {
  authorize(actor, "privacy.manage");
  return db.privacyRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: { candidate: { select: { id: true, fullName: true, anonymizedAt: true } }, handledBy: { select: { name: true } } },
  });
}

export async function openPrivacyRequests(actor: Actor) {
  if (!actor.permissions.has("privacy.manage")) return 0;
  return db.privacyRequest.count({ where: { status: "OPEN" } });
}

/** Concluir (anonimizando o cadastro vinculado, se houver) ou recusar (ex.: não foi possível confirmar a identidade). */
export async function resolvePrivacyRequest(actor: Actor, id: string, action: "anonymize" | "done" | "reject", ip?: string | null) {
  authorize(actor, "privacy.manage");
  const req = await db.privacyRequest.findUnique({ where: { id } });
  if (!req) throw new NotFoundError("Pedido não encontrado.");
  if (req.status !== "OPEN") throw new ValidationError({ status: ["Este pedido já foi tratado."] });
  if (action === "anonymize") {
    if (!req.candidateId) throw new ValidationError({ status: ["Nenhum cadastro foi encontrado com esses dados."] });
    await anonymizeCandidate(actor, req.candidateId, ip, "Pedido do titular pelo site");
  }
  await db.$transaction(async (tx) => {
    await tx.privacyRequest.update({
      where: { id },
      // Depois de tratado, o pedido guarda só o necessário para comprovar o atendimento.
      data: { status: action === "reject" ? "REJECTED" : "DONE", handledById: actor.id, handledAt: new Date(), ...(action !== "reject" ? { phoneE164: null, email: null, message: null } : {}) },
    });
    await audit(tx, {
      actorId: actor.id, action: `privacy.request.${action}`, entityType: "PrivacyRequest", entityId: id, ipAddress: ip,
      summary: action === "reject" ? "Recusou um pedido de exclusão de dados" : action === "anonymize" ? "Atendeu um pedido de exclusão: dados anonimizados" : "Concluiu um pedido de exclusão de dados",
    });
  });
}
