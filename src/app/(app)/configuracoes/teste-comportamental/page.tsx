import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge, Breadcrumb, Card, CardHeader, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { BANDS, COMPETENCIES, QUESTIONNAIRE_VERSION, QUESTIONS, WEIGHT } from "@/server/modules/behavioral/questionnaire";

export const metadata: Metadata = { title: "Critérios do teste comportamental" };

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
      <PageHeader title="Critérios do teste comportamental" description={`Questionário ${QUESTIONNAIRE_VERSION}: perguntas, pontos de cada alternativa e regras de cálculo. Visível só para o RH.`} />
      <Card className="mb-5">
        <CardHeader title="Como o resultado é calculado" />
        <ul className="flex list-disc flex-col gap-2 p-5 pl-10 text-[14px]">
          <li>Cada alternativa vale de 0 a 3 pontos na competência da pergunta (3 = comportamento mais alinhado ao trabalho; 0 = tende a gerar problema).</li>
          <li>Perguntas de situação têm peso {WEIGHT.situational}; perguntas de autopercepção têm peso {String(WEIGHT.self).replace(".", ",")} (são menos confiáveis).</li>
          <li>Nota da competência (0–100) = pontos ponderados obtidos ÷ pontos ponderados possíveis.</li>
          <li>Indicador geral = média simples das 8 competências (cada competência pesa igual, mesmo com número diferente de perguntas).</li>
          <li>Faixas: {BANDS.map((b) => `${b.min}+ ${b.label}`).join(" · ")}.</li>
          <li>Pontos fortes: até 3 competências com 70 ou mais. Pontos de atenção: competências abaixo de 60 (sem nenhuma, as duas mais baixas abaixo de 80).</li>
          <li>Perfil: as duas competências mais altas ({COMPETENCIES.map((c) => `${c.name} → ${c.trait}`).join("; ")}). Indicador abaixo de 45: &quot;Perfil em desenvolvimento&quot;.</li>
          <li>O candidato nunca vê pontos, competências ou regras. O resultado é gravado na conclusão e não muda depois.</li>
          <li>Para mudar perguntas ou pontos, é criada uma nova versão do questionário; testes antigos continuam com as regras da versão em que foram respondidos.</li>
        </ul>
      </Card>
      {COMPETENCIES.map((c) => (
        <Card key={c.key} className="mb-4">
          <CardHeader title={c.name} description={`Traço no perfil: ${c.trait}`} />
          <ol className="divide-y divide-line">
            {QUESTIONS.filter((q) => q.competency === c.key).map((q) => (
              <li key={q.n} className="p-5">
                <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold">
                  {q.n}. {q.text} <Badge tone={q.kind === "self" ? "neutral" : "dark"}>{q.kind === "self" ? `Autopercepção · peso ${String(WEIGHT.self).replace(".", ",")}` : "Situação · peso 1"}</Badge>
                </p>
                <ul className="mt-2.5 grid gap-1.5 text-[13.5px]">
                  {q.options.map((o, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="tabular mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface text-[12px] font-bold">{o.points}</span>
                      <span>{String.fromCharCode(65 + i)}) {o.text}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </Card>
      ))}
    </>
  );
}
