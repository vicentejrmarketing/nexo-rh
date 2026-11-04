"use client";

import { useActionState } from "react";
import { Button, Input } from "@/components/ui";
import { errorText, pick, type FormState } from "@/lib/form";
import { updateStageAction } from "./actions";

export function StageRow({ stage, defaultDays }: { stage: { id: string; name: string; kind: string; stalledDays: number | null }; defaultDays: number }) {
  const [state, action, pending] = useActionState(updateStageAction.bind(null, stage.id), { ok: true } as FormState);
  return (
    <form action={action} className="flex flex-1 flex-wrap items-center gap-2">
      <Input key={`n${state.submission ?? 0}`} name="name" aria-label="Nome da etapa" defaultValue={pick(state, "name", stage.name)} maxLength={40} className="min-w-[160px] flex-1" />
      {stage.kind === "OPEN" && (
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
          Alerta após
          <Input key={`d${state.submission ?? 0}`} name="stalledDays" type="number" min={1} max={60} aria-label="Dias para alerta" placeholder={String(defaultDays)} defaultValue={pick(state, "stalledDays", stage.stalledDays)} className="w-16" />
          dia(s)
        </label>
      )}
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>{pending ? "…" : "Salvar"}</Button>
      {state.ok && state.message && <span className="text-[12px] text-success">{state.message}</span>}
      {!state.ok && <span className="w-full text-[12px] text-danger">{errorText(state)}</span>}
    </form>
  );
}
