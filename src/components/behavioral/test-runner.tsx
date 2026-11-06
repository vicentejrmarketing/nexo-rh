"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { cn } from "@/components/ui";
import { startTestAction, submitTestAction } from "@/app/teste/actions";

type Q = { n: number; text: string; options: string[] };

// Progresso guardado só no aparelho do candidato, para continuar se fechar a página.
function load(key: string, total: number): (number | null)[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    if (Array.isArray(raw) && raw.length === total) return raw.map((v) => (Number.isInteger(v) && v >= 0 && v <= 3 ? v : null));
  } catch { /* sem armazenamento local: começa do zero */ }
  return Array(total).fill(null);
}

export function TestRunner({ token, storageKey, fullName, jobTitle, storeName, questions }: {
  token: string; storageKey: string; fullName: string; jobTitle: string | null; storeName: string | null; questions: Q[];
}) {
  const total = questions.length;
  const [answers, setAnswers] = useState<(number | null)[]>(() => Array(total).fill(null));
  const [step, setStep] = useState(-1); // -1 = apresentação
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const answered = answers.filter((a) => a !== null).length;

  // Recupera respostas salvas no aparelho (depois da hidratação, para não divergir do servidor).
  useEffect(() => {
    const saved = load(storageKey, total);
    if (saved.some((a) => a !== null)) setAnswers(saved); // eslint-disable-line react-hooks/set-state-in-effect
  }, [storageKey, total]);

  function choose(i: number) {
    const next = answers.map((a, k) => (k === step ? i : a));
    setAnswers(next);
    setError(null);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignora */ }
  }

  function begin() {
    void startTestAction(token);
    const firstOpen = answers.findIndex((a) => a === null);
    setStep(firstOpen === -1 ? total - 1 : firstOpen);
  }

  function finish() {
    const missing = answers.findIndex((a) => a === null);
    if (missing !== -1) {
      setError(`Falta responder a pergunta ${missing + 1}.`);
      setStep(missing);
      return;
    }
    start(async () => {
      const r = await submitTestAction(token, answers as number[]);
      if (r.ok || r.code === "CONFLICT") {
        try { localStorage.removeItem(storageKey); } catch { /* ignora */ }
      }
      if (r.ok) setDone(true);
      else setError(r.message);
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-black/[0.05] bg-white p-6 shadow-[0_2px_14px_rgba(17,18,22,0.05)] sm:p-8">
        <CheckCircle size={44} weight="fill" className="text-success" />
        <h1 className="mt-3 text-[24px] font-extrabold">Teste concluído com sucesso!</h1>
        <p className="mt-2 text-[15.5px]">Agradecemos sua participação no processo seletivo.</p>
      </div>
    );
  }

  if (step === -1) {
    return (
      <div className="rounded-2xl border border-black/[0.05] bg-white p-6 shadow-[0_2px_14px_rgba(17,18,22,0.05)] sm:p-8">
        <p className="text-[13px] font-bold tracking-[0.12em] text-brand-strong uppercase">Teste comportamental</p>
        <h1 className="mt-2 text-[26px] leading-tight font-extrabold">Olá, {fullName.split(" ")[0]}!</h1>
        <dl className="mt-4 grid gap-3 rounded-xl bg-surface p-4 text-[14px] sm:grid-cols-2">
          <div><dt className="text-muted">Candidato</dt><dd className="font-semibold">{fullName}</dd></div>
          <div><dt className="text-muted">Vaga pretendida</dt><dd className="font-semibold">{jobTitle ? `${jobTitle}${storeName ? ` · ${storeName}` : ""}` : "Processo seletivo"}</dd></div>
        </dl>
        <p className="mt-5 text-[15.5px] leading-relaxed">
          Queremos conhecer melhor seu perfil profissional, como você trabalha em equipe, lida com desafios, pressão, metas e situações do dia a dia.
        </p>
        <p className="mt-3 text-[15.5px] leading-relaxed">
          Responda com sinceridade. Não existem respostas certas ou erradas. O objetivo é entender melhor seu estilo de trabalho.
        </p>
        <p className="mt-4 text-[13.5px] text-muted">São {total} perguntas de múltipla escolha, cerca de 10 minutos. Você pode voltar e mudar respostas até finalizar.</p>
        <button type="button" onClick={begin} className="mt-6 h-13 w-full rounded-xl bg-brand text-[16px] font-extrabold text-ink uppercase hover:bg-brand-strong">
          {answered > 0 ? `Continuar (${answered} de ${total} respondidas)` : "Começar"}
        </button>
      </div>
    );
  }

  const q = questions[step];
  const last = step === total - 1;
  const pct = Math.round((answered / total) * 100);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[13px] font-medium">
          <span>Pergunta {step + 1} de {total}</span>
          <span className="text-muted">{answered} respondidas</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered} aria-label="Progresso">
          <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <fieldset className="rounded-2xl border border-black/[0.05] bg-white p-5 shadow-[0_2px_14px_rgba(17,18,22,0.05)] sm:p-7">
        <legend className="sr-only">Pergunta {step + 1}</legend>
        <p className="text-[19px] leading-snug font-bold">{q.text}</p>
        <div className="mt-5 flex flex-col gap-2.5">
          {q.options.map((o, i) => {
            const selected = answers[step] === i;
            return (
              <label key={i} className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-3.5 text-[15px] leading-snug transition-colors",
                selected ? "border-ink bg-brand-soft" : "border-line hover:border-ink/40",
              )}>
                <input type="radio" name={`q${q.n}`} checked={selected} onChange={() => choose(i)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#111216]" />
                <span>{o}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-[14px] text-danger" role="alert">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}
          className="inline-flex h-13 items-center justify-center gap-2 rounded-xl border border-ink/20 bg-white px-5 text-[15px] font-semibold hover:border-ink disabled:opacity-40">
          <ArrowLeft size={18} weight="bold" /> Voltar
        </button>
        {last ? (
          <button type="button" onClick={finish} disabled={pending || answers[step] === null}
            className="h-13 flex-1 rounded-xl bg-brand text-[16px] font-extrabold text-ink uppercase hover:bg-brand-strong disabled:opacity-50">
            {pending ? "Enviando…" : "Finalizar"}
          </button>
        ) : (
          <button type="button" onClick={() => { setError(null); setStep((s) => s + 1); }} disabled={answers[step] === null}
            className="inline-flex h-13 flex-1 items-center justify-center gap-2 rounded-xl bg-ink text-[16px] font-bold text-white hover:bg-ink-2 disabled:opacity-40">
            Avançar <ArrowRight size={18} weight="bold" />
          </button>
        )}
      </div>
      {last && answered < total && <p className="text-center text-[13px] text-muted">Faltam {total - answered} pergunta(s). Volte e responda todas para finalizar.</p>}
    </div>
  );
}
