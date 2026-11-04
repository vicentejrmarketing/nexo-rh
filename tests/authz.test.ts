// Matriz perfil × ação e escopo por loja (regras puras, sem banco).
import { describe, expect, it } from "vitest";
import { authorize, can, canAccessStore, scopeFor, type Actor } from "@/server/authz/authorize";
import { ALL_PERMISSIONS, ROLES, ROLE_KEYS, type PermissionKey, type RoleKey } from "@/server/authz/catalog";
import { ForbiddenError } from "@/server/errors";

function actor(roleKey: RoleKey, storeIds: string[] = ["loja-a"], id = "u1"): Actor {
  const role = ROLES[roleKey];
  return {
    id, name: "Teste", email: "t@t.local", roleKey, roleName: role.name, allStores: role.allStores,
    storeIds, permissions: new Set(role.permissions), mustChangePassword: false,
  };
}

// Expectativas tiradas do briefing (item 4). "true" = o perfil pode; "false" = não pode.
const EXPECTED: Record<string, Record<RoleKey, boolean>> = {
  "users.manage":        { ADMIN: true, HR_MANAGER: false, RECRUITER: false, STORE_MANAGER: false },
  "permissions.manage":  { ADMIN: true, HR_MANAGER: false, RECRUITER: false, STORE_MANAGER: false },
  "integrations.manage": { ADMIN: true, HR_MANAGER: false, RECRUITER: false, STORE_MANAGER: false },
  "jobs.create":         { ADMIN: true, HR_MANAGER: true, RECRUITER: false, STORE_MANAGER: false },
  "jobs.update":         { ADMIN: true, HR_MANAGER: true, RECRUITER: true, STORE_MANAGER: false },
  "jobs.view":           { ADMIN: true, HR_MANAGER: true, RECRUITER: true, STORE_MANAGER: true },
  "candidates.update":   { ADMIN: true, HR_MANAGER: true, RECRUITER: true, STORE_MANAGER: false },
  "candidates.view":     { ADMIN: true, HR_MANAGER: true, RECRUITER: true, STORE_MANAGER: true },
  "pipeline.move":       { ADMIN: true, HR_MANAGER: true, RECRUITER: true, STORE_MANAGER: false },
  "interviews.manage":   { ADMIN: true, HR_MANAGER: true, RECRUITER: true, STORE_MANAGER: false },
  "interviews.view":     { ADMIN: true, HR_MANAGER: true, RECRUITER: true, STORE_MANAGER: true },
  "messages.send":       { ADMIN: true, HR_MANAGER: true, RECRUITER: true, STORE_MANAGER: false },
  "reports.view":        { ADMIN: true, HR_MANAGER: true, RECRUITER: true, STORE_MANAGER: true },
  "reports.export":      { ADMIN: true, HR_MANAGER: true, RECRUITER: false, STORE_MANAGER: false },
  "users.view":          { ADMIN: true, HR_MANAGER: true, RECRUITER: false, STORE_MANAGER: false },
};

describe("matriz de permissões por perfil", () => {
  for (const [perm, byRole] of Object.entries(EXPECTED)) {
    for (const role of ROLE_KEYS) {
      it(`${role} ${byRole[role] ? "pode" : "não pode"} ${perm}`, () => {
        expect(can(actor(role), perm as PermissionKey)).toBe(byRole[role]);
        if (byRole[role]) expect(() => authorize(actor(role), perm as PermissionKey)).not.toThrow();
        else expect(() => authorize(actor(role), perm as PermissionKey)).toThrow(ForbiddenError);
      });
    }
  }

  it("Administrador tem todas as permissões do catálogo", () => {
    for (const p of ALL_PERMISSIONS) expect(can(actor("ADMIN"), p)).toBe(true);
  });

  it("Gestor de Loja é somente leitura", () => {
    const writes = ALL_PERMISSIONS.filter((p) => !p.endsWith(".view"));
    for (const p of writes) expect(can(actor("STORE_MANAGER"), p)).toBe(false);
  });
});

describe("escopo por loja", () => {
  it("Administrador acessa qualquer loja, mesmo sem vínculo", () => {
    const a = actor("ADMIN", []);
    expect(canAccessStore(a, "qualquer")).toBe(true);
    expect(scopeFor(a)).toEqual({ kind: "all" });
  });

  for (const role of ["HR_MANAGER", "RECRUITER", "STORE_MANAGER"] as const) {
    it(`${role} não acessa loja fora das autorizadas`, () => {
      const a = actor(role, ["loja-a"]);
      expect(canAccessStore(a, "loja-a")).toBe(true);
      expect(canAccessStore(a, "loja-b")).toBe(false);
      expect(canAccessStore(a, null)).toBe(false);
      expect(() => authorize(a, "jobs.view", { storeId: "loja-b" })).toThrow(ForbiddenError);
      expect(() => authorize(a, "jobs.view", { storeId: "loja-a" })).not.toThrow();
    });
  }

  it("Recrutador só altera registros sob sua responsabilidade", () => {
    const r = actor("RECRUITER", ["loja-a"], "rec-1");
    expect(() => authorize(r, "candidates.update", { storeId: "loja-a", ownerId: "rec-1" })).not.toThrow();
    expect(() => authorize(r, "candidates.update", { storeId: "loja-a", ownerId: "rec-2" })).toThrow(ForbiddenError);
    expect(scopeFor(r)).toEqual({ kind: "stores", storeIds: ["loja-a"], ownerId: "rec-1" });
  });

  it("Gestor de RH vê todos os processos das lojas autorizadas, sem filtro de responsável", () => {
    const g = actor("HR_MANAGER", ["loja-a", "loja-b"], "g1");
    expect(() => authorize(g, "candidates.update", { storeId: "loja-a", ownerId: "outro" })).not.toThrow();
    expect(scopeFor(g)).toEqual({ kind: "stores", storeIds: ["loja-a", "loja-b"] });
  });
});
