import "server-only";
import { ensureAlerts } from "@/server/modules/alerts/service";
import { unreadTotal } from "@/server/modules/messages/service";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { authorize, scopeFor, type Actor } from "@/server/authz/authorize";
import { candidateWhere, jobWhere, processWhere, unscoped, type AnyScope } from "@/server/authz/scopes";
import { addDays, daysBetween, dayKey, percentChange, startOfDaySP, type Period } from "@/lib/period";

// Todos os números do painel vêm do banco e respeitam o escopo do usuário (lojas e, para
// recrutador, os próprios processos). Nada é estimado ou fixo.

/** Totais gerais (sem período), usados nos testes de escopo e como referência. */
export async function getHeadlineKpis(actor: Actor) {
  authorize(actor, "dashboard.view");
  const scope = scopeFor(actor);
  const pw = processWhere(scope);
  const cw = candidateWhere(scope);
  const [candidates, conversations, interviews, approved, hired] = await Promise.all([
    db.candidate.count({ where: cw }),
    db.conversation.count({ where: unscoped(scope) ? {} : { candidate: cw } }),
    db.interview.count({ where: { status: "SCHEDULED", candidateJob: pw } }),
    db.candidateJob.count({ where: { ...pw, stage: { key: "approved" } } }),
    db.candidateJob.count({ where: { ...pw, status: "HIRED" } }),
  ]);
  return { candidates, conversations, interviews, approved, hired };
}

export type DashFilters = { storeId?: string; recruiterId?: string };

/** Escopo do usuário, estreitado pelos filtros da tela (nunca ampliado). */
function scopeWith(actor: Actor, f: DashFilters = {}): AnyScope {
  const base = scopeFor(actor);
  let scope: AnyScope = base;
  if (f.storeId && (base.kind === "all" || base.storeIds.includes(f.storeId))) {
    scope = { kind: "stores", storeIds: [f.storeId], ...(base.kind === "stores" && base.ownerId ? { ownerId: base.ownerId } : {}) };
  }
  // Recrutador já está limitado aos próprios processos; o filtro só vale para quem vê a equipe.
  if (f.recruiterId && !(base.kind === "stores" && base.ownerId)) {
    scope = { ...scope, ownerId: f.recruiterId };
  }
  return scope;
}

type Range = { gte: Date; lt: Date };
const range = (from: Date, to: Date): Range => ({ gte: from, lt: to });

/** Datas dos eventos de cada indicador dentro de um intervalo (para contagem e série diária). */
async function kpiEvents(scope: AnyScope, r: Range) {
  const pw = processWhere(scope);
  const cw = candidateWhere(scope);
  const [candidates, conversations, interviews, approvals, hires] = await Promise.all([
    db.candidate.findMany({ where: { ...cw, createdAt: r }, select: { createdAt: true } }),
    db.conversation.findMany({ where: { createdAt: r, ...(unscoped(scope) ? {} : { candidate: cw }) }, select: { createdAt: true } }),
    db.interview.findMany({ where: { createdAt: r, candidateJob: pw }, select: { createdAt: true } }),
    db.stageHistory.findMany({ where: { movedAt: r, toStage: { key: "approved" }, candidateJob: pw }, select: { movedAt: true } }),
    db.candidateJob.findMany({ where: { ...pw, hiredAt: r }, select: { hiredAt: true } }),
  ]);
  return {
    candidates: candidates.map((x) => x.createdAt),
    conversations: conversations.map((x) => x.createdAt),
    interviews: interviews.map((x) => x.createdAt),
    approved: approvals.map((x) => x.movedAt),
    hired: hires.map((x) => x.hiredAt!),
  };
}

function dailySeries(dates: Date[], days: Date[]): number[] {
  const counts = new Map<string, number>();
  for (const d of dates) counts.set(dayKey(d), (counts.get(dayKey(d)) ?? 0) + 1);
  return days.map((d) => counts.get(dayKey(d)) ?? 0);
}

export type KpiKey = "candidates" | "conversations" | "interviews" | "approved" | "hired";
export type Kpi = { key: KpiKey; value: number; change: number | null; spark: number[] };

export async function getKpis(actor: Actor, period: Period, f?: DashFilters): Promise<Kpi[]> {
  authorize(actor, "dashboard.view");
  const scope = scopeWith(actor, f);
  // O minigráfico mostra no mínimo 14 dias, para ter forma mesmo no filtro "Hoje".
  const sparkFrom = new Date(Math.min(period.from.getTime(), addDays(startOfDaySP(period.to), -14).getTime()));
  const [current, previous, spark] = await Promise.all([
    kpiEvents(scope, range(period.from, period.to)),
    kpiEvents(scope, range(period.prevFrom, period.prevTo)),
    kpiEvents(scope, range(sparkFrom, period.to)),
  ]);
  const days = daysBetween(sparkFrom, period.to);
  return (["candidates", "conversations", "interviews", "approved", "hired"] as KpiKey[]).map((key) => ({
    key,
    value: current[key].length,
    change: percentChange(current[key].length, previous[key].length),
    spark: dailySeries(spark[key], days),
  }));
}

/** Desempenho geral: candidatos, entrevistas e contratações por dia. */
export async function getPerformance(actor: Actor, days: number, f?: DashFilters) {
  authorize(actor, "dashboard.view");
  const scope = scopeWith(actor, f);
  const to = addDays(startOfDaySP(new Date()), 1);
  const from = addDays(to, -days);
  const ev = await kpiEvents(scope, range(from, to));
  const list = daysBetween(from, to);
  const c = dailySeries(ev.candidates, list);
  const i = dailySeries(ev.interviews, list);
  const h = dailySeries(ev.hired, list);
  // Agrupa em blocos (7 dias → diário, 30 → a cada 2 dias, 90 → semanal) para o gráfico ficar legível.
  const size = days <= 7 ? 1 : days <= 30 ? 2 : 7;
  const out: { day: string; candidatos: number; entrevistas: number; contratacoes: number }[] = [];
  for (let k = list.length % size; k < list.length; k += size) {
    const sum = (arr: number[]) => arr.slice(Math.max(0, k), k + size).reduce((a, b) => a + b, 0);
    out.push({ day: dayKey(list[Math.min(list.length - 1, k + size - 1)]), candidatos: sum(c), entrevistas: sum(i), contratacoes: sum(h) });
  }
  return out;
}

/**
 * Funil acumulado: quantos processos chegaram a cada etapa (pela etapa atual e pelo histórico).
 * Contratado conta como tendo passado por todas as etapas; reprovação e desistência não avançam.
 */
export async function getFunnel(actor: Actor, period: Period | null, f?: DashFilters) {
  authorize(actor, "dashboard.view");
  const scope = scopeWith(actor, f);
  const [stages, processes] = await Promise.all([
    db.recruitmentStage.findMany({ where: { active: true, kind: "OPEN" }, orderBy: { order: "asc" }, select: { key: true, name: true, order: true } }),
    db.candidateJob.findMany({
      where: { ...processWhere(scope), ...(period ? { appliedAt: range(period.from, period.to) } : {}) },
      select: { stage: { select: { order: true, kind: true } }, history: { select: { toStage: { select: { order: true, kind: true } } } } },
    }),
  ]);
  const reached = processes.map((p) => {
    if (p.stage.kind === "HIRED") return Infinity;
    const orders = [p.stage, ...p.history.map((h) => h.toStage)].filter((s) => s.kind === "OPEN").map((s) => s.order);
    return orders.length ? Math.max(...orders) : -Infinity;
  });
  const rows = stages.map((s) => ({ key: s.key, name: s.name, count: reached.filter((r) => r >= s.order).length }));
  const base = rows[0]?.count ?? 0;
  return rows.map((r) => ({ ...r, percent: base ? Math.round((r.count / base) * 100) : null }));
}

export async function getJobsByStatus(actor: Actor, f?: DashFilters) {
  authorize(actor, "dashboard.view");
  const groups = await db.job.groupBy({ by: ["status"], where: { ...jobWhere(scopeWith(actor, f)), status: { in: ["OPEN", "PAUSED", "CLOSED"] } }, _count: true });
  const get = (s: string) => groups.find((g) => g.status === s)?._count ?? 0;
  const open = get("OPEN"), paused = get("PAUSED"), closed = get("CLOSED");
  return { total: open + paused + closed, open, paused, closed };
}

/** Top 5 lojas por contratações no período. */
export async function getStoreRanking(actor: Actor, period: Period, f?: DashFilters, take = 5) {
  authorize(actor, "dashboard.view");
  const scope = scopeWith(actor, f);
  const hires = await db.candidateJob.findMany({
    where: { ...processWhere(scope), hiredAt: range(period.from, period.to) },
    select: { job: { select: { store: { select: { id: true, name: true } } } } },
  });
  const map = new Map<string, { name: string; value: number }>();
  for (const h of hires) {
    const s = h.job.store;
    map.set(s.id, { name: s.name, value: (map.get(s.id)?.value ?? 0) + 1 });
  }
  return [...map.values()].sort((a, b) => b.value - a.value).slice(0, take);
}

export async function getRecentActivity(actor: Actor, take = 5) {
  authorize(actor, "dashboard.view");
  const scope = scopeFor(actor);
  // Atividades de usuários (login, permissões) só aparecem para quem pode ver o histórico completo.
  const where: Prisma.ActivityLogWhereInput = {
    action: { notIn: ["auth.login", "auth.logout", "auth.locked"] },
    ...(scope.kind === "stores" ? { OR: [{ storeId: { in: scope.storeIds } }, { actorId: actor.id }] } : {}),
  };
  return db.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, summary: true, createdAt: true, actor: { select: { name: true } } },
  });
}

export async function getFollowUps(actor: Actor, f?: DashFilters, take = 5) {
  authorize(actor, "dashboard.view");
  return db.candidateJob.findMany({
    where: { ...processWhere(scopeWith(actor, f)), status: "ACTIVE", candidate: { anonymizedAt: null } },
    orderBy: { lastMovedAt: "desc" },
    take,
    select: {
      id: true, lastMovedAt: true,
      candidate: { select: { id: true, fullName: true } },
      job: { select: { title: true, store: { select: { name: true } } } },
      stage: { select: { key: true, name: true } },
    },
  });
}

/** Opções dos filtros de loja e recrutador, dentro do acesso do usuário. */
export async function getFilterOptions(actor: Actor) {
  authorize(actor, "dashboard.view");
  const base = scopeFor(actor);
  const [stores, recruiters] = await Promise.all([
    db.store.findMany({ where: base.kind === "stores" ? { id: { in: base.storeIds } } : {}, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    base.kind === "stores" && base.ownerId
      ? Promise.resolve([])
      : db.user.findMany({
          where: { status: "ACTIVE", role: { key: "RECRUITER" }, ...(base.kind === "stores" ? { stores: { some: { storeId: { in: base.storeIds } } } } : {}) },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
  ]);
  return { stores, recruiters };
}

/** Números do banner: lojas ativas, estados e contatos (conversas) no acesso do usuário. */
export async function getFootprint(actor: Actor) {
  authorize(actor, "dashboard.view");
  const scope = scopeFor(actor);
  const storeWhere: Prisma.StoreWhereInput = { status: "ACTIVE", ...(scope.kind === "stores" ? { id: { in: scope.storeIds } } : {}) };
  const [stores, states, contacts] = await Promise.all([
    db.store.count({ where: storeWhere }),
    db.store.findMany({ where: storeWhere, distinct: ["state"], select: { state: true }, orderBy: { state: "asc" } }),
    db.conversation.count({ where: scope.kind === "all" ? {} : { candidate: candidateWhere(scope) } }),
  ]);
  return { stores, states: states.map((s) => s.state), contacts };
}

/** Contadores do menu e do sino (uma consulta por requisição, mesmo usados em dois lugares). */
export const getShellCounters = cache(async (actor: Actor) => {
  await ensureAlerts(actor).catch((e) => console.error("[alertas]", e));
  const [unreadMessages, notifications] = await Promise.all([
    unreadTotal(actor),
    db.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true } }),
  ]);
  return {
    unreadMessages,
    notifications,
    unreadNotifications: notifications.filter((n) => !n.readAt).length,
  };
});
