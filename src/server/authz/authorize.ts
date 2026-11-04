// Autorização no servidor. Toda leitura usa scopeFor(); toda escrita chama authorize().
// Esconder botões na interface é só conforto: a regra vale aqui.
import { ForbiddenError } from "@/server/errors";
import { ROLES, type PermissionKey, type RoleKey } from "./catalog";

export type Actor = {
  id: string;
  name: string;
  email: string;
  roleKey: RoleKey;
  roleName: string;
  allStores: boolean;
  storeIds: string[];
  permissions: ReadonlySet<PermissionKey>;
  mustChangePassword: boolean;
};

export type Scope =
  | { kind: "all" }
  | { kind: "stores"; storeIds: string[]; ownerId?: string };

export function can(actor: Actor, permission: PermissionKey): boolean {
  return actor.permissions.has(permission);
}

export function canAccessStore(actor: Actor, storeId: string | null | undefined): boolean {
  if (actor.allStores) return true;
  if (!storeId) return false;
  return actor.storeIds.includes(storeId);
}

/**
 * Exige a permissão e, quando informado, que a loja esteja no escopo do usuário.
 * Lança ForbiddenError — nunca retorna silenciosamente.
 */
export function authorize(
  actor: Actor,
  permission: PermissionKey,
  ctx?: { storeId?: string | null; ownerId?: string | null },
): void {
  if (!can(actor, permission)) throw new ForbiddenError();
  if (ctx && "storeId" in ctx && !canAccessStore(actor, ctx.storeId)) {
    throw new ForbiddenError("Esta loja não está entre as suas lojas autorizadas.");
  }
  if (ctx && "ownerId" in ctx && ROLES[actor.roleKey].ownRecordsOnly && ctx.ownerId !== actor.id) {
    throw new ForbiddenError("Este registro está sob responsabilidade de outro recrutador.");
  }
}

/** Escopo de leitura do usuário: todas as lojas, ou apenas as autorizadas (e os próprios registros, para recrutador). */
export function scopeFor(actor: Actor): Scope {
  if (actor.allStores) return { kind: "all" };
  const scope: Scope = { kind: "stores", storeIds: [...actor.storeIds] };
  if (ROLES[actor.roleKey].ownRecordsOnly) scope.ownerId = actor.id;
  return scope;
}

/** Filtro Prisma para entidades que têm `storeId` direto (Store usa `id`). */
export function storeFilter(scope: Scope, field: "storeId" | "id" = "storeId") {
  if (scope.kind === "all") return {};
  return { [field]: { in: scope.storeIds } } as Record<string, { in: string[] }>;
}
