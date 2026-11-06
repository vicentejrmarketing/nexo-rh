import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChartPolar, ChatCircleDots, Info, Lightning, TextAlignLeft, WarningCircle } from "@phosphor-icons/react/ssr";
import { Alert, Breadcrumb, PageHeader, PageSkeleton, buttonClass } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { notFoundCard } from "@/components/layout/not-found-card";
import { Panel } from "@/components/dashboard/widgets";
import { CompetencyRadar, PrintButton } from "@/components/behavioral/chart";
import { ScoreBadge, TestStatusBadge, scoreBand } from "@/components/behavioral/badges";
import { requirePageActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { can } from "@/server/authz/authorize";
import { getReport } from "@/server/modules/behavioral/service";
import { COMPETENCIES } from "@/server/modules/behavioral/questionnaire";
import { buildAnalysis, interviewSuggestions } from "@/server/modules/behavioral/scoring";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Relatório comportamental" };

export default function ReportPage({ params }: PageProps<"/teste-comportamental/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

const nameOf = (k: string) => COMPETENCIES.find((c) => c.key === k)?.name ?? k;

async function Content({ params }: { params: PageProps<"/teste-comportamental/[id]">["params"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "behavioral.view")) return <NoPermission />;
  const { id } = await params;
  const { ip } = await clientInfo();
  const data = await getReport(actor, id, ip).catch(() => null);
  if (!data) return notFoundCard("Teste não encontrado", "/teste-comportamental", "Voltar para os testes");
  const { test: t, state, result, answers } = data;
  const firstName = t.candidate.fullName.split(" ")[0];
  const crumbs = [{ href: "/teste-comportamental", label: "Teste Comportamental" }, { label: t.candidate.fullName }];

  if (state !== "COMPLETED" || !result || !answers) {
    return (
      <>
        <Breadcrumb items={crumbs} />
        <PageHeader title={t.candidate.fullName} description={<span className="flex items-center gap-2">Enviado em {formatDate(t.sentAt)} <TestStatusBadge state={state} /></span>} />
        <Alert tone="brand">O relatório fica disponível assim que o candidato concluir o teste.</Alert>
      </>
    );
  }

  const analysis = buildAnalysis(firstName, answers, result);
  const suggestions = interviewSuggestions(result);
  const ranked = [...result.competencies].sort((a, b) => b.score - a.score);

  return (
    <>
      <div className="print:hidden"><Breadcrumb items={crumbs} /></div>
      <PageHeader
        title="Relatório comportamental"
        description={`${t.candidate.fullName}${t.candidateJob ? ` · ${t.candidateJob.job.title} (${t.candidateJob.job.store.name})` : ""}`}
        actions={<span className="flex gap-2 print:hidden"><Link href={`/candidatos/${t.candidate.id}`} className={buttonClass("secondary")}>Ficha do candidato</Link><PrintButton /></span>}
      />

      {/* A. Visão geral */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Visão geral">
        <div className="rounded-[var(--radius-card)] bg-ink p-5 text-white">
          <p className="text-[13px] text-white/70">Indicador geral</p>
          <p className="tabular mt-1 text-[44px] leading-none font-extrabold text-brand">{result.overall}</p>
          <p className="mt-1 text-[13px] text-white/80">{scoreBand(result.overall).label} · escala de 0 a 100</p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-black/[0.05] bg-white p-5 shadow-[0_2px_14px_rgba(17,18,22,0.05)]">
          <p className="text-[13px] text-muted">Perfil identificado</p>
          <p className="mt-1 text-[20px] leading-tight font-bold">{result.profile}</p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-black/[0.05] bg-white p-5 shadow-[0_2px_14px_rgba(17,18,22,0.05)]">
          <p className="text-[13px] text-muted">Vaga pretendida</p>
          <p className="mt-1 text-[16px] font-semibold">{t.candidateJob?.job.title ?? "Sem vaga específica"}</p>
          {t.candidateJob && <p className="text-[13px] text-muted">{t.candidateJob.job.store.name}</p>}
        </div>
        <div className="rounded-[var(--radius-card)] border border-black/[0.05] bg-white p-5 shadow-[0_2px_14px_rgba(17,18,22,0.05)]">
          <p className="text-[13px] text-muted">Realizado em</p>
          <p className="mt-1 text-[16px] font-semibold">{formatDateTime(t.completedAt)}</p>
          <p className="text-[13px] text-muted">Enviado em {formatDate(t.sentAt)}{t.createdBy ? ` por ${t.createdBy.name}` : ""}</p>
        </div>
      </section>

      {/* B. Gráfico */}
      <Panel title="Competências" icon={ChartPolar} className="mt-5">
        <div className="grid items-center gap-6 lg:grid-cols-[1fr_1fr]">
          <CompetencyRadar data={result.competencies.map((c) => ({ name: c.name, score: c.score }))} />
          <ul className="flex flex-col gap-3">
            {result.competencies.map((c) => {
              const b = scoreBand(c.score);
              return (
                <li key={c.key}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[13.5px]">
                    <span className="font-medium">{c.name}</span>
                    <span className="tabular font-semibold">{c.score} <span className="font-normal text-muted">· {b.label}</span></span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface" role="presentation">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(c.score, 2)}%`, background: b.color }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* C. Pontos fortes */}
        <Panel title="Pontos fortes" icon={Lightning}>
          {result.strengths.length === 0 ? <p className="text-[13.5px] text-muted">Nenhuma competência atingiu 70 pontos.</p> : (
            <ul className="flex flex-col gap-2">
              {result.strengths.map((k) => {
                const c = result.competencies.find((x) => x.key === k)!;
                return <li key={k} className="flex items-center justify-between gap-2 rounded-lg bg-success-soft/60 px-3 py-2.5 text-[14px]"><span className="font-medium">{c.name}</span><ScoreBadge score={c.score} /></li>;
              })}
            </ul>
          )}
        </Panel>
        {/* D. Pontos de atenção */}
        <Panel title="Pontos de atenção" icon={WarningCircle}>
          {result.attention.length === 0 ? <p className="text-[13.5px] text-muted">Nenhuma competência em faixa de atenção.</p> : (
            <ul className="flex flex-col gap-2">
              {result.attention.map((k) => {
                const c = result.competencies.find((x) => x.key === k)!;
                return <li key={k} className="flex items-center justify-between gap-2 rounded-lg bg-warning-soft/70 px-3 py-2.5 text-[14px]"><span className="font-medium">{c.name}</span><ScoreBadge score={c.score} /></li>;
              })}
            </ul>
          )}
          <p className="mt-3 text-[12.5px] text-muted">Competências para investigar melhor na entrevista.</p>
        </Panel>
      </div>

      {/* E. Análise */}
      <Panel title="Análise comportamental" icon={TextAlignLeft} className="mt-5">
        <p className="text-[14.5px] leading-relaxed">{analysis.intro}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {ranked.map((r) => {
            const c = analysis.byCompetency.find((x) => x.key === r.key)!;
            return (
              <div key={c.key} className="rounded-lg border border-line p-3.5">
                <p className="flex items-center justify-between gap-2 text-[14px] font-semibold">{c.name} <ScoreBadge score={c.score} /></p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink/85">{c.text}</p>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* F. Sugestões */}
      <Panel title="Sugestões para a entrevista" icon={ChatCircleDots} className="mt-5">
        {suggestions.length === 0 ? <p className="text-[13.5px] text-muted">Sem pontos de atenção. Use a entrevista para confirmar os pontos fortes com exemplos reais.</p> : (
          <div className="grid gap-4 md:grid-cols-2">
            {suggestions.map((s) => (
              <div key={s.key}>
                <p className="mb-1.5 text-[13px] font-semibold tracking-wide text-muted uppercase">{nameOf(s.key)}</p>
                <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[14px]">{s.questions.map((q) => <li key={q}>{q}</li>)}</ol>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="mt-5 flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 text-[13px] text-muted">
        <Info size={18} className="mt-px shrink-0" />
        <p>
          Instrumento auxiliar de seleção. Não é diagnóstico psicológico nem decisão automática de contratação. As notas refletem as respostas do candidato
          ao questionário {result.version} e devem ser confirmadas na entrevista.{" "}
          <Link href="/configuracoes/teste-comportamental" className="underline underline-offset-4 print:hidden">Ver critérios</Link>
        </p>
      </div>
    </>
  );
}
