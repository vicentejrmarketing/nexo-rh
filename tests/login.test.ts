import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { attemptLogin, LOGIN_FAILED, LOGIN_THROTTLED } from "@/server/auth/login";
import { makeActor, makeStore, resetDatabase } from "./support/db";

beforeEach(async () => {
  await resetDatabase();
});

describe("login", () => {
  it("entra com a senha correta e registra o acesso", async () => {
    const res = await attemptLogin("ADMIN@teste.local", "SenhaInicial2026", "10.0.0.1");
    expect(res.ok).toBe(true);
    expect(await db.activityLog.count({ where: { action: "auth.login" } })).toBe(1);
  });

  it("e-mail inexistente e senha errada recebem a mesma mensagem", async () => {
    const a = await attemptLogin("ninguem@teste.local", "qualquer", "10.0.0.1");
    const b = await attemptLogin("admin@teste.local", "errada", "10.0.0.1");
    expect(a).toEqual({ ok: false, message: LOGIN_FAILED });
    expect(b).toEqual({ ok: false, message: LOGIN_FAILED });
  });

  it("bloqueia por 15 minutos após 5 erros, mesmo com a senha certa depois", async () => {
    for (let i = 0; i < 5; i++) await attemptLogin("admin@teste.local", `errada${i}`, "10.0.0.2");
    const res = await attemptLogin("admin@teste.local", "SenhaInicial2026", "10.0.0.2");
    expect(res).toEqual({ ok: false, message: LOGIN_THROTTLED });
    expect(await db.activityLog.count({ where: { action: "auth.locked" } })).toBe(1);
  });

  it("limita tentativas por IP, mesmo variando o e-mail", async () => {
    for (let i = 0; i < 20; i++) await attemptLogin(`x${i}@teste.local`, "errada", "10.0.0.3");
    expect(await attemptLogin("admin@teste.local", "SenhaInicial2026", "10.0.0.3")).toEqual({ ok: false, message: LOGIN_THROTTLED });
    // Outro IP continua entrando normalmente.
    expect((await attemptLogin("admin@teste.local", "SenhaInicial2026", "10.0.0.4")).ok).toBe(true);
  });

  it("usuário desativado não entra", async () => {
    const loja = await makeStore("Loja");
    const rec = await makeActor("RECRUITER", [loja.id], "rec@teste.local");
    await db.user.update({ where: { id: rec.id }, data: { status: "INACTIVE" } });
    const res = await attemptLogin("rec@teste.local", "SenhaValida2026", null);
    expect(res.ok).toBe(false);
  });
});
