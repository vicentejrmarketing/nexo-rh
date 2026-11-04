"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { Alert, Button, Card, CardHeader, Checkbox, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { pick, type FormState } from "@/lib/form";
import { rescheduleAction, scheduleAction, searchProcessesAction } from "@/app/(app)/entrevistas/actions";

type ProcessOpt = { id: string; label: string; detail: string; storeId: string };
type Initial = { date?: string; time?: string; durationMinutes?: number; mode?: string; interviewerId?: string | null; meetingUrl?: string | null; location?: string | null; storeId?: string; notes?: string | null };

function ProcessPicker({ value, onChange, error }: { value: ProcessOpt | null; onChange: (p: ProcessOpt | null) => void; error?: string[] }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProcessOpt[]>([]);
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim();
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const r = term.length >= 2 ? await searchProcessesAction(term) : [];
      if (n === seq.current) setHits(r);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-ink bg-brand-soft px-3 py-2.5">
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold">{value.label}</span>
          <span className="block truncate text-[12.5px] text-muted">{value.detail}</span>
        </span>
        <button type="button" onClick={() => onChange(null)} className="rounded-md p-1 text-muted hover:bg-white" aria-label="Trocar candidato"><X size={16} /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <MagnifyingGlass size={17} className="pointer-events-none absolute top-3 left-3 text-muted" />
      <Input id="processSearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite o nome ou telefone do candidato" className="pl-9" invalid={!!error} autoComplete="off" />
      {hits.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-line bg-white shadow-xl">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => { onChange(h); setQ(""); setHits([]); }} className="block w-full px-3 py-2 text-left hover:bg-surface">
                <span className="block text-[14px] font-medium">{h.label}</span>
                <span className="block text-[12px] text-muted">{h.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && hits.length === 0 && <p className="mt-1 text-[12.5px] text-muted">Nenhum processo ativo encontrado. O candidato precisa estar vinculado a uma vaga.</p>}
    </div>
  );
}

export function InterviewForm({
  mode, interviewId, process, stores, interviewers, initial = {}, cancelHref,
}: {
  mode: "new" | "reschedule"; interviewId?: string; process: ProcessOpt | null; stores: { id: string; name: string; address: string | null }[];
  interviewers: { id: string; name: string; role: string }[]; initial?: Initial; cancelHref: string;
}) {
  const action = mode === "new" ? scheduleAction : rescheduleAction.bind(null, interviewId!);
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormState);
  const e = !state.ok ? state.fieldErrors ?? {} : {};
  const [proc, setProc] = useState<ProcessOpt | null>(process);
  const [modeValue, setModeValue] = useState(pick(state, "mode", initial.mode ?? "ONLINE"));
  const [storeId, setStoreId] = useState(pick(state, "storeId", initial.storeId ?? process?.storeId ?? (stores.length === 1 ? stores[0].id : "")));
  // Ao escolher o candidato, a loja da vaga vira o padrão.
  const chooseProcess = (p: ProcessOpt | null) => {
    setProc(p);
    if (p && stores.some((s) => s.id === p.storeId)) setStoreId(p.storeId);
  };
  const storeAddress = stores.find((s) => s.id === storeId)?.address ?? "";

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {!state.ok && <Alert>{state.fieldErrors ? Object.values(state.fieldErrors).flat()[0] ?? "Revise os campos destacados." : state.message}</Alert>}
      <input type="hidden" name="processId" value={proc?.id ?? ""} />
      <input type="hidden" name="mode" value={modeValue} />
      <input type="hidden" name="storeId" value={storeId} />
      <Card>
        <CardHeader title={mode === "new" ? "Candidato e vaga" : "Novo horário"} />
        <div key={state.submission ?? 0} className="grid gap-5 p-5 sm:grid-cols-6">
          {mode === "new" && (
            <Field label="Candidato (processo seletivo)" htmlFor="processSearch" errors={e.processId} className="sm:col-span-6">
              <ProcessPicker value={proc} onChange={chooseProcess} error={e.processId} />
            </Field>
          )}
          <Field label="Data" htmlFor="date" errors={e.date} className="sm:col-span-2">
            <Input id="date" name="date" type="date" defaultValue={pick(state, "date", initial.date)} invalid={!!e.date} required />
          </Field>
          <Field label="Horário" htmlFor="time" errors={e.time} className="sm:col-span-2">
            <Input id="time" name="time" type="time" step={300} defaultValue={pick(state, "time", initial.time)} invalid={!!e.time} required />
          </Field>
          <Field label="Duração" htmlFor="durationMinutes" errors={e.durationMinutes} className="sm:col-span-2">
            <Select id="durationMinutes" name="durationMinutes" defaultValue={pick(state, "durationMinutes", initial.durationMinutes ?? 30)}>
              {[15, 20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? ` ${m % 60} min` : ""}`}</option>)}
            </Select>
          </Field>
          <fieldset className="sm:col-span-3">
            <legend className="mb-1.5 text-[13px] font-medium">Modalidade</legend>
            <div className="flex gap-2">
              {[["ONLINE", "Online"], ["IN_PERSON", "Presencial"]].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setModeValue(v)} aria-pressed={modeValue === v} className={`h-11 flex-1 rounded-lg border text-[14px] font-medium ${modeValue === v ? "border-ink bg-brand-soft" : "border-line bg-white hover:border-ink/40"}`}>{l}</button>
              ))}
            </div>
          </fieldset>
          <Field label="Entrevistador" htmlFor="interviewerId" errors={e.interviewerId} className="sm:col-span-3">
            <Select id="interviewerId" name="interviewerId" defaultValue={pick(state, "interviewerId", initial.interviewerId)}>
              <option value="">A definir</option>
              {interviewers.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
            </Select>
          </Field>
          <Field label="Loja" htmlFor="storeSel" errors={e.storeId} className="sm:col-span-3">
            <Select id="storeSel" value={storeId} onChange={(ev) => setStoreId(ev.target.value)} invalid={!!e.storeId}>
              <option value="">Selecione</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          {modeValue === "ONLINE" ? (
            <Field label="Link da reunião" htmlFor="meetingUrl" errors={e.meetingUrl} className="sm:col-span-3" hint="Google Meet, Zoom, Teams... (opcional)">
              <Input id="meetingUrl" name="meetingUrl" type="url" placeholder="https://meet.google.com/..." defaultValue={pick(state, "meetingUrl", initial.meetingUrl)} invalid={!!e.meetingUrl} />
            </Field>
          ) : (
            <Field label="Local" htmlFor="location" errors={e.location} className="sm:col-span-3" hint={storeAddress ? `Em branco: ${storeAddress}` : undefined}>
              <Input id="location" name="location" placeholder={storeAddress || "Endereço ou sala"} defaultValue={pick(state, "location", initial.location)} maxLength={200} />
            </Field>
          )}
          <Field label="Observações" htmlFor="notes" errors={e.notes} className="sm:col-span-6">
            <Textarea id="notes" name="notes" defaultValue={pick(state, "notes", initial.notes)} placeholder="O que levar, com quem falar na chegada, pontos a avaliar..." className="min-h-20" />
          </Field>
          {mode === "new" ? (
            <div className="sm:col-span-6">
              <Checkbox name="moveStage" defaultChecked={state.values ? state.values.moveStage === "on" : true} label="Mover o candidato para a etapa de entrevista no funil" hint="Online → Entrevista online; presencial → Entrevista presencial. Só avança, nunca volta etapa." />
            </div>
          ) : (
            <Field label="Motivo da remarcação" htmlFor="reason" className="sm:col-span-6">
              <Input id="reason" name="reason" defaultValue={pick(state, "reason")} placeholder="Ex.: candidato pediu outro horário" maxLength={500} />
            </Field>
          )}
        </div>
      </Card>
      <div className="flex justify-end gap-2">
        <Link href={cancelHref} className={buttonClass("secondary")}>Voltar</Link>
        <Button type="submit" disabled={pending}>{pending ? "Salvando…" : mode === "new" ? "Agendar entrevista" : "Reagendar"}</Button>
      </div>
    </form>
  );
}
