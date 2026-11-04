import "server-only";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { verifyAgainstDummy, verifyPassword } from "./password";

// Proteção contra força bruta, contada em LoginAttempt (vale também para e-mails inexistentes,
// para não revelar quais contas existem).
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_EMAIL = 5;
const MAX_FAILS_PER_IP = 20;

export const LOGIN_FAILED = "E-mail ou senha incorretos.";
export const LOGIN_THROTTLED = "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente.";

export type LoginResult = { ok: true; userId: string } | { ok: false; message: string };

export async function attemptLogin(emailInput: string, password: string, ip: string | null): Promise<LoginResult> {
  const email = emailInput.trim().toLowerCase();
  const since = new Date(Date.now() - WINDOW_MS);

  const [emailFails, ipFails] = await Promise.all([
    db.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    ip ? db.loginAttempt.count({ where: { ipAddress: ip, success: false, createdAt: { gte: since } } }) : 0,
  ]);
  if (emailFails >= MAX_FAILS_PER_EMAIL || ipFails >= MAX_FAILS_PER_IP) {
    return { ok: false, message: LOGIN_THROTTLED };
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, status: true },
  });

  let valid = false;
  if (user) valid = await verifyPassword(user.passwordHash, password);
  else await verifyAgainstDummy(password);

  if (!user || !valid || user.status !== "ACTIVE") {
    await db.loginAttempt.create({ data: { email, ipAddress: ip, success: false } });
    if (user && valid && user.status !== "ACTIVE") {
      return { ok: false, message: "Este usuário está desativado. Procure o administrador." };
    }
    if (emailFails + 1 >= MAX_FAILS_PER_EMAIL && user) {
      await db.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() + WINDOW_MS) } });
      await audit(db, {
        actorId: null, action: "auth.locked", entityType: "User", entityId: user.id,
        summary: `Acesso bloqueado por 15 min após ${MAX_FAILS_PER_EMAIL} tentativas com senha incorreta`, ipAddress: ip,
      });
    }
    return { ok: false, message: LOGIN_FAILED };
  }

  await db.$transaction([
    db.loginAttempt.create({ data: { email, ipAddress: ip, success: true } }),
    db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null } }),
    // Tentativas antigas deixam de contar após um acesso válido.
    db.loginAttempt.deleteMany({ where: { email, success: false } }),
  ]);
  await audit(db, { actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id, summary: "Entrou no sistema", ipAddress: ip });
  return { ok: true, userId: user.id };
}
