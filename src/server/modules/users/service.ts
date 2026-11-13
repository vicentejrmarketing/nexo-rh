import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { authorize, can, type Actor } from "@/server/authz/authorize";
import { ADMIN_LOCKED, CUSTOM_SEP, PERMISSIONS, ROLE_KEYS, baseRoleKey, customRoleKey, isCustomRoleKey, roleKeyIn, withDependencies, type PermissionKey, type RoleKey } from "@/server/authz/catalog";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { generateTemporaryPassword, hashPassword } from "@/server/auth/password";
import { revokeAllSessions } from "@/server/auth/session";
import { createUserSchema, fieldErrorsOf, updateUserSchema, type CreateUserInput, type UpdateUserInput } from "./schemas";

const userSelect = {
  id: true, name: true, email: true, phone: true, status: true, mustChangePassword: true,
  lastLoginAt: true, createdAt: true,
  role: { select: { key: true, name: true, isSystem: true, permissions: { select: { permission: { select: { key: true } } } } } },
  stores: { select: { store: { select: { id: true, name: true, city: true } } } },
} satisfies Prisma.UserSelect;

/** Expõe o perfil base e, se houver, o acesso personalizado (perfil próprio do usuário). */
function present<T extends Prisma.UserGetPayload<{ select: typeof userSelect }>>(u: T) {
  const custom = !u.role.isSystem && isCustomRoleKey(u.role.key);
  return {
    ...u,
    role: { key: baseRoleKey(u.role.key), name: u.role.name },
    customPermissions: custom,
    permissions: custom ? u.role.permissions.map((p) => p.permission.key) : [],
  };
}

export type UserRow = ReturnType<typeof present>;

/** Quem não vê todas as lojas enxerga os usuários que compartilham ao menos uma loja (e a si mesmo). */
function visibleUsersWhere(actor: Actor): Prisma.UserWhereInput {
  if (actor.allStores) return {};
  return { OR: [{ id: actor.id }, { stores: { some: { storeId: { in: actor.storeIds } } } }] };
}

export async function listUsers(actor: Actor, filters: { q?: string; roleKey?: string; status?: string } = {}) {
  authorize(actor, "users.view");
  const where: Prisma.UserWhereInput = { AND: [visibleUsersWhere(actor)] };
  const q = filters.q?.trim();
  if (q) (where.AND as Prisma.UserWhereInput[]).push({ OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q.toLowerCase() } }] });
  if (filters.roleKey && (ROLE_KEYS as readonly string[]).includes(filters.roleKey)) (where.AND as Prisma.UserWhereInput[]).push({ role: roleKeyIn([filters.roleKey as RoleKey]) });
  if (filters.status === "ACTIVE" || filters.status === "INACTIVE") (where.AND as Prisma.UserWhereInput[]).push({ status: filters.status });
  return (await db.user.findMany({ where, select: userSelect, orderBy: [{ status: "asc" }, { name: "asc" }], take: 500 })).map(present);
}

export async function getUser(actor: Actor, id: string) {
  authorize(actor, "users.view");
  const user = await db.user.findFirst({ where: { AND: [{ id }, visibleUsersWhere(actor)] }, select: userSelect });
  if (!user) throw new NotFoundError("Usuário não encontrado.");
  return present(user);
}

export async function listRoles() {
  return db.role.findMany({ where: { isSystem: true }, select: { id: true, key: true, name: true, description: true, allStores: true }, orderBy: { createdAt: "asc" } });
}

export async function listAssignableStores(actor: Actor) {
  authorize(actor, "users.view");
  return db.store.findMany({ select: { id: true, name: true, city: true, state: true, status: true }, orderBy: { name: "asc" } });
}

async function assertStoresExist(storeIds: string[]) {
  if (!storeIds.length) return;
  const found = await db.store.count({ where: { id: { in: storeIds } } });
  if (found !== new Set(storeIds).size) throw new ValidationError({ storeIds: ["Uma das lojas selecionadas não existe mais."] });
}

async function roleByKey(key: RoleKey) {
  const role = await db.role.findUnique({ where: { key } });
  if (!role) throw new AppError("INTERNAL", `Perfil ${key} não encontrado. Execute o seed.`);
  return role;
}

export async function createUser(actor: Actor, raw: CreateUserInput, ip?: string | null) {
  authorize(actor, "users.manage");
  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  const input = parsed.data;
  const role = await roleByKey(input.roleKey);
  const storeIds = role.allStores ? [] : [...new Set(input.storeIds)];
  await assertStoresExist(storeIds);
  if (!role.allStores && storeIds.length === 0 && input.roleKey !== "HR_MANAGER") {
    // Recrutador e Gestor de Loja sem loja não enxergariam nada; avisamos em vez de criar um usuário inútil.
    throw new ValidationError({ storeIds: ["Selecione ao menos uma loja para este perfil."] });
  }

  const custom = resolveCustomAccess(actor, input.roleKey, input.customPermissions, input.permissions);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  try {
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name, email: input.email, phone: input.phone ?? null, roleId: role.id, passwordHash,
          mustChangePassword: true,
          stores: { create: storeIds.map((storeId) => ({ storeId })) },
        },
        select: { id: true, name: true, email: true },
      });
      if (custom) await applyAccess(tx, created.id, role, custom);
      await audit(tx, {
        actorId: actor.id, action: "user.create", entityType: "User", entityId: created.id, ipAddress: ip,
        summary: `Criou o usuário ${created.name} (${role.name})`,
        after: { name: created.name, email: created.email, role: role.key, storeIds, access: custom ?? "padrão do perfil" },
      });
      return created;
    });
    return { user, temporaryPassword };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ValidationError({ email: ["Já existe um usuário com este e-mail."] });
    }
    throw e;
  }
}

/**
 * Acesso personalizado: só quem gerencia permissões define, nunca para o perfil Administrador e sem
 * conceder o que a própria pessoa não tem. Devolve null quando o usuário segue o padrão do perfil.
 */
function resolveCustomAccess(actor: Actor, roleKey: RoleKey, custom: boolean | undefined, keys: string[] | undefined): PermissionKey[] | null {
  if (!custom || roleKey === "ADMIN") return null;
  authorize(actor, "permissions.manage");
  const list = withDependencies(keys ?? []);
  const beyond = list.filter((k) => !actor.permissions.has(k));
  if (beyond.length) throw new ForbiddenError("Você não pode conceder acessos que você mesmo não tem.");
  return list;
}

/**
 * Aplica o acesso: no padrão, o usuário fica no perfil base; personalizado, ganha um perfil próprio
 * (não listado) com as permissões escolhidas e o mesmo comportamento do perfil base.
 */
async function applyAccess(tx: Prisma.TransactionClient, userId: string, base: { id: string; key: string; name: string; allStores: boolean }, keys: PermissionKey[] | null) {
  if (!keys) {
    await tx.user.update({ where: { id: userId }, data: { roleId: base.id } });
  } else {
    const key = customRoleKey(base.key as RoleKey, userId);
    const role = await tx.role.upsert({
      where: { key },
      update: { name: base.name, allStores: base.allStores },
      create: { key, name: base.name, description: "Acesso personalizado", allStores: base.allStores, isSystem: false },
    });
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (keys.length) {
      const perms = await tx.permission.findMany({ where: { key: { in: keys } }, select: { id: true } });
      await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
    }
    await tx.user.update({ where: { id: userId }, data: { roleId: role.id } });
  }
  // Perfis próprios que deixaram de ser usados (voltou ao padrão ou trocou de perfil base) são removidos.
  await tx.role.deleteMany({
    where: { isSystem: false, key: { endsWith: `${CUSTOM_SEP}${userId}` }, ...(keys ? { NOT: { key: customRoleKey(base.key as RoleKey, userId) } } : {}), users: { none: {} } },
  });
}

async function countActiveAdmins(excludeUserId?: string) {
  return db.user.count({ where: { status: "ACTIVE", role: { key: "ADMIN" }, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) } });
}

export async function updateUser(actor: Actor, id: string, raw: UpdateUserInput, ip?: string | null) {
  authorize(actor, "users.manage");
  const parsed = updateUserSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  const input = parsed.data;
  const current = await db.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, phone: true, status: true, stores: { select: { storeId: true } },
      role: { select: { key: true, isSystem: true, permissions: { select: { permission: { select: { key: true } } } } } },
    },
  });
  if (!current) throw new NotFoundError("Usuário não encontrado.");
  const currentIsCustom = !current.role.isSystem && isCustomRoleKey(current.role.key);
  current.role.key = baseRoleKey(current.role.key);
  // Sem permissão para gerenciar permissões, o acesso individual atual é mantido como está.
  const managesAccess = actor.permissions.has("permissions.manage");
  const currentCustom = currentIsCustom ? withDependencies(current.role.permissions.map((p) => p.permission.key)) : null;
  const custom = managesAccess
    ? resolveCustomAccess(actor, input.roleKey, input.customPermissions, input.permissions)
    : input.roleKey === "ADMIN" ? null : currentCustom;
  if (id === actor.id && custom && !(["users.manage", "permissions.manage"] as PermissionKey[]).every((k) => custom.includes(k)) && actor.permissions.has("permissions.manage")) {
    throw new ForbiddenError("Você não pode retirar o seu próprio acesso de administração.");
  }

  const role = await roleByKey(input.roleKey);
  const storeIds = role.allStores ? [] : [...new Set(input.storeIds)];
  await assertStoresExist(storeIds);

  const losingAdmin = current.role.key === "ADMIN" && (input.roleKey !== "ADMIN" || input.status !== "ACTIVE");
  if (losingAdmin && id === actor.id) throw new ForbiddenError("Você não pode retirar o seu próprio acesso de administrador.");
  if (losingAdmin && (await countActiveAdmins(id)) === 0) {
    throw new ForbiddenError("O sistema precisa de pelo menos um administrador ativo.");
  }

  const before = {
    name: current.name, phone: current.phone, status: current.status, role: current.role.key,
    storeIds: current.stores.map((s) => s.storeId).sort(),
    access: currentCustom ?? "padrão do perfil",
  };
  const after = { name: input.name, phone: input.phone ?? null, status: input.status, role: input.roleKey, storeIds: [...storeIds].sort(), access: custom ?? "padrão do perfil" };
  const accessChanged = before.role !== after.role || before.status !== after.status || before.storeIds.join() !== after.storeIds.join()
    || JSON.stringify(before.access) !== JSON.stringify(after.access);

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { name: input.name, phone: input.phone ?? null, status: input.status },
    });
    await applyAccess(tx, id, role, custom);
    await tx.userStore.deleteMany({ where: { userId: id } });
    if (storeIds.length) await tx.userStore.createMany({ data: storeIds.map((storeId) => ({ userId: id, storeId })) });
    await audit(tx, {
      actorId: actor.id, action: input.status !== current.status ? (input.status === "ACTIVE" ? "user.activate" : "user.deactivate") : "user.update",
      entityType: "User", entityId: id, ipAddress: ip, summary: `Atualizou o usuário ${input.name}`, before, after,
    });
  });
  // Mudança de acesso derruba as sessões abertas: a nova regra vale no próximo login.
  if (accessChanged && id !== actor.id) await revokeAllSessions(id);
}

export async function resetUserPassword(actor: Actor, id: string, ip?: string | null) {
  authorize(actor, "users.manage");
  const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!user) throw new NotFoundError("Usuário não encontrado.");
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true, lockedUntil: null } });
    await audit(tx, { actorId: actor.id, action: "user.password_reset", entityType: "User", entityId: id, ipAddress: ip, summary: `Gerou senha temporária para ${user.name}` });
  });
  await revokeAllSessions(id);
  return { temporaryPassword };
}

export async function deleteUser(actor: Actor, id: string, ip?: string | null) {
  authorize(actor, "users.manage");
  if (id === actor.id) throw new ForbiddenError("Você não pode excluir o seu próprio usuário.");
  const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: { select: { key: true } } } });
  if (!user) throw new NotFoundError("Usuário não encontrado.");
  if (baseRoleKey(user.role.key) === "ADMIN" && (await countActiveAdmins(id)) === 0) {
    throw new ForbiddenError("O sistema precisa de pelo menos um administrador ativo.");
  }
  await db.$transaction(async (tx) => {
    // Registros ligados ao usuário (vagas, notas, movimentações) são preservados com o vínculo removido.
    await tx.user.delete({ where: { id } });
    await tx.role.deleteMany({ where: { isSystem: false, key: { endsWith: `${CUSTOM_SEP}${id}` }, users: { none: {} } } });
    await audit(tx, {
      actorId: actor.id, action: "user.delete", entityType: "User", entityId: id, ipAddress: ip,
      summary: `Excluiu o usuário ${user.name}`, before: { name: user.name, email: user.email, role: user.role.key },
    });
  });
}

// ───────────── Matriz de permissões ─────────────

export async function getPermissionMatrix(actor: Actor) {
  if (!can(actor, "permissions.manage") && !can(actor, "users.view")) throw new ForbiddenError();
  const [roles, permissions] = await Promise.all([
    db.role.findMany({
      where: { isSystem: true },
      select: { id: true, key: true, name: true, allStores: true, permissions: { select: { permission: { select: { key: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    db.permission.findMany({ select: { key: true, module: true, description: true }, orderBy: [{ module: "asc" }, { key: "asc" }] }),
  ]);
  return {
    roles: roles.map((r) => ({ key: r.key, name: r.name, allStores: r.allStores, granted: r.permissions.map((p) => p.permission.key) })),
    permissions,
    canEdit: can(actor, "permissions.manage"),
  };
}

export async function setRolePermission(actor: Actor, roleKey: RoleKey, permissionKey: PermissionKey, enabled: boolean, ip?: string | null) {
  authorize(actor, "permissions.manage");
  if (!(permissionKey in PERMISSIONS)) throw new ValidationError({ permission: ["Permissão desconhecida."] });
  if (roleKey === "ADMIN" && !enabled && ADMIN_LOCKED.includes(permissionKey)) {
    throw new ForbiddenError("Esta permissão não pode ser retirada do Administrador.");
  }
  const [role, permission] = await Promise.all([
    db.role.findUnique({ where: { key: roleKey } }),
    db.permission.findUnique({ where: { key: permissionKey } }),
  ]);
  if (!role || !permission) throw new NotFoundError();
  await db.$transaction(async (tx) => {
    if (enabled) {
      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    } else {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: permission.id } });
    }
    await audit(tx, {
      actorId: actor.id, action: enabled ? "permission.grant" : "permission.revoke", entityType: "Role", entityId: role.id, ipAddress: ip,
      summary: `${enabled ? "Concedeu" : "Retirou"} "${PERMISSIONS[permissionKey].description}" do perfil ${role.name}`,
    });
  });
}

/** Dados para escolher o acesso individual no formulário de usuário. */
export async function accessOptions(actor: Actor) {
  authorize(actor, "users.view");
  const roles = await db.role.findMany({ where: { isSystem: true }, select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } });
  return {
    catalog: Object.entries(PERMISSIONS).map(([key, p]) => ({ key, module: p.module, description: p.description })),
    roleDefaults: Object.fromEntries(roles.map((r) => [r.key, r.permissions.map((p) => p.permission.key)])) as Record<string, string[]>,
    canManage: can(actor, "permissions.manage"),
    grantable: [...actor.permissions] as string[],
  };
}
