import Link from "next/link";
import {
  Brain, ChartPolar, ChatCircleDots, ClipboardText, Gauge, Info, Lightning, ListChecks, Scales, Sparkle, Target, TextAlignLeft, UserFocus, WarningCircle,
} from "@phosphor-icons/react/ssr";
import { Alert, Badge, PageHeader, buttonClass, cn } from "@/components/ui";
import { Panel } from "@/components/dashboard/widgets";
import { CompetencyRadar, PrintButton } from "./chart";
import { AnalysisButton, AutoRefresh, ReviewForm } from "./report-controls";
import { COMPETENCIES, INTERVIEW_QUESTIONS, type CompetencyKey } from "@/server/modules/behavioral/questionnaire";
import { bandV2 } from "@/server/modules/behavioral/matrix";
import type { ResultV2 } from "@/server/modules/behavioral/scoring-v2";
import type { AiOutput } from "@/server/modules/behavioral/ai";
import type { getReport } from "@/server/modules/behavioral/service";
import { formatDate, formatDateTime } from "@/lib/format";

type Report = Awaited<ReturnType<typeof getReport>>;
const nameOf = (k: CompetencyKey) => COMPETENCIES.find((c) => c.key === k)!.name;
const tone = (score: number) => bandV2(score).tone as "success" | "brand" | "warning" | "danger";
const color = (score: number) => ({ success: "#15803d", brand: "#F5B900", warning: "#b45309", danger: "#c62828" })[tone(score)];
const ev = (ns: number[]) => (ns.length ? ns.map((n) => `P${n}`).join(", ") : "");

function Score({ score }: { score: number }) {
  return <Badge tone={tone(score)}><strong className="tabular">{score}</strong> · {bandV2(score).label}</Badge>;
}
function Evidence({ ns }: { ns: number[] }) {
  return ns.length ? <span className="ml-1 inline-flex rounded-md bg-surface px-1.5 py-0.5 text-[11.5px] font-medium text-muted">Evidências: {ev(ns)}</span> : null;
}
function AiTag() {
  return <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-brand"><Sparkle size={11} weight="fill" /> IA</span>;
}

export function ReportV2({ data, r }: { data: Report; r: ResultV2 }) {
  const t = data.test;
  const latest = t.analyses[0] ?? null;
  const done = t.analyses.find((a) => a.status === "COMPLETED") ?? null;
  const ai = done?.output as AiOutput | null;
  const pending = data.analysisPending;
  const review = (t.review as { note: string | null; items: Record<string, string> } | null) ?? { note: null, items: {} };
  const aiQ = new Map((ai?.analisePerguntas ?? []).map((a) => [a.n, a.interpretacao]));
  const aiC = new Map((ai?.contradicoes ?? []).map((c) => [c.id, c.comentario]));
  const aiStrong = new Map((ai?.pontosFortes ?? []).map((p) => [p.competencia, p]));
  const aiAttn = new Map((ai?.pontosAtencao ?? []).map((p) => [p.competencia, p]));
  const weighted = r.competencies.some((c) => c.weight !== 1);
  const jobTitle = t.candidateJob?.job.title ?? null;
  const reviewItems = [
    ...r.contradictions.map((c) => ({ key: `contradicao:${c.id}`, label: `Contradição: ${c.title}`, detail: ev(c.questions) })),
    ...r.attention.map((k) => ({ key: `atencao:${k}`, label: `Ponto de atenção: ${nameOf(k)}` })),
    ...(ai?.possiveisDificuldades ?? []).map((d, i) => ({ key: `dificuldade:${i}`, label: `Hipótese: ${d.situacao}` })),
  ];
  const deterministicQuestions = [
    ...r.contradictions.map((c) => ({ competency: c.competency, q: c.interviewQuestion, why: `Esclarecer: ${c.title.toLowerCase()} (${ev(c.questions)}).` })),
    ...r.attention.flatMap((k) => INTERVIEW_QUESTIONS[k].map((q) => ({ competency: k, q, why: `Aprofundar ${nameOf(k).toLowerCase()} (nota ${r.competencies.find((c) => c.key === k)!.score}).` }))),
  ];

  return (
    <>
      <AutoRefresh active={pending} />
      <PageHeader
        title="Relatório do Recrutador de IA"
        description={`${t.candidate.fullName}${jobTitle ? ` · ${jobTitle} (${t.candidateJob!.job.store.name})` : ""}`}
        actions={
          <span className="flex flex-wrap gap-2 print:hidden">
            <Link href={`/candidatos/${t.candidate.id}`} className={buttonClass("secondary")}>Ficha do candidato</Link>
            {t.candidateJob && <Link href={`/teste-comportamental/comparar/${t.candidateJob.job.id}`} className={buttonClass("secondary")}>Comparar na vaga</Link>}
            <PrintButton />
          </span>
        }
      />

      {/* 1–4 · Visão geral */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Visão geral">
        <div className="rounded-[var(--radius-card)] bg-ink p-5 text-white">
          <p className="text-[13px] text-white/70">Nota geral{weighted ? " (pesos da vaga)" : ""}</p>
          <p className="tabular mt-1 text-[44px] leading-none font-extrabold text-brand">{r.overall}</p>
          <p className="mt-1 text-[13px] text-white/80">{r.overallBand}{weighted ? ` · pesos iguais: ${r.overallEqual}` : ""}</p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-black/[0.05] bg-white p-5 shadow-[0_2px_14px_rgba(17,18,22,0.05)]">
          <p className="text-[13px] text-muted">Vaga pretendida</p>
          <p className="mt-1 text-[16px] font-semibold">{jobTitle ?? "Sem vaga específica"}</p>
          <p className="text-[13px] text-muted">Pesos: {r.jobProfile.name}</p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-black/[0.05] bg-white p-5 shadow-[0_2px_14px_rgba(17,18,22,0.05)]">
          <p className="text-[13px] text-muted">Data da avaliação</p>
          <p className="mt-1 text-[16px] font-semibold">{formatDateTime(t.completedAt)}</p>
          <p className="text-[13px] text-muted">Enviado em {formatDate(t.sentAt)}{t.createdBy ? ` por ${t.createdBy.name}` : ""}</p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-black/[0.05] bg-white p-5 shadow-[0_2px_14px_rgba(17,18,22,0.05)]">
          <p className="text-[13px] text-muted">Confiança da análise</p>
          <p className="mt-1 text-[20px] font-bold">{r.confidence.level}</p>
          <p className="text-[12.5px] text-muted">Mede a consistência das respostas, não a qualidade do candidato.</p>
        </div>
      </section>

      {/* IA: estado */}
      <div className="mt-5 print:hidden">
        {!data.ai.configured ? (
          <Alert tone="warning" title="Análise de IA: não conectada">
            As notas, contradições e o índice de confiança abaixo são calculados pelo sistema. Para a análise do Recrutador de IA, cadastre a variável <code>GEMINI_API_KEY</code> na Vercel (Settings → Environment Variables) e faça um novo deploy.
          </Alert>
        ) : pending ? (
          <Alert tone="brand" title="A IA está analisando as respostas">Isso leva até 1 minuto. A página atualiza sozinha.</Alert>
        ) : latest?.status === "FAILED" ? (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft/40 p-4">
            <p className="text-[13.5px]"><strong>A última análise da IA falhou:</strong> {latest.error}{done ? " Abaixo está a última análise concluída." : ""}</p>
            <AnalysisButton testId={t.id} hasAnalysis={false} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4">
            <p className="flex items-center gap-2 text-[13.5px]">
              <AiTag />
              {done ? `Análise v${done.version} gerada em ${formatDateTime(done.completedAt)} (${done.model}).` : "A análise da IA ainda não foi gerada."}
            </p>
            <AnalysisButton testId={t.id} hasAnalysis={!!done} />
          </div>
        )}
      </div>

      {/* 5 · Gráfico */}
      <Panel title="Competências" icon={ChartPolar} className="mt-5">
        <div className="grid items-center gap-6 lg:grid-cols-2">
          <CompetencyRadar data={r.competencies.map((c) => ({ name: c.name, score: c.score }))} />
          <ul className="flex flex-col gap-3">
            {r.competencies.map((c) => (
              <li key={c.key}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[13.5px]">
                  <span className="font-medium">{c.name}{weighted && <span className="ml-1.5 text-[12px] text-muted">peso {c.weight}</span>}</span>
                  <span className="tabular font-semibold">{c.score} <span className="font-normal text-muted">· {c.band}</span></span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full" style={{ width: `${Math.max(c.score, 2)}%`, background: color(c.score) }} /></div>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      {/* 6 · Perfil */}
      <Panel title="Perfil comportamental identificado" icon={UserFocus} className="mt-5">
        {ai ? (
          <>
            <p className="flex items-start gap-2 text-[14.5px] leading-relaxed"><AiTag /> <span>{ai.perfil.sintese}</span></p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {ai.perfil.dimensoes.map((d, i) => (
                <div key={i} className="rounded-lg border border-line p-3.5">
                  <p className="text-[14px] font-semibold">{d.nome}</p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-ink/85">{d.descricao} <Evidence ns={d.evidencias} /></p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[14.5px]">{r.profile}. <span className="text-muted">A descrição detalhada do perfil é feita pela IA.</span></p>
        )}
      </Panel>

      {/* 7 · Análise das 25 respostas */}
      <Panel title="Análise das 25 respostas" icon={ListChecks} className="mt-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="border-b border-line text-[11.5px] tracking-wide text-muted uppercase">
              <tr><th className="py-2 pr-2">Nº</th><th className="px-2 py-2">Competência</th><th className="px-2 py-2">Resposta escolhida</th><th className="px-2 py-2">Interpretação</th><th className="px-2 py-2">Pontos</th><th className="py-2 pl-2">Justificativa</th></tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {r.perQuestion.map((q) => (
                <tr key={q.n}>
                  <td className="py-2.5 pr-2 font-bold tabular">{q.n}</td>
                  <td className="px-2 py-2.5">{nameOf(q.competency)}<span className="block text-[11.5px] text-muted">{q.kind === "self" ? "Autopercepção" : "Situação"}</span></td>
                  <td className="px-2 py-2.5"><span className="block text-[11.5px] text-muted">{q.question}</span><strong>{q.answerLetter})</strong> {q.answer}</td>
                  <td className="px-2 py-2.5">{aiQ.get(q.n) ? <>{aiQ.get(q.n)} <AiTag /></> : q.interpretation}</td>
                  <td className="px-2 py-2.5 whitespace-nowrap tabular"><strong>{q.points}/3</strong>{q.secondary.map((s) => <span key={s.competency} className="block text-[11.5px] text-muted">{nameOf(s.competency)}: {s.points}/3</span>)}</td>
                  <td className="py-2.5 pl-2 text-ink/85">{q.justification}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* 8 · Contradições */}
      <Panel title="Contradições identificadas" icon={Scales} className="mt-5">
        {r.contradictions.length === 0 ? <p className="text-[13.5px] text-muted">Nenhuma contradição entre as respostas relacionadas.</p> : (
          <div className="flex flex-col gap-3">
            {r.contradictions.map((c) => (
              <div key={c.id} className="rounded-lg border border-line p-4">
                <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                  {c.title} <Badge tone={c.severity === "alta" ? "danger" : "warning"}>{c.severity === "alta" ? "Divergência alta" : "Divergência moderada"}</Badge>
                  <span className="text-[12.5px] font-normal text-muted">Competência: {nameOf(c.competency)} · {ev(c.questions)}</span>
                </p>
                <ul className="mt-2 grid gap-1 text-[13px]">{c.compared.map((x) => <li key={x.n}><strong>P{x.n}</strong> ({x.points}/3): {x.answer}</li>)}</ul>
                <p className="mt-2 text-[13px] text-ink/85">{c.why}</p>
                {aiC.get(c.id) && <p className="mt-2 flex items-start gap-2 text-[13px]"><AiTag /> <span>{aiC.get(c.id)}</span></p>}
                <p className="mt-2 rounded-md bg-surface px-3 py-2 text-[13px]"><strong>Pergunta para a entrevista:</strong> {c.interviewQuestion}</p>
              </div>
            ))}
          </div>
        )}
        {(ai?.observacoesAdicionais.length ?? 0) > 0 && (
          <div className="mt-4">
            <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold">Observações da IA <AiTag /></p>
            <ul className="flex flex-col gap-2 text-[13.5px]">{ai!.observacoesAdicionais.map((o, i) => <li key={i}>{o.observacao} <Evidence ns={o.perguntas} /></li>)}</ul>
          </div>
        )}
        <p className="mt-3 text-[12.5px] text-muted">Contradições indicam respostas que apontam em direções diferentes. Podem refletir situações distintas ou outra interpretação da pergunta e não indicam falta de sinceridade.</p>
      </Panel>

      {/* 9–10 · Pontos fortes e de atenção */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Pontos fortes" icon={Lightning}>
          {r.strengths.length === 0 ? <p className="text-[13.5px] text-muted">Nenhuma competência com 80 ou mais.</p> : (
            <ul className="flex flex-col gap-2">
              {r.strengths.map((k) => (
                <li key={k} className="rounded-lg bg-success-soft/60 px-3 py-2.5 text-[13.5px]">
                  <span className="flex items-center justify-between gap-2 font-medium">{nameOf(k)} <Score score={r.competencies.find((c) => c.key === k)!.score} /></span>
                  {aiStrong.get(k) && <span className="mt-1 block text-ink/85">{aiStrong.get(k)!.comentario} <Evidence ns={aiStrong.get(k)!.evidencias} /></span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Pontos de atenção" icon={WarningCircle}>
          {r.attention.length === 0 ? <p className="text-[13.5px] text-muted">Nenhuma competência abaixo de 70.</p> : (
            <ul className="flex flex-col gap-2">
              {r.attention.map((k) => (
                <li key={k} className="rounded-lg bg-warning-soft/70 px-3 py-2.5 text-[13.5px]">
                  <span className="flex items-center justify-between gap-2 font-medium">{nameOf(k)} <Score score={r.competencies.find((c) => c.key === k)!.score} /></span>
                  {aiAttn.get(k) && <span className="mt-1 block text-ink/85">{aiAttn.get(k)!.comentario} <Evidence ns={aiAttn.get(k)!.evidencias} /></span>}
                </li>
              ))}
            </ul>
          )}
          {(ai?.possiveisDificuldades.length ?? 0) > 0 && (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold">Possíveis dificuldades no trabalho <AiTag /></p>
              <ul className="flex flex-col gap-2 text-[13.5px]">
                {ai!.possiveisDificuldades.map((d, i) => <li key={i}><strong>{d.situacao}:</strong> {d.hipotese} <Evidence ns={d.evidencias} /></li>)}
              </ul>
              <p className="mt-2 text-[12px] text-muted">São hipóteses que precisam ser confirmadas na entrevista.</p>
            </div>
          )}
        </Panel>
      </div>

      {/* 11 · Compatibilidade */}
      <Panel title="Compatibilidade com a vaga" icon={Target} className="mt-5">
        <p className="text-[14.5px] font-semibold">
          <Badge tone={r.compatibility.level === "alta" ? "success" : r.compatibility.level === "parcial" ? "warning" : "danger"}>{r.compatibility.level === "alta" ? "Alta" : r.compatibility.level === "parcial" ? "Parcial" : "Baixa"}</Badge>{" "}
          {r.compatibility.label}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[...r.competencies].sort((a, b) => b.weight - a.weight).map((c) => {
            const e = r.essentials.find((x) => x.key === c.key);
            return (
              <div key={c.key} className={cn("rounded-lg border p-3 text-[13px]", e ? (e.met ? "border-success/40" : "border-danger/40") : "border-line")}>
                <p className="font-medium">{c.name}</p>
                <p className="text-muted">Peso {c.weight} · nota {c.score}</p>
                {e && <p className={e.met ? "text-success" : "text-danger"}>Essencial (ref. {e.min}): {e.met ? "atende" : "abaixo"}</p>}
              </div>
            );
          })}
        </div>
        {ai?.compatibilidadeVaga && <p className="mt-3 flex items-start gap-2 text-[13.5px] leading-relaxed"><AiTag /> <span>{ai.compatibilidadeVaga}</span></p>}
        <p className="mt-3 text-[12.5px] text-muted">Pesos definidos para a vaga e congelados no envio do teste. Não é critério automático de aprovação.</p>
      </Panel>

      {/* 12 · Perguntas para a entrevista */}
      <Panel title="Perguntas recomendadas para a entrevista" icon={ChatCircleDots} className="mt-5">
        {deterministicQuestions.length === 0 && !(ai?.perguntasEntrevista.length) ? <p className="text-[13.5px] text-muted">Sem pontos a esclarecer. Use a entrevista para confirmar os pontos fortes com exemplos reais.</p> : (
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-[14px]">
            {deterministicQuestions.map((q, i) => <li key={`d${i}`}>{q.q} <span className="block text-[12.5px] text-muted">{q.why}</span></li>)}
            {(ai?.perguntasEntrevista ?? []).map((q, i) => <li key={`a${i}`}>{q.pergunta} <AiTag /> <span className="block text-[12.5px] text-muted">{nameOf(q.competencia)}: {q.objetivo}</span></li>)}
          </ol>
        )}
      </Panel>

      {/* 13 · Considerações finais */}
      <Panel title="Considerações finais do Recrutador de IA" icon={Brain} className="mt-5">
        {ai ? <p className="text-[14.5px] leading-relaxed">{ai.consideracoesFinais}</p> : (
          <p className="text-[14px] text-muted">
            {`Nota geral ${r.overall} (${r.overallBand.toLowerCase()}). `}
            {r.strengths.length ? `Destaques: ${r.strengths.map(nameOf).join(", ")}. ` : ""}
            {r.attention.length ? `A aprofundar: ${r.attention.map(nameOf).join(", ")}. ` : ""}
            As considerações escritas pela IA aparecem aqui quando a análise for gerada.
          </p>
        )}
      </Panel>

      {/* Confiança */}
      <Panel title="Índice de confiança da análise" icon={Gauge} className="mt-5">
        <p className="text-[14px]"><strong>{r.confidence.level}</strong> <span className="text-muted">({r.confidence.score}/100)</span></p>
        <ul className="mt-2 list-disc pl-5 text-[13.5px]">{r.confidence.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
        <p className="mt-2 text-[12.5px] text-muted">Indica o quanto as respostas permitem uma leitura consistente. Não mede a qualidade do candidato nem detecta mentiras.</p>
      </Panel>

      {/* Revisão humana */}
      <Panel title="Revisão do recrutador" icon={ClipboardText} className="mt-5">
        <ReviewForm testId={t.id} items={reviewItems} initial={{ note: review.note ?? "", items: review.items }}
          reviewedBy={t.reviewedBy ? `${t.reviewedBy.name} em ${formatDateTime(t.reviewedAt)}` : null} />
      </Panel>

      {/* Registro técnico */}
      <Panel title="Registro técnico" icon={TextAlignLeft} className="mt-5">
        <ul className="grid gap-1 text-[13px] sm:grid-cols-2">
          <li>Questionário: <strong>{r.questionnaireVersion}</strong></li>
          <li>Matriz de pontuação: <strong>{r.matrixVersion}</strong></li>
          <li>Pesos: <strong>{r.jobProfile.name}</strong></li>
          <li>Modelo de IA: <strong>{done ? `${done.provider} · ${done.model} · prompt ${done.promptVersion}` : "—"}</strong></li>
        </ul>
        {t.analyses.length > 0 && (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line text-[12.5px]">
            {t.analyses.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span>v{a.version} · {a.status === "COMPLETED" ? "concluída" : a.status === "FAILED" ? `falhou (${a.error})` : "em andamento"}{a.filtered ? ` · ${a.filtered} trecho(s) descartado(s) pela validação` : ""}</span>
                <span className="text-muted">{formatDateTime(a.createdAt)}{a.requestedBy ? ` · ${a.requestedBy.name}` : " · automática"}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="mt-5 flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 text-[13px] text-muted">
        <Info size={18} className="mt-px shrink-0" />
        <p>
          Instrumento auxiliar de seleção. Não é diagnóstico psicológico, não detecta mentiras e não decide contratações. As notas seguem a matriz {r.matrixVersion};
          a IA interpreta as respostas sem alterar as notas e sem receber dados pessoais do candidato. A precisão só pode ser avaliada com acompanhamento das contratações.{" "}
          <Link href="/configuracoes/teste-comportamental" className="underline underline-offset-4 print:hidden">Ver critérios</Link>
        </p>
      </div>
    </>
  );
}
