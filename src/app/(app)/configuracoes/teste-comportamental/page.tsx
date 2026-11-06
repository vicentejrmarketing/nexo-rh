import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge, Breadcrumb, Card, CardHeader, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { COMPETENCIES, QUESTIONNAIRE_VERSION, QUESTIONS } from "@/server/modules/behavioral/questionnaire";
import { BANDS_V2, CONTRADICTION_RULES, JOB_TEMPLATES, MATRIX, MATRIX_VERSION, MATRIX_WEIGHT } from "@/server/modules/behavioral/matrix";
import { PROMPT_VERSION, SYSTEM_PROMPT, aiConfigured, aiModel } from "@/server/modules/behavioral/ai";

export const metadata: Metadata = { title: "Critérios do teste comportamental" };
const nameOf = (k: string) => COMPETENCIES.find((c) => c.key === k)?.name ?? k;
const pt = (n: number) => String(n).replace(".", ",");

export default function CriteriaPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "behavioral.view")) return <NoPermission />;
  return (
    <>
      <Breadcrumb items={[{ href: "/configuracoes", label: "Configurações" }, { label: "Teste comportamental" }]} />
      <PageHeader title="Critérios do teste comportamental" description={`Questionário ${QUESTIONNAIRE_VERSION} · matriz ${MATRIX_VERSION} · prompt da IA ${PROMPT_VERSION}. Visível só para o RH.`} />

      <Card className="mb-5">
        <CardHeader title="Como as notas são calculadas" description="Pelo sistema, de forma fixa. A IA não calcula nem altera notas." />
        <ul className="flex list-disc flex-col gap-2 p-5 pl-10 text-[14px]">
          <li>Cada alternativa vale de 0 a 3 pontos em cada competência que a pergunta avalia (3 = comportamento mais alinhado ao trabalho; 0 = tende a gerar problema).</li>
          <li>Peso dentro da competência: principal de situação {pt(MATRIX_WEIGHT.primarySituational)}; principal de autopercepção {pt(MATRIX_WEIGHT.primarySelf)}; competência secundária {pt(MATRIX_WEIGHT.secondary)}.</li>
          <li>Nota da competência (0–100) = pontos ponderados obtidos ÷ pontos ponderados possíveis.</li>
          <li>Nota geral = média ponderada das 8 competências pelos pesos da vaga (padrão: pesos iguais). O relatório mostra também a nota com pesos iguais.</li>
          <li>Faixas (auxiliares, não aprovam nem reprovam): {BANDS_V2.map((b) => `${b.min}+ ${b.label.toLowerCase()}`).join(" · ")}.</li>
          <li>Pontos fortes: competências com 80 ou mais. Pontos de atenção: abaixo de 70.</li>
          <li>Os pesos da vaga são congelados no envio do teste. Mudanças de pesos ficam no histórico de atividades.</li>
          <li>Índice de confiança (da análise, não do candidato): começa em 100 e desconta contradições (alta −15, moderada −8), autoavaliação muito acima das atitudes (−15), 15+ respostas na mesma posição (−20) e tempo de resposta abaixo de 3 min (−25) ou de 5 min (−10). Alta ≥ 75 · Moderada 50–74 · Baixa &lt; 50.</li>
        </ul>
      </Card>

      <Card className="mb-5">
        <CardHeader title="Contradições verificadas" description="Compara a média de pontos das perguntas relacionadas. Diferença ≥ 1,5 = moderada; ≥ 2,5 = alta. Nunca é tratada como mentira." />
        <ul className="divide-y divide-line">
          {CONTRADICTION_RULES.map((r) => (
            <li key={r.id} className="p-5 text-[13.5px]">
              <p className="font-semibold">{r.title} <span className="font-normal text-muted">· {nameOf(r.competency)} · P{r.a.join(", P")} × P{r.b.join(", P")}</span></p>
              <p className="mt-1 text-muted">Pergunta sugerida: {r.interviewQuestion}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mb-5">
        <CardHeader title="Modelos de pesos por vaga" description="Configurados em cada vaga, no botão Perfil comportamental." />
        <div className="overflow-x-auto p-5">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="text-[11.5px] tracking-wide text-muted uppercase"><tr><th className="py-2">Modelo</th>{COMPETENCIES.map((c) => <th key={c.key} className="px-2 py-2 text-center">{c.name}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {JOB_TEMPLATES.map((t) => (
                <tr key={t.key}><td className="py-2 font-medium">{t.name}</td>{COMPETENCIES.map((c) => <td key={c.key} className="px-2 py-2 text-center tabular">{t.weights[c.key]}{t.essentials.some((e) => e.key === c.key) ? " ★" : ""}</td>)}</tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[12px] text-muted">★ competência essencial (referência 70).</p>
        </div>
      </Card>

      <Card className="mb-5">
        <CardHeader title="Recrutador de IA" description={aiConfigured() ? `Conectado: Google Gemini · ${aiModel()}` : "Não conectado: cadastre GEMINI_API_KEY na Vercel."} />
        <div className="flex flex-col gap-2 p-5 text-[13.5px]">
          <p>Enviado à IA: cargo da vaga, pesos, as 25 perguntas com a alternativa escolhida, as notas calculadas, as contradições e o índice de confiança. <strong>Não são enviados</strong> nome, CPF, contatos, raça, idade, gênero nem endereço.</p>
          <p>A resposta é validada: frases com notas que não existem no cálculo, acusações de mentira, diagnósticos ou características protegidas são descartadas; pontos fortes e de atenção só valem para as competências indicadas pelo cálculo.</p>
          <p>Mesma entrada, mesmo modelo e mesmo prompt reaproveitam a análise guardada. &quot;Reanalisar&quot; cria uma nova versão e mantém as anteriores.</p>
          <details className="mt-1"><summary className="cursor-pointer font-medium">Instruções dadas à IA ({PROMPT_VERSION})</summary><pre className="mt-2 rounded-lg bg-surface p-3 text-[12px] whitespace-pre-wrap">{SYSTEM_PROMPT}</pre></details>
        </div>
      </Card>

      {COMPETENCIES.map((c) => (
        <Card key={c.key} className="mb-4">
          <CardHeader title={c.name} description={`Traço no perfil: ${c.trait}`} />
          <ol className="divide-y divide-line">
            {QUESTIONS.filter((q) => q.competency === c.key).map((q) => {
              const m = MATRIX[q.n - 1];
              return (
                <li key={q.n} className="p-5">
                  <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold">
                    {q.n}. {q.text} <Badge tone={q.kind === "self" ? "neutral" : "dark"}>{q.kind === "self" ? "Autopercepção" : "Situação"}</Badge>
                  </p>
                  {m.secondary.length > 0 && <p className="mt-1 text-[12.5px] text-muted">Também avalia: {m.secondary.map((s) => nameOf(s.competency)).join(", ")} (peso {pt(MATRIX_WEIGHT.secondary)})</p>}
                  <ul className="mt-2.5 grid gap-1.5 text-[13.5px]">
                    {q.options.map((o, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="tabular mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-surface px-1 text-[12px] font-bold">{o.points}</span>
                        <span>{String.fromCharCode(65 + i)}) {o.text}{m.secondary.length > 0 && <span className="text-[12px] text-muted"> · {m.secondary.map((s) => `${nameOf(s.competency)} ${s.points[i]}`).join(" · ")}</span>}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        </Card>
      ))}
    </>
  );
}
