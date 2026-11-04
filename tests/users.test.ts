// Regras do serviço de usuários contra um PostgreSQL real (banco *_test).
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { createUser, deleteUser, listUsers, resetUserPassword, setRolePermission, updateUser } from "@/server/modules/users/service";
import { verifyPassword } from "@/server/auth/password";
import { adminActor, makeActor, makeStore, resetDatabase } from "./support/db";

beforeEach(async () => {
  await resetDatabase();
});

describe("criação de usuários", () => {
  it("Administrador cria recrutador com lojas, senha temporária válida e registro no histórico", async () => {
    const admin = await adminActor();
    const loja = await makeStore("Loja Centro");
    const { user, temporaryPassword } = await createUser(admin, {
      name: "Maria Recrutadora", email: "  Maria@Empresa.com.br ", roleKey: "RECRUITER", storeIds: [loja.id],
    });
    const saved = await db.user.findUniqueOrThrow({ where: { id: user.id }, include: { stores: true } });
    expect(saved.email).toBe("maria@empresa.com.br");
    expect(saved.mustChangePassword).toBe(true);
    expect(saved.stores.map((s) => s.storeId)).toEqual([loja.id]);
    expect(await verifyPassword(saved.passwordHash, temporaryPassword)).toBe(true);
    const log = await db.activityLog.findFirst({ where: { action: "user.create", entityId: user.id } });
    expect(log?.actorId).toBe(admin.id);
  });

  it("recusa e-mail duplicado com mensagem no campo", async () => {
    const admin = await adminActor();
    const loja = await makeStore("Loja 1");
    await createUser(admin, { name: "Ana Souza", email: "ana@x.com", roleKey: "RECRUITER", storeIds: [loja.id] });
    await expect(createUser(admin, { name: "Ana Outra", email: "ANA@x.com", roleKey: "RECRUITER", storeIds: [loja.id] })).rejects.toMatchObject({
      code: "VALIDATION", fieldErrors: { email: ["Já existe um usuário com este e-mail."] },
    });
  });

  it("exige loja para Recrutador e Gestor de Loja", async () => {
    const admin = await adminActor();
    await expect(createUser(admin, { name: "Sem Loja", email: "s@x.com", roleKey: "STORE_MANAGER", storeIds: [] })).rejects.toBeInstanceOf(ValidationError);
  });

  it("valida os campos no servidor", async () => {
    const admin = await adminActor();
    await expect(createUser(admin, { name: "A", email: "invalido", roleKey: "RECRUITER", storeIds: [] })).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: expect.objectContaining({ name: expect.any(Array), email: expect.any(Array) }),
    });
  });

  for (const role of ["HR_MANAGER", "RECRUITER", "STORE_MANAGER"] as const) {
    it(`${role} não consegue criar usuários, mesmo chamando o serviço direto`, async () => {
      const loja = await makeStore(`Loja ${role}`);
      const actor = await makeActor(role, [loja.id]);
      await expect(createUser(actor, { name: "Invasor Teste", email: "inv@x.com", roleKey: "ADMIN", storeIds: [] })).rejects.toBeInstanceOf(ForbiddenError);
      expect(await db.user.count({ where: { email: "inv@x.com" } })).toBe(0);
    });
  }
});

describe("visibilidade por loja", () => {
  it("Gestor de RH só lista usuários que compartilham suas lojas", async () => {
    const a = await makeStore("Loja A");
    const b = await makeStore("Loja B");
    const gestor = await makeActor("HR_MANAGER", [a.id], "gestor@x.com");
    await makeActor("RECRUITER", [a.id], "rec-a@x.com");
    await makeActor("RECRUITER", [b.id], "rec-b@x.com");
    const emails = (await listUsers(gestor)).map((u) => u.email).sort();
    expect(emails).toEqual(["gestor@x.com", "rec-a@x.com"]);
  });

  it("Recrutador não lista usuários", async () => {
    const a = await makeStore("Loja A");
    const rec = await makeActor("RECRUITER", [a.id]);
    await expect(listUsers(rec)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("proteções do administrador", () => {
  it("não permite remover o último administrador ativo nem excluir a si mesmo", async () => {
    const admin = await adminActor();
    await expect(updateUser(admin, admin.id, { name: admin.name, roleKey: "HR_MANAGER", storeIds: [], status: "ACTIVE" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteUser(admin, admin.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("não permite retirar do Administrador a permissão de gerenciar usuários", async () => {
    const admin = await adminActor();
    await expect(setRolePermission(admin, "ADMIN", "users.manage", false)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("alterar perfil ou lojas derruba as sessões abertas do usuário", async () => {
    const admin = await adminActor();
    const a = await makeStore("Loja A");
    const b = await makeStore("Loja B");
    const rec = await makeActor("RECRUITER", [a.id]);
    await db.session.create({ data: { id: "hash-teste", userId: rec.id, expiresAt: new Date(Date.now() + 3600_000) } });
    await updateUser(admin, rec.id, { name: rec.name, roleKey: "RECRUITER", storeIds: [b.id], status: "ACTIVE" });
    expect(await db.session.count({ where: { userId: rec.id } })).toBe(0);
    const log = await db.activityLog.findFirst({ where: { action: "user.update", entityId: rec.id } });
    expect(log?.before).toMatchObject({ storeIds: [a.id] });
    expect(log?.after).toMatchObject({ storeIds: [b.id] });
  });

  it("senha temporária obriga troca e encerra sessões", async () => {
    const admin = await adminActor();
    const a = await makeStore("Loja A");
    const rec = await makeActor("RECRUITER", [a.id]);
    await db.session.create({ data: { id: "hash-2", userId: rec.id, expiresAt: new Date(Date.now() + 3600_000) } });
    const { temporaryPassword } = await resetUserPassword(admin, rec.id);
    const saved = await db.user.findUniqueOrThrow({ where: { id: rec.id } });
    expect(saved.mustChangePassword).toBe(true);
    expect(await verifyPassword(saved.passwordHash, temporaryPassword)).toBe(true);
    expect(await db.session.count({ where: { userId: rec.id } })).toBe(0);
  });

  it("excluir usuário preserva o histórico de ações dele", async () => {
    const admin = await adminActor();
    const a = await makeStore("Loja A");
    const rec = await makeActor("RECRUITER", [a.id]);
    await db.activityLog.create({ data: { actorId: rec.id, action: "test.action", entityType: "X", summary: "ação antiga" } });
    await deleteUser(admin, rec.id);
    const old = await db.activityLog.findFirst({ where: { action: "test.action" } });
    expect(old).not.toBeNull();
    expect(old?.actorId).toBeNull();
    expect(await db.activityLog.count({ where: { action: "user.delete", entityId: rec.id } })).toBe(1);
  });
});
