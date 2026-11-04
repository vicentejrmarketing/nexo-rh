import "server-only";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { ValidationError } from "@/server/errors";
import { changePasswordSchema, fieldErrorsOf } from "@/server/modules/users/schemas";
import { hashPassword, passwordProblems, verifyPassword } from "./password";
import { revokeAllSessions } from "./session";

/** Troca de senha pelo próprio usuário. Derruba as demais sessões dele. */
export async function changeOwnPassword(
  userId: string,
  currentSessionId: string,
  raw: { currentPassword: string; newPassword: string; confirmPassword: string },
  ip?: string | null,
) {
  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, name: true, passwordHash: true } });
  if (!(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
    throw new ValidationError({ currentPassword: ["Senha atual incorreta."] });
  }
  const problems = passwordProblems(parsed.data.newPassword, { email: user.email, name: user.name });
  if (problems.length) throw new ValidationError({ newPassword: problems });

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(parsed.data.newPassword), mustChangePassword: false, passwordChangedAt: new Date() },
    });
    await audit(tx, { actorId: userId, action: "auth.password_change", entityType: "User", entityId: userId, summary: "Trocou a própria senha", ipAddress: ip });
  });
  await revokeAllSessions(userId, currentSessionId);
}
