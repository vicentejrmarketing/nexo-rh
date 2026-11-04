"use client";

import { useActionState, useState, useTransition } from "react";
import { ArrowsClockwise, Check, Copy, Key } from "@phosphor-icons/react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { errorText, pick, type FormState } from "@/lib/form";
import { generateVerifyTokenAction, saveCredentialsAction, testConnectionAction } from "./actions";

export function CopyText({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button type="button" size="sm" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(value).catch(() => window.prompt("Copie:", value)); setDone(true); setTimeout(() => setDone(false), 2000); }}>
      {done ? <Check size={15} weight="bold" /> : <Copy size={15} />} {done ? "Copiado" : label}
    </Button>
  );
}

export function CredentialsForm({ current }: { current: { appId: string | null; wabaId: string | null; phoneNumberId: string | null; tokenLast4: string | null; hasAppSecret: boolean } }) {
  const [state, action, pending] = useActionState(saveCredentialsAction, { ok: true } as FormState);
  const e = !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={action} noValidate className="flex flex-col gap-4" autoComplete="off">
      {state.message && (state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert>{state.fieldErrors ? "Revise os campos destacados." : state.message}</Alert>)}
      <div key={state.submission ?? 0} className="grid gap-4 sm:grid-cols-2">
        <Field label="Meta App ID" htmlFor="appId" errors={e.appId}>
          <Input id="appId" name="appId" inputMode="numeric" defaultValue={pick(state, "appId", current.appId)} invalid={!!e.appId} />
        </Field>
        <Field label="WhatsApp Business Account ID" htmlFor="wabaId" errors={e.wabaId}>
          <Input id="wabaId" name="wabaId" inputMode="numeric" defaultValue={pick(state, "wabaId", current.wabaId)} invalid={!!e.wabaId} />
        </Field>
        <Field label="Phone Number ID" htmlFor="phoneNumberId" errors={e.phoneNumberId} className="sm:col-span-2">
          <Input id="phoneNumberId" name="phoneNumberId" inputMode="numeric" defaultValue={pick(state, "phoneNumberId", current.phoneNumberId)} invalid={!!e.phoneNumberId} />
        </Field>
        <Field label="Access Token (permanente)" htmlFor="accessToken" errors={e.accessToken} className="sm:col-span-2" hint={current.tokenLast4 ? `Salvo: •••• ${current.tokenLast4}. Deixe em branco para manter.` : "Token do Usuário do sistema, com whatsapp_business_messaging e whatsapp_business_management."}>
          <Input id="accessToken" name="accessToken" type="password" autoComplete="new-password" spellCheck={false} invalid={!!e.accessToken} />
        </Field>
        <Field label="App Secret" htmlFor="appSecret" errors={e.appSecret} className="sm:col-span-2" hint={current.hasAppSecret ? "Salvo. Deixe em branco para manter." : "Configurações do app → Básico → Chave secreta do app. Usado para confirmar que o webhook vem da Meta."}>
          <Input id="appSecret" name="appSecret" type="password" autoComplete="new-password" spellCheck={false} invalid={!!e.appSecret} />
        </Field>
      </div>
      <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? "Salvando e testando…" : "Salvar e testar conexão"}</Button></div>
    </form>
  );
}

export function TestButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await testConnectionAction(); setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Conectado." : errorText(r) }); })}>
        <ArrowsClockwise size={15} /> {pending ? "Testando…" : "Testar conexão"}
      </Button>
      {msg && <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert>}
    </div>
  );
}

export function VerifyTokenBox({ has }: { has: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (token) {
    return (
      <div className="flex flex-col gap-2">
        <Alert tone="brand" title="Copie agora: este valor não será mostrado de novo">Cole no campo “Verificar token” do webhook na Meta.</Alert>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2 font-mono text-[13px]">{token}</code>
          <CopyText value={token} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted">{has ? "Já existe um Verify Token. Gerar outro invalida o anterior (atualize também na Meta)." : "Gere o token e cole na Meta ao cadastrar o webhook."}</p>
      <Button type="button" size="sm" variant={has ? "secondary" : "primary"} disabled={pending} onClick={() => start(async () => { const r = await generateVerifyTokenAction(); if (r.ok && r.data) setToken(r.data); else if (!r.ok) setError(errorText(r)); })}>
        <Key size={15} /> {has ? "Gerar novo Verify Token" : "Gerar Verify Token"}
      </Button>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
