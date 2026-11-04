"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle, UserMinus, XCircle } from "@phosphor-icons/react";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { errorText, pick, type FormState } from "@/lib/form";
import { cancelAction, evaluateAction, outcomeAction } from "@/app/(app)/entrevistas/actions";

export function OutcomeButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (o: "COMPLETED" | "NO_SHOW") => start(async () => { const r = await outcomeAction(id, o); setError(r.ok ? null : errorText(r)); });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => run("COMPLETED")}><CheckCircle size={16} weight="fill" /> Foi realizada</Button>
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run("NO_SHOW")}><UserMinus size={16} /> Candidato faltou</Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

export function CancelForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(cancelAction.bind(null, id), { ok: true } as FormState);
  if (!open) return <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}><XCircle size={16} /> Cancelar entrevista</Button>;
  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border border-danger/30 bg-danger-soft/40 p-3">
      <label htmlFor="cancel-reason" className="text-[13px] font-medium">Motivo do cancelamento</label>
      <Input key={state.submission ?? 0} id="cancel-reason" name="reason" defaultValue={pick(state, "reason")} placeholder="Ex.: candidato desistiu, vaga pausada" maxLength={500} autoFocus />
      {!state.ok && <Alert>{errorText(state)}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="danger" disabled={pending}>{pending ? "Cancelando…" : "Confirmar cancelamento"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Voltar</Button>
      </div>
    </form>
  );
}

const CRITERIA = [["communication", "Comunicação"], ["experience", "Experiência"], ["attitude", "Postura"], ["availability", "Disponibilidade"]] as const;

function Stars({ name, label, defaultValue, error, required }: { name: string; label: string; defaultValue: string; error?: string[]; required?: boolean }) {
  const [v, setV] = useState(defaultValue);
  return (
    <fieldset>
      <legend className="mb-1 text-[13px] font-medium">{label}{required ? " *" : ""}</legend>
      <input type="hidden" name={name} value={v} />
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={v === String(n)}
            aria-label={`${n} de 5`}
            onClick={() => setV(v === String(n) && !required ? "" : String(n))}
            className={`h-9 w-9 rounded-lg border text-[14px] font-bold ${Number(v) >= n ? "border-brand bg-brand text-ink" : "border-line bg-white text-muted hover:border-ink/40"}`}
          >
            {n}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-[12.5px] text-danger">{error[0]}</p>}
    </fieldset>
  );
}

export function EvaluationForm({ id, initial }: { id: string; initial?: Record<string, string> }) {
  const [state, action, pending] = useActionState(evaluateAction.bind(null, id), { ok: true } as FormState);
  const e = !state.ok ? state.fieldErrors ?? {} : {};
  const val = (k: string) => pick(state, k, initial?.[k] ?? "");
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      {!state.ok && !state.fieldErrors && <Alert>{state.message}</Alert>}
      <div key={state.submission ?? 0} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {CRITERIA.map(([k, l]) => <Stars key={k} name={k} label={l} defaultValue={val(k)} error={e[k]} />)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Stars name="overall" label="Nota geral" defaultValue={val("overall")} error={e.overall} required />
          <Field label="Recomendação *" htmlFor="recommendation" errors={e.recommendation}>
            <Select id="recommendation" name="recommendation" defaultValue={val("recommendation")} invalid={!!e.recommendation}>
              <option value="">Selecione</option>
              <option value="ADVANCE">Avançar no processo</option>
              <option value="HOLD">Em dúvida</option>
              <option value="REJECT">Não seguir</option>
            </Select>
          </Field>
        </div>
        <Field label="Comentários" htmlFor="comments" errors={e.comments}>
          <Textarea id="comments" name="comments" defaultValue={val("comments")} placeholder="Pontos fortes, pontos de atenção, impressão geral" />
        </Field>
      </div>
      <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? "Salvando…" : initial ? "Atualizar minha avaliação" : "Registrar avaliação"}</Button></div>
    </form>
  );
}
