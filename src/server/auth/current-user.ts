import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { AppError } from "@/server/errors";
import type { Actor } from "@/server/authz/authorize";
import type { PermissionKey, RoleKey } from "@/server/authz/catalog";
import { validateSessionCookie } from "./session";

export async function loadActorById(userId: string): Promise<Actor | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, status: true, mustChangePassword: true,
      role: { select: { key: true, name: true, allStores: true, permissions: { select: { permission: { select: { key: true } } } } } },
      stores: { select: { storeId: true } },
    },
  });
  if (!user || user.status !== "ACTIVE") return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleKey: user.role.key as RoleKey,
    roleName: user.role.name,
    allStores: user.role.allStores,
    storeIds: user.stores.map((s) => s.storeId),
    permissions: new Set(user.role.permissions.map((p) => p.permission.key as PermissionKey)),
    mustChangePassword: user.mustChangePassword,
  };
}

/** Usuário da requisição atual (uma consulta por requisição), ou null. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await validateSessionCookie();
  if (!session) return null;
  return loadActorById(session.userId);
});

/** Para páginas: redireciona ao login (ou à troca obrigatória de senha). */
export async function requirePageActor(options: { allowPasswordChange?: boolean } = {}): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.mustChangePassword && !options.allowPasswordChange) redirect("/trocar-senha");
  return actor;
}

/** Para Server Actions e rotas de API: lança erro em vez de redirecionar. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new AppError("UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.");
  if (actor.mustChangePassword) throw new AppError("FORBIDDEN", "Troque sua senha antes de continuar.");
  return actor;
}
