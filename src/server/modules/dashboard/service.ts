import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { authorize, scopeFor, type Actor } from "@/server/authz/authorize";

// Indicadores do topo da Visão Geral, sempre calculados no banco e dentro do escopo do usuário.
// Os gráficos e filtros de período completos chegam na Etapa 6.

export async function getHeadlineKpis(actor: Actor) {
  authorize(actor, "dashboard.view");
  const scope = scopeFor(actor);

  const processWhere: Prisma.CandidateJobWhereInput =
    scope.kind === "all" ? {} : { job: { storeId: { in: scope.storeIds } }, ...(scope.ownerId ? { recruiterId: scope.ownerId } : {}) };
  const candidateWhere: Prisma.CandidateWhereInput =
    scope.kind === "all"
      ? { anonymizedAt: null }
      : {
          anonymizedAt: null,
          OR: [{ desiredStoreId: { in: scope.storeIds } }, { processes: { some: processWhere } }],
          ...(scope.ownerId ? { AND: [{ OR: [{ ownerId: scope.ownerId }, { processes: { some: { recruiterId: scope.ownerId } } }] }] } : {}),
        };
  const conversationWhere: Prisma.ConversationWhereInput =
    scope.kind === "all" ? {} : { candidate: candidateWhere };

  const [candidates, conversations, interviews, approved, hired] = await Promise.all([
    db.candidate.count({ where: candidateWhere }),
    db.conversation.count({ where: conversationWhere }),
    db.interview.count({ where: { status: "SCHEDULED", candidateJob: processWhere } }),
    db.candidateJob.count({ where: { ...processWhere, stage: { key: "approved" } } }),
    db.candidateJob.count({ where: { ...processWhere, status: "HIRED" } }),
  ]);
  return { candidates, conversations, interviews, approved, hired };
}
