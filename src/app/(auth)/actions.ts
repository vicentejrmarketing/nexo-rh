"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { attemptLogin } from "@/server/auth/login";
import { changeOwnPassword } from "@/server/auth/account";
import { clientInfo, createSession, destroyCurrentSession, validateSessionCookie } from "@/server/auth/session";
import { getActor } from "@/server/auth/current-user";
import { audit } from "@/server/audit/log";
import { db } from "@/server/db/client";
import { toActionError, type ActionResult } from "@/server/errors";

const loginSchema = z.object({
  email: z.string().trim().min(1, "Informe o e-mail.").max(160),
  password: z.string().min(1, "Informe a senha.").max(200),
});

/** Só aceita caminhos internos como destino após o login (evita redirecionamento aberto). */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/visao-geral";
}

// Nas fronteiras de autenticação (entrar, sair, trocar senha) o navegador faz uma carga completa da página
// em vez de navegação interna: assim nenhuma tela guardada da sessão anterior é reaproveitada.
type Redirect = { redirectTo: string };

export async function loginAction(_prev: ActionResult<Redirect>, formData: FormData): Promise<ActionResult<Redirect>> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, code: "VALIDATION", message: "Informe e-mail e senha." };
  const { ip } = await clientInfo();
  let result;
  try {
    result = await attemptLogin(parsed.data.email, parsed.data.password, ip);
  } catch (e) {
    return toActionError(e);
  }
  if (!result.ok) return { ok: false, code: "UNAUTHENTICATED", message: result.message };
  await createSession(result.userId);
  const user = await db.user.findUnique({ where: { id: result.userId }, select: { mustChangePassword: true } });
  const next = safeNext(formData.get("next"));
  return { ok: true, data: { redirectTo: user?.mustChangePassword ? "/trocar-senha" : next } };
}

export async function logoutAction(): Promise<void> {
  const actor = await getActor();
  if (actor) await audit(db, { actorId: actor.id, action: "auth.logout", entityType: "User", entityId: actor.id, summary: "Saiu do sistema" });
  await destroyCurrentSession();
}

export async function changePasswordAction(_prev: ActionResult<Redirect>, formData: FormData): Promise<ActionResult<Redirect>> {
  const session = await validateSessionCookie();
  if (!session) redirect("/login");
  try {
    const { ip } = await clientInfo();
    await changeOwnPassword(
      session.userId,
      session.sessionId,
      {
        currentPassword: String(formData.get("currentPassword") ?? ""),
        newPassword: String(formData.get("newPassword") ?? ""),
        confirmPassword: String(formData.get("confirmPassword") ?? ""),
      },
      ip,
    );
  } catch (e) {
    return toActionError(e);
  }
  return { ok: true, data: { redirectTo: "/visao-geral?senha=alterada" } };
}
