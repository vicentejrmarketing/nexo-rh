"use client";

import { useActionState, useState, useTransition } from "react";
import { Plus, UploadSimple, X } from "@phosphor-icons/react";
import { Alert, Button, Input, Select, Textarea } from "@/components/ui";
import { FileInput } from "@/components/ui/file-input";
import { errorText, type FormState } from "@/lib/form";
import type { ActionResult } from "@/server/errors";
import { addNoteAction, addTagAction, linkJobAction, removeTagAction, setOwnerAction, setTalentPoolAction, uploadResumeAction } from "../actions";

function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(errorText(r));
      else after?.();
    });
  return { pending, error, run };
}

export function NoteForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(addNoteAction.bind(null, id), { ok: true } as FormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <Textarea key={state.submission ?? 0} name="body" defaultValue={state.ok ? "" : String(state.values?.body ?? "")} placeholder="Registrar observação: como foi o contato, impressões, disponibilidade..." aria-label="Nova observação" className="min-h-20" />
      {!state.ok && <Alert>{errorText(state)}</Alert>}
      <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "Salvando…" : "Adicionar observação"}</Button></div>
    </form>
  );
}

export function ResumeUpload({ id, hasResume }: { id: string; hasResume: boolean }) {
  const [state, action, pending] = useActionState(uploadResumeAction.bind(null, id), { ok: true } as ActionResult);
  return (
    <form action={action} className="flex flex-col gap-2">
      <FileInput id={`resume-${id}`} name="resume" accept="application/pdf,.pdf" label={hasResume ? "Novo PDF" : "Escolher PDF"} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}><UploadSimple size={15} /> {pending ? "Enviando…" : hasResume ? "Substituir currículo" : "Anexar currículo"}</Button>
      {!state.ok && <Alert>{errorText(state)}</Alert>}
    </form>
  );
}

export function TagEditor({ id, tags, suggestions }: { id: string; tags: { id: string; name: string }[]; suggestions: string[] }) {
  const [name, setName] = useState("");
  const { pending, error, run } = useRun();
  const free = suggestions.filter((s) => !tags.some((t) => t.name.toLowerCase() === s.toLowerCase()));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && <span className="text-[13px] text-muted">Sem etiquetas.</span>}
        {tags.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-[12.5px] font-medium">
            {t.name}
            <button type="button" aria-label={`Remover etiqueta ${t.name}`} disabled={pending} onClick={() => run(() => removeTagAction(id, t.id))} className="rounded-full p-0.5 hover:bg-brand/40"><X size={11} weight="bold" /></button>
          </span>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) run(() => addTagAction(id, name), () => setName(""));
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} list={`tags-${id}`} placeholder="Nova etiqueta (ex.: experiência em caixa)" aria-label="Nova etiqueta" maxLength={30} />
        <datalist id={`tags-${id}`}>{free.map((s) => <option key={s} value={s} />)}</datalist>
        <Button type="submit" size="sm" variant="secondary" disabled={pending || !name.trim()}><Plus size={15} weight="bold" /> Etiquetar</Button>
      </form>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

export function OwnerControl({ id, ownerId, owners, selfId, selfOnly }: { id: string; ownerId: string | null; owners: { id: string; name: string }[]; selfId: string; selfOnly: boolean }) {
  const { pending, error, run } = useRun();
  if (selfOnly) {
    return ownerId === selfId ? null : (
      <div className="flex flex-col gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setOwnerAction(id, selfId))}>Assumir candidato</Button>
        {error && <Alert>{error}</Alert>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Select aria-label="Recrutador responsável" defaultValue={ownerId ?? ""} disabled={pending} onChange={(e) => run(() => setOwnerAction(id, e.target.value || null))}>
        <option value="">Sem responsável</option>
        {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </Select>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

export function TalentPoolToggle({ id, value }: { id: string; value: boolean }) {
  const { pending, error, run } = useRun();
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="sm" variant={value ? "secondary" : "primary"} disabled={pending} onClick={() => run(() => setTalentPoolAction(id, !value))}>
        {value ? "Retirar do banco de talentos" : "Incluir no banco de talentos"}
      </Button>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

export function LinkJob({ id, jobs }: { id: string; jobs: { id: string; title: string; store: string }[] }) {
  const [jobId, setJobId] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const { pending, error, run } = useRun();
  if (jobs.length === 0) return <p className="text-[13px] text-muted">Nenhuma vaga aberta disponível para este candidato.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Select value={jobId} onChange={(e) => setJobId(e.target.value)} aria-label="Vaga">
          <option value="">Escolha uma vaga aberta</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title} · {j.store}</option>)}
        </Select>
        <Button type="button" size="sm" disabled={!jobId || pending} onClick={() => run(() => linkJobAction(id, jobId), () => { setDone(jobs.find((j) => j.id === jobId)?.title ?? ""); setJobId(""); })}>Vincular</Button>
      </div>
      {done && <Alert tone="success">Vinculado à vaga {done}, na etapa Inscrito.</Alert>}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
