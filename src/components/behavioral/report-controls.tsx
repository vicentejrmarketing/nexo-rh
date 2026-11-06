"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise, Sparkle } from "@phosphor-icons/react";
import { Alert, Button, Textarea, cn } from "@/components/ui";
import { runAnalysisAction, saveReviewAction } from "@/app/(app)/teste-comportamental/actions";

/** Gera ou refaz a análise da IA (nova versão; as anteriores ficam no histórico). */
export function AnalysisButton({ testId, hasAnalysis }: { testId: string; hasAnalysis: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-2 print:hidden">
      <Button type="button" variant={hasAnalysis ? "secondary" : "primary"} size="sm" disabled={pending} onClick={() => start(async () => {
        setError(null);
        const r = await runAnalysisAction(testId);
        if (!r.ok) setError(r.message);
      })}>
        {hasAnalysis ? <ArrowsClockwise size={16} /> : <Sparkle size={16} weight="fill" />}
        {pending ? "A IA está analisando… (até 1 min)" : hasAnalysis ? "Reanalisar com IA" : "Gerar análise com IA"}
      </Button>
      {error && <p className="text-[12.5px] text-danger" role="alert">{error}</p>}
    </div>
  );
}

/** Enquanto a análise automática está em andamento, atualiza a página a cada 6 s (até 2 min). */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let n = 0;
    const t = setInterval(() => {
      if (++n > 20) clearInterval(t);
      router.refresh();
    }, 6000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}

type Item = { key: string; label: string; detail?: string };

/** Revisão humana: parecer do recrutador e o que foi confirmado na entrevista. */
export function ReviewForm({ testId, items, initial, reviewedBy }: { testId: string; items: Item[]; initial: { note: string; items: Record<string, string> }; reviewedBy: string | null }) {
  const [note, setNote] = useState(initial.note);
  const [state, setState] = useState<Record<string, string>>(initial.items);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => setState((s) => ({ ...s, [k]: s[k] === v ? "" : v }));
  return (
    <div className="flex flex-col gap-4">
      {items.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {items.map((it) => (
            <li key={it.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13.5px]">
              <span className="min-w-0 flex-1"><span className="font-medium">{it.label}</span>{it.detail && <span className="text-muted"> · {it.detail}</span>}</span>
              <span className="flex gap-1.5 print:hidden">
                {[["confirmado", "Confirmado"], ["nao_confirmado", "Não confirmado"]].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => set(it.key, v)} aria-pressed={state[it.key] === v}
                    className={cn("h-8 rounded-full border px-3 text-[12.5px] font-medium", state[it.key] === v ? (v === "confirmado" ? "border-success bg-success-soft text-success" : "border-danger bg-danger-soft text-danger") : "border-line hover:border-ink/40")}>
                    {l}
                  </button>
                ))}
              </span>
              <span className="hidden text-[12.5px] print:inline">{state[it.key] === "confirmado" ? "Confirmado" : state[it.key] === "nao_confirmado" ? "Não confirmado" : "Pendente"}</span>
            </li>
          ))}
        </ul>
      )}
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} className="min-h-24" aria-label="Parecer do recrutador"
        placeholder="Parecer do recrutador após a entrevista: o que se confirmou, o que não se confirmou e a recomendação da equipe." />
      {msg && <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert>}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button type="button" size="sm" disabled={pending} onClick={() => start(async () => {
          const r = await saveReviewAction(testId, note, Object.fromEntries(Object.entries(state).filter(([, v]) => v)));
          setMsg(r.ok ? { ok: true, text: "Revisão salva." } : { ok: false, text: r.message });
        })}>{pending ? "Salvando…" : "Salvar revisão"}</Button>
        {reviewedBy && <span className="text-[12.5px] text-muted">Última revisão: {reviewedBy}</span>}
      </div>
    </div>
  );
}
