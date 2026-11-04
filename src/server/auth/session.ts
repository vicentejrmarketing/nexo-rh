import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/server/db/client";

// Sessões no banco: o cookie guarda um token aleatório; o banco guarda só o SHA-256 dele.
// Assim um vazamento do banco não permite assumir sessões, e o administrador pode revogá-las.

const IS_PROD = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = IS_PROD ? "__Host-nexo_session" : "nexo_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h
const RENEW_WHEN_LEFT_MS = 6 * 60 * 60 * 1000; // renova quando faltar menos de 6 h
const ABSOLUTE_MAX_MS = 7 * 24 * 60 * 60 * 1000; // nenhuma sessão passa de 7 dias, mesmo em uso

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function clientInfo() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  // Limpeza oportunista de sessões vencidas.
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const { ip, userAgent } = await clientInfo();
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt, ipAddress: ip, userAgent } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    // O cookie dura o máximo absoluto; quem decide se a sessão ainda vale é o banco.
    maxAge: ABSOLUTE_MAX_MS / 1000,
  });
}

/** Valida o cookie e devolve o id do usuário, ou null. Remove sessões expiradas. */
export async function validateSessionCookie(): Promise<{ sessionId: string; userId: string } | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = hashToken(token);
  const session = await db.session.findUnique({ where: { id }, select: { id: true, userId: true, expiresAt: true, createdAt: true } });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now || now - session.createdAt.getTime() > ABSOLUTE_MAX_MS) {
    await db.session.delete({ where: { id } }).catch(() => {});
    return null;
  }
  if (session.expiresAt.getTime() - now < RENEW_WHEN_LEFT_MS) {
    // Renovação deslizante enquanto o usuário estiver ativo.
    await db.session.update({ where: { id }, data: { expiresAt: new Date(now + SESSION_TTL_MS), lastSeenAt: new Date() } });
  }
  return { sessionId: session.id, userId: session.userId };
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const res = await db.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
  return res.count;
}
