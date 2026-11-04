"use client";

import { useActionState, useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { Alert, Button, Card, CardHeader, Input } from "@/components/ui";
import type { ActionResult } from "@/server/errors";
import { deleteUserAction, resetPasswordAction } from "./actions";
import { CopyablePassword } from "./user-form";

export function ResetPasswordCard({ userId, userName }: { userId: string; userName: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction.bind(null, userId), { ok: true } as ActionResult<{ temporaryPassword: string }>);
  return (
    <Card>
      <CardHeader title="Senha temporária" description="Gera uma nova senha e encerra as sessões abertas do usuário." />
      <div className="p-5">
        {state.ok && state.data ? (
          <Alert tone="success" title="Nova senha gerada">
            Envie a senha a {userName} por um canal seguro. Ela aparece só esta vez.
            <CopyablePassword value={state.data.temporaryPassword} />
          </Alert>
        ) : (
          <form action={action}>
            {!state.ok && <div className="mb-3"><Alert>{state.message}</Alert></div>}
            <Button type="submit" variant="secondary" disabled={pending}>
              <KeyRound size={16} />
              {pending ? "Gerando…" : "Gerar senha temporária"}
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}

export function DeleteUserCard({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteUserAction.bind(null, userId), { ok: true } as ActionResult);
  return (
    <Card className="border-danger/30">
      <CardHeader title="Excluir usuário" description="Remove o acesso de forma definitiva. O histórico de ações dele é mantido." />
      <div className="p-5">
        {!open ? (
          <Button type="button" variant="danger" onClick={() => setOpen(true)}>
            <Trash2 size={16} />
            Excluir usuário
          </Button>
        ) : (
          <form action={action} className="flex flex-col gap-3">
            {!state.ok && <Alert>{state.message}</Alert>}
            <label htmlFor="confirm" className="text-sm text-ink">
              Para confirmar, digite <strong>EXCLUIR</strong>. Se a pessoa só vai se afastar, prefira deixar o usuário inativo.
            </label>
            <Input id="confirm" name="confirm" autoComplete="off" className="max-w-xs" />
            <div className="flex gap-2">
              <Button type="submit" variant="danger" disabled={pending}>{pending ? "Excluindo…" : "Confirmar exclusão"}</Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
