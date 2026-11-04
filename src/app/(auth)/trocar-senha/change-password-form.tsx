"use client";

import { useActionState, useEffect } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import type { ActionResult } from "@/server/errors";
import { changePasswordAction } from "../actions";

const initial: ActionResult<{ redirectTo: string }> = { ok: true };

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);
  const errors = !state.ok ? state.fieldErrors ?? {} : {};
  const redirectTo = state.ok ? state.data?.redirectTo : undefined;
  useEffect(() => {
    if (redirectTo) window.location.assign(redirectTo);
  }, [redirectTo]);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {!state.ok && !state.fieldErrors && <Alert>{state.message}</Alert>}
      <Field label="Senha atual" htmlFor="currentPassword" errors={errors.currentPassword}>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required invalid={!!errors.currentPassword} />
      </Field>
      <Field label="Nova senha" htmlFor="newPassword" errors={errors.newPassword} hint="Mínimo de 10 caracteres, com letras e números.">
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required invalid={!!errors.newPassword} />
      </Field>
      <Field label="Confirme a nova senha" htmlFor="confirmPassword" errors={errors.confirmPassword}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required invalid={!!errors.confirmPassword} />
      </Field>
      <Button type="submit" disabled={pending || !!redirectTo} className="mt-2 h-11">
        {pending || redirectTo ? "Salvando…" : "Salvar nova senha"}
      </Button>
    </form>
  );
}
