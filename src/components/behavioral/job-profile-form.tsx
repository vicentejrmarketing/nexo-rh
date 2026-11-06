"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Card, CardHeader, Select } from "@/components/ui";
import type { FormState } from "@/lib/form";
import { saveJobProfileAction } from "@/app/(app)/teste-comportamental/actions";

type Comp = { key: string; name: string };
type Tpl = { key: string; name: string; weights: Record<string, number>; essentials: { key: string; min: number }[] };

const WEIGHT_LABEL: Record<number, string> = { 0: "Não considerar", 1: "Normal", 2: "Importante", 3: "Prioritária" };

export function JobProfileForm({ jobId, competencies, templates, current, updated }: {
  jobId: string; competencies: Comp[]; templates: Tpl[]; current: { template: string; weights: Record<string, number>; essentials: { key: string; min: number }[] }; updated: string;
}) {
  const [state, action, pending] = useActionState(saveJobProfileAction.bind(null, jobId), { ok: true } as FormState);
  const [tpl, setTpl] = useState(current.template);
  const [weights, setWeights] = useState(current.weights);
  const [ess, setEss] = useState<Record<string, number | null>>(Object.fromEntries(competencies.map((c) => [c.key, current.essentials.find((e) => e.key === c.key)?.min ?? null])));
  const e = !state.ok ? state.fieldErrors ?? {} : {};

  function applyTemplate(key: string) {
    setTpl(key);
    const t = templates.find((x) => x.key === key);
    if (!t) return;
    setWeights(t.weights);
    setEss(Object.fromEntries(competencies.map((c) => [c.key, t.essentials.find((x) => x.key === c.key)?.min ?? null])));
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Modelo" description="Comece por um modelo e ajuste se precisar. Ao alterar, a vaga passa a usar os novos pesos nos PRÓXIMOS testes; os já enviados mantêm o critério do envio." />
        <div className="flex flex-wrap items-center gap-3 p-5">
          <Select name="template" value={tpl} onChange={(ev) => applyTemplate(ev.target.value)} className="w-auto" aria-label="Modelo de pesos">
            {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            {!templates.some((t) => t.key === tpl) && <option value={tpl}>Personalizado</option>}
          </Select>
          <span className="text-[12.5px] text-muted">{updated}</span>
        </div>
      </Card>
      <Card>
        <CardHeader title="Pesos das competências" description="Peso 3 conta três vezes mais que peso 1 na nota geral. Competência essencial é uma referência de compatibilidade, nunca reprovação automática." />
        <ul className="divide-y divide-line">
          {competencies.map((c) => (
            <li key={c.key} className="grid items-center gap-3 px-5 py-3.5 sm:grid-cols-[1fr_auto_auto]">
              <span className="text-[14px] font-medium">{c.name}</span>
              <span className="flex gap-1" role="radiogroup" aria-label={`Peso de ${c.name}`}>
                {[0, 1, 2, 3].map((w) => (
                  <label key={w} title={WEIGHT_LABEL[w]} className="flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg border border-line px-2.5 text-[13px] font-semibold has-[:checked]:border-ink has-[:checked]:bg-brand">
                    <input type="radio" name={`w_${c.key}`} value={w} checked={weights[c.key] === w} onChange={() => { setWeights((s) => ({ ...s, [c.key]: w })); setTpl("personalizado"); }} className="sr-only" />
                    {w}
                  </label>
                ))}
              </span>
              <span className="flex items-center gap-2 text-[13px]">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name={`e_${c.key}`} checked={ess[c.key] !== null} onChange={(ev) => { setEss((s) => ({ ...s, [c.key]: ev.target.checked ? 70 : null })); setTpl("personalizado"); }} className="h-4 w-4 accent-[#F5B900]" />
                  Essencial
                </label>
                {ess[c.key] !== null && (
                  <input type="number" name={`min_${c.key}`} min={40} max={100} value={ess[c.key] ?? 70} onChange={(ev) => setEss((s) => ({ ...s, [c.key]: Number(ev.target.value) }))}
                    aria-label={`Referência mínima de ${c.name}`} className="h-9 w-16 rounded-lg border border-line px-2 text-center tabular" />
                )}
              </span>
              {(e[`w_${c.key}`] || e[`min_${c.key}`]) && <p className="text-[12.5px] text-danger sm:col-span-3">{(e[`w_${c.key}`] ?? e[`min_${c.key}`])![0]}</p>}
            </li>
          ))}
        </ul>
        <p className="px-5 pb-4 text-[12.5px] text-muted">0 = não considerar · 1 = normal · 2 = importante · 3 = prioritária. Organização e atenção a procedimentos entram em Responsabilidade; resiliência diante de negativas, em Controle emocional.</p>
      </Card>
      {!state.ok && <Alert>{e.weights?.[0] ?? state.message}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <div><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar pesos da vaga"}</Button></div>
    </form>
  );
}
