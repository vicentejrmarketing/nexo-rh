import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Db, Tx } from "@/server/db/client";

export type AuditEntry = {
  actorId: string | null;
  action: string; // ex.: user.create, user.deactivate
  entityType: string;
  entityId?: string | null;
  storeId?: string | null;
  summary: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ipAddress?: string | null;
};

/** Grava o histórico. Use o `tx` da mesma transação da alteração: se ela falhar, o log também não é gravado. */
export async function audit(client: Tx | Db, entry: AuditEntry): Promise<void> {
  await client.activityLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      storeId: entry.storeId ?? null,
      summary: entry.summary,
      before: entry.before,
      after: entry.after,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}
