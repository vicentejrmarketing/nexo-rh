"use client";

import { useActionState, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { Alert, Button, Field, Input } from "@/components/ui";
import type { ActionResult } from "@/server/errors";
import { loginAction } from "../actions";

const initial: ActionResult<{ redirectTo: string }> = { ok: true };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  // Controlado: o React limpa campos não controlados após a ação, e o e-mail deve continuar preenchido em caso de erro.
  const [email, setEmail] = useState("");
  const next = useSearchParams().get("next") ?? "";
  const redirectTo = state.ok ? state.data?.redirectTo : undefined;
  useEffect(() => {
    if (redirectTo) window.location.assign(redirectTo);
  }, [redirectTo]);
  const expired = useSearchParams().get("sessao") === "expirada";

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {expired && state.ok && <Alert tone="warning">Sua sessão expirou. Entre novamente.</Alert>}
      {!state.ok && <Alert>{state.message}</Alert>}
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus placeholder="voce@empresa.com.br" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Senha" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={pending || !!redirectTo} className="mt-2 h-11">
        <LogIn size={18} />
        {pending || redirectTo ? "Entrando…" : "Entrar"}
      </Button>
      <p className="text-center text-[13px] text-muted">
        Esqueceu a senha? Peça ao administrador uma senha temporária.
      </p>
    </form>
  );
}
