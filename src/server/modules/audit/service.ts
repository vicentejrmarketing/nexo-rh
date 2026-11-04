import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { authorize, scopeFor, type Actor } from "@/server/authz/authorize";

const PAGE_SIZE = 50;

/** Histórico de atividades. Quem não vê todas as lojas enxerga eventos das suas lojas e os próprios. */
export async function listActivity(actor: Actor, opts: { page?: number; q?: string; entityType?: string } = {}) {
  authorize(actor, "audit.view");
  const scope = scopeFor(actor);
  const and: Prisma.ActivityLogWhereInput[] = [];
  if (scope.kind === "stores") and.push({ OR: [{ storeId: { in: scope.storeIds } }, { actorId: actor.id }] });
  if (opts.q?.trim()) and.push({ summary: { contains: opts.q.trim(), mode: "insensitive" } });
  if (opts.entityType) and.push({ entityType: opts.entityType });
  const where: Prisma.ActivityLogWhereInput = and.length ? { AND: and } : {};
  const page = Math.max(1, opts.page ?? 1);
  const [items, total] = await Promise.all([
    db.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, action: true, entityType: true, summary: true, createdAt: true, ipAddress: true, actor: { select: { name: true } } },
    }),
    db.activityLog.count({ where }),
  ]);
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
