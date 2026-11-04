"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { pick, type FormState } from "@/lib/form";
import { privacyRequestAction } from "@/app/trabalhe-conosco/actions";

export function PrivacyRequestForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(privacyRequestAction, { ok: true } as FormState);
  const e = !state.ok ? state.fieldErrors ?? {} : {};
  if (state.ok && state.message) return <Alert tone="success" title="Pedido enviado">{state.message}</Alert>;
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {!state.ok && <Alert>{state.fieldErrors ? "Confira os campos destacados." : state.message}</Alert>}
      <input type="hidden" name="_t" value={token} />
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><input name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></div>
      <div key={state.submission ?? 0} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo" htmlFor="pr-name" errors={e.fullName} className="sm:col-span-2">
          <Input id="pr-name" name="fullName" defaultValue={pick(state, "fullName")} invalid={!!e.fullName} />
        </Field>
        <Field label="Telefone usado na inscrição" htmlFor="pr-phone" errors={e.phone}>
          <Input id="pr-phone" name="phone" type="tel" defaultValue={pick(state, "phone")} invalid={!!e.phone} />
        </Field>
        <Field label="E-mail usado na inscrição" htmlFor="pr-email" errors={e.email}>
          <Input id="pr-email" name="email" type="email" defaultValue={pick(state, "email")} invalid={!!e.email} />
        </Field>
        <Field label="Mensagem (opcional)" htmlFor="pr-msg" errors={e.message} className="sm:col-span-2">
          <Textarea id="pr-msg" name="message" defaultValue={pick(state, "message")} className="min-h-20" maxLength={2000} />
        </Field>
      </div>
      <button disabled={pending} className="h-12 rounded-xl bg-ink text-[15px] font-semibold text-white hover:bg-ink-2 disabled:opacity-60">{pending ? "Enviando…" : "Pedir exclusão dos meus dados"}</button>
    </form>
  );
}
