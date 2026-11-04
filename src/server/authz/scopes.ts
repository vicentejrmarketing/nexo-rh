// Filtros de banco que traduzem o acesso de cada usuário. Usados por todos os módulos:
// o que não passa por aqui, o usuário não vê.
import type { Prisma } from "@/generated/prisma/client";
import { ROLES } from "./catalog";
import { scopeFor, type Actor, type Scope } from "./authorize";

/** "Todas as lojas" também pode ser filtrado por recrutador (painel). */
export type AnyScope = { kind: "all"; ownerId?: string } | Extract<Scope, { kind: "stores" }>;

export const unscoped = (s: AnyScope) => s.kind === "all" && !s.ownerId;

/** Processos seletivos: pela loja da vaga e, com responsável, pelo recrutador do processo. */
export function processWhere(scope: AnyScope): Prisma.CandidateJobWhereInput {
  if (scope.kind === "all") return scope.ownerId ? { recruiterId: scope.ownerId } : {};
  return { job: { storeId: { in: scope.storeIds } }, ...(scope.ownerId ? { recruiterId: scope.ownerId } : {}) };
}

/** Candidatos "do" escopo (indicadores): loja desejada ou processo nas lojas; com responsável, os dele. */
export function candidateWhere(scope: AnyScope): Prisma.CandidateWhereInput {
  if (scope.kind === "all" && scope.ownerId) {
    return { anonymizedAt: null, OR: [{ ownerId: scope.ownerId }, { processes: { some: { recruiterId: scope.ownerId } } }] };
  }
  if (scope.kind === "all") return { anonymizedAt: null };
  const pw = processWhere(scope);
  return {
    anonymizedAt: null,
    OR: [{ desiredStoreId: { in: scope.storeIds } }, { processes: { some: pw } }],
    ...(scope.ownerId ? { AND: [{ OR: [{ ownerId: scope.ownerId }, { processes: { some: { recruiterId: scope.ownerId } } }] }] } : {}),
  };
}

export function jobWhere(scope: AnyScope): Prisma.JobWhereInput {
  if (scope.kind === "all") return scope.ownerId ? { recruiterId: scope.ownerId } : {};
  return { storeId: { in: scope.storeIds }, ...(scope.ownerId ? { recruiterId: scope.ownerId } : {}) };
}

// ───── Visibilidade nas telas (mais ampla que os indicadores) ─────
// O recrutador VÊ os candidatos e vagas das suas lojas (para encontrar talentos), mas só
// ALTERA os que estão sob sua responsabilidade — ver canEditCandidate / canEditJob.

export function visibleCandidatesWhere(actor: Actor): Prisma.CandidateWhereInput {
  if (actor.allStores) return { anonymizedAt: null };
  return {
    anonymizedAt: null,
    OR: [
      { desiredStoreId: { in: actor.storeIds } },
      { processes: { some: { job: { storeId: { in: actor.storeIds } } } } },
      { ownerId: actor.id },
    ],
  };
}

export function visibleJobsWhere(actor: Actor): Prisma.JobWhereInput {
  return actor.allStores ? {} : { storeId: { in: actor.storeIds } };
}

export function visibleStoresWhere(actor: Actor): Prisma.StoreWhereInput {
  return actor.allStores ? {} : { id: { in: actor.storeIds } };
}

const ownOnly = (actor: Actor) => ROLES[actor.roleKey].ownRecordsOnly;

/** Recrutador altera candidatos dele, dos processos dele ou ainda sem responsável. */
export function canEditCandidate(actor: Actor, c: { ownerId: string | null; processes: { recruiterId: string | null }[] }): boolean {
  if (!actor.permissions.has("candidates.update")) return false;
  if (!ownOnly(actor)) return true;
  return c.ownerId === null || c.ownerId === actor.id || c.processes.some((p) => p.recruiterId === actor.id);
}

/** Recrutador altera as vagas em que é o responsável. */
export function canEditJob(actor: Actor, j: { storeId: string; recruiterId: string | null }): boolean {
  if (!actor.permissions.has("jobs.update")) return false;
  if (!actor.allStores && !actor.storeIds.includes(j.storeId)) return false;
  if (!ownOnly(actor)) return true;
  return j.recruiterId === actor.id;
}

export { scopeFor };
