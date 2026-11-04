"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { PencilSimple, Plus } from "@phosphor-icons/react";
import { Alert, Badge, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { errorText, pick, type FormState } from "@/lib/form";
import { saveTemplateAction, submitAction, suggestedAction, syncAction, toggleAction } from "./actions";

type Tpl = { id: string; name: string; purpose: string; category: string; text: string; approval: string; approvalLabel: string; rejectionReason: string | null; active: boolean; metaName: string | null };
type VarInfo = { key: string; label: string; example: string };

function Form({ tpl, purposes, vars, onDone }: { tpl?: Tpl; purposes: readonly string[]; vars: VarInfo[]; onDone?: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const r = await saveTemplateAction(tpl?.id ?? null, prev, fd);
    if (r.ok) onDone?.();
    return r;
  }, { ok: true } as FormState);
  const e = !state.ok ? state.fieldErrors ?? {} : {};
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(pick(state, "text", tpl?.text));
  const insert = (k: string) => {
    const el = ref.current;
    const at = el?.selectionStart ?? text.length;
    const next = `${text.slice(0, at)}{${k}}${text.slice(el?.selectionEnd ?? at)}`;
    setText(next);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + k.length + 2, at + k.length + 2); });
  };
  const preview = text.replace(/\{([a-z_0-9]+)\}/gi, (m, k: string) => vars.find((v) => v.key === k.toLowerCase())?.example ?? m);
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {!state.ok && <Alert>{state.fieldErrors ? Object.values(state.fieldErrors).flat()[0] : state.message}</Alert>}
      {tpl && tpl.approval !== "LOCAL_ONLY" && <Alert tone="warning">Alterar o texto ou a categoria exige uma nova aprovação da Meta.</Alert>}
      <div key={state.submission ?? 0} className="grid gap-4 sm:grid-cols-3">
        <Field label="Nome" htmlFor={`n-${tpl?.id ?? "new"}`} errors={e.name}>
          <Input id={`n-${tpl?.id ?? "new"}`} name="name" defaultValue={pick(state, "name", tpl?.name)} maxLength={60} invalid={!!e.name} />
        </Field>
        <Field label="Finalidade" htmlFor={`p-${tpl?.id ?? "new"}`} errors={e.purpose}>
          <Select id={`p-${tpl?.id ?? "new"}`} name="purpose" defaultValue={pick(state, "purpose", tpl?.purpose ?? purposes[0])}>
            {purposes.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Categoria na Meta" htmlFor={`c-${tpl?.id ?? "new"}`} errors={e.category} hint="Utilidade: processo seletivo. Marketing: divulgação.">
          <Select id={`c-${tpl?.id ?? "new"}`} name="category" defaultValue={pick(state, "category", tpl?.category ?? "UTILITY")}>
            <option value="UTILITY">Utilidade</option>
            <option value="MARKETING">Marketing</option>
          </Select>
        </Field>
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-medium">Inserir variável</p>
        <div className="flex flex-wrap gap-1.5">
          {vars.map((v) => (
            <button key={v.key} type="button" onClick={() => insert(v.key)} title={v.label} className="rounded-full border border-line bg-white px-2.5 py-1 font-mono text-[12px] hover:border-ink">{`{${v.key}}`}</button>
          ))}
        </div>
      </div>
      <Field label="Texto" htmlFor={`t-${tpl?.id ?? "new"}`} errors={e.text}>
        <Textarea ref={ref} id={`t-${tpl?.id ?? "new"}`} name="text" value={text} onChange={(ev) => setText(ev.target.value)} maxLength={1024} className="min-h-28" invalid={!!e.text} />
      </Field>
      {text && (
        <div className="rounded-xl bg-[#e7f6e2] p-3">
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-ink/60 uppercase">Prévia</p>
          <p className="max-w-md rounded-lg bg-white px-3 py-2 text-[14px] whitespace-pre-line shadow-sm">{preview}</p>
        </div>
      )}
      <div className="flex justify-end gap-2">
        {onDone && <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>}
        <Button type="submit" disabled={pending}>{pending ? "Salvando…" : tpl ? "Salvar modelo" : "Criar modelo"}</Button>
      </div>
    </form>
  );
}

function Row({ t, purposes, vars, connected }: { t: Tpl; purposes: readonly string[]; vars: VarInfo[]; connected: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const tone = t.approval === "APPROVED" ? "success" : t.approval === "REJECTED" ? "danger" : t.approval === "PENDING" ? "warning" : "neutral";
  if (editing) return <li className="p-5"><Form tpl={t} purposes={purposes} vars={vars} onDone={() => setEditing(false)} /></li>;
  return (
    <li className={`flex flex-col gap-3 p-5 ${t.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{t.name}</p>
          <Badge>{t.purpose}</Badge>
          <Badge tone={tone}>{t.approvalLabel}</Badge>
          {!t.active && <Badge>Inativo</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          {connected && (t.approval === "LOCAL_ONLY" || t.approval === "REJECTED") && t.active && (
            <Button type="button" size="sm" disabled={pending} onClick={() => start(async () => { const r = await submitAction(t.id); setMsg({ ok: r.ok, text: r.ok ? r.message ?? "" : errorText(r) }); })}>
              {pending ? "Enviando…" : t.approval === "REJECTED" ? "Reenviar à Meta" : "Enviar para aprovação"}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}><PencilSimple size={15} /> Editar</Button>
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { await toggleAction(t.id, !t.active); })}>{t.active ? "Desativar" : "Ativar"}</Button>
        </div>
      </div>
      <p className="rounded-lg bg-surface px-3 py-2 text-[13.5px] whitespace-pre-line">{t.text}</p>
      {t.rejectionReason && <p className="text-[12.5px] text-danger">Motivo da recusa: {t.rejectionReason}</p>}
      {msg && <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert>}
    </li>
  );
}

export function TemplatesManager({ templates, purposes, vars, connected, canSeed }: { templates: Tpl[]; purposes: readonly string[]; vars: VarInfo[]; connected: boolean; canSeed: boolean }) {
  const [creating, setCreating] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const act = (fn: () => Promise<{ ok: boolean; message?: string }>) => start(async () => { const r = await fn(); setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Pronto." : errorText(r as never) }); });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setCreating(true)}><Plus size={16} weight="bold" /> Novo modelo</Button>
        {canSeed && <Button type="button" variant="secondary" disabled={pending} onClick={() => act(suggestedAction)}>Criar modelos sugeridos</Button>}
        {connected && <Button type="button" variant="secondary" disabled={pending} onClick={() => act(syncAction)}>{pending ? "Sincronizando…" : "Sincronizar com a Meta"}</Button>}
      </div>
      {msg && <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert>}
      {creating && (
        <div className="rounded-[var(--radius-card)] border border-ink/20 bg-white p-5">
          <Form purposes={purposes} vars={vars} onDone={() => setCreating(false)} />
        </div>
      )}
      <div className="rounded-[var(--radius-card)] border border-black/[0.05] bg-white shadow-[0_2px_14px_rgba(17,18,22,0.05)]">
        {templates.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-muted">Nenhum modelo ainda. Crie os sugeridos (convocação, lembrete, aprovação...) e ajuste o texto.</p>
        ) : (
          <ul className="divide-y divide-line">{templates.map((t) => <Row key={t.id} t={t} purposes={purposes} vars={vars} connected={connected} />)}</ul>
        )}
      </div>
    </div>
  );
}
