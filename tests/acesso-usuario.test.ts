// Acesso personalizado por usuário: o Administrador escolhe o que cada pessoa acessa.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { ForbiddenError } from "@/server/errors";
import { loadActorById } from "@/server/auth/current-user";
import { createUser, updateUser } from "@/server/modules/users/service";
import { createJob } from "@/server/modules/jobs/service";
import { ALL_PERMISSIONS, withDependencies } from "@/server/authz/catalog";
import { adminActor, makeActor, makeStore, resetDatabase } from "./support/db";

beforeEach(async () => {
  await resetDatabase();
});

const base = (storeId: string) => ({ name: "Carla Souza", email: `carla${Math.random().toString(36).slice(2, 6)}@teste.local`, roleKey: "RECRUITER" as const, storeIds: [storeId] });

describe("acesso personalizado", () => {
  it("dependências: marcar uma ação inclui a permissão de ver; chaves desconhecidas saem", () => {
    expect(withDependencies(["candidates.update", "inexistente", "reports.export"])).toEqual(["candidates.view", "candidates.update", "reports.view", "reports.export"]);
  });

  it("criado com acesso personalizado: vale exatamente o que foi marcado, inclusive no servidor", async () => {
    const admin = await adminActor();
    const store = await makeStore("Loja Centro");
    const { user } = await createUser(admin, { ...base(store.id), customPermissions: true, permissions: ["candidates.update", "jobs.view"] });
    const actor = (await loadActorById(user.id))!;
    expect([...actor.permissions].sort()).toEqual(["candidates.update", "candidates.view", "jobs.view"]);
    await expect(createJob(actor, { title: "Caixa", description: "Operação de caixa.", openings: "1", storeId: store.id, priority: "MEDIUM" })).rejects.toBeInstanceOf(ForbiddenError);
    const log = await db.activityLog.findFirstOrThrow({ where: { action: "user.create", entityId: user.id } });
    expect((log.after as { access: string[] }).access).toContain("candidates.update");
  });

  it("padrão do perfil continua igual; voltar ao padrão remove o acesso individual; Administrador é sempre total", async () => {
    const admin = await adminActor();
    const store = await makeStore("Loja Centro");
    const { user } = await createUser(admin, { ...base(store.id), customPermissions: true, permissions: ["dashboard.view"] });
    await updateUser(admin, user.id, { name: "Carla Souza", roleKey: "RECRUITER", storeIds: [store.id], status: "ACTIVE", customPermissions: false });
    const role = await db.role.findUniqueOrThrow({ where: { key: "RECRUITER" }, include: { permissions: { include: { permission: true } } } });
    const actor = (await loadActorById(user.id))!;
    expect([...actor.permissions].sort()).toEqual(role.permissions.map((p) => p.permission.key).sort());
    expect(await db.userPermission.count({ where: { userId: user.id } })).toBe(0);
    const { user: adm } = await createUser(admin, { ...base(store.id), roleKey: "ADMIN", customPermissions: true, permissions: ["dashboard.view"] });
    expect((await loadActorById(adm.id))!.permissions.size).toBe(ALL_PERMISSIONS.length);
  });

  it("só quem gerencia permissões personaliza; ninguém concede o que não tem nem tira o próprio acesso de administração", async () => {
    const admin = await adminActor();
    const store = await makeStore("Loja Centro");
    const hr = await makeActor("HR_MANAGER", [store.id]);
    if (hr.permissions.has("users.manage")) {
      await expect(createUser(hr, { ...base(store.id), customPermissions: true, permissions: ["jobs.view"] })).rejects.toBeInstanceOf(ForbiddenError);
    }
    // Gestor com acesso personalizado de administração, mas sem exportar relatórios
    const { user: mgr } = await createUser(admin, { ...base(store.id), roleKey: "HR_MANAGER", customPermissions: true, permissions: ["users.manage", "permissions.manage", "candidates.view"] });
    const mgrActor = (await loadActorById(mgr.id))!;
    await expect(createUser(mgrActor, { ...base(store.id), customPermissions: true, permissions: ["reports.export"] })).rejects.toThrow(/não tem/);
    await expect(updateUser(mgrActor, mgr.id, { name: "Carla Souza", roleKey: "HR_MANAGER", storeIds: [store.id], status: "ACTIVE", customPermissions: true, permissions: ["candidates.view"] }))
      .rejects.toThrow(/próprio acesso de administração/);
  });

  it("quem não gerencia permissões edita o usuário sem apagar o acesso personalizado dele", async () => {
    const admin = await adminActor();
    const store = await makeStore("Loja Centro");
    const { user } = await createUser(admin, { ...base(store.id), customPermissions: true, permissions: ["jobs.view"] });
    const { user: editor } = await createUser(admin, { ...base(store.id), roleKey: "HR_MANAGER", customPermissions: true, permissions: ["users.manage"] });
    const editorActor = (await loadActorById(editor.id))!;
    await updateUser(editorActor, user.id, { name: "Carla S.", roleKey: "RECRUITER", storeIds: [store.id], status: "ACTIVE" });
    expect([...(await loadActorById(user.id))!.permissions]).toEqual(["jobs.view"]);
  });
});
