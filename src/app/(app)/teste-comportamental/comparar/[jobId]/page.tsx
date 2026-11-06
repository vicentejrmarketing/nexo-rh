import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Breadcrumb, Card, CardHeader, EmptyState, PageHeader, PageSkeleton, buttonClass } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { notFoundCard } from "@/components/layout/not-found-card";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { compareForJob } from "@/server/modules/behavioral/service";
import { COMPETENCIES } from "@/server/modules/behavioral/questionnaire";
import { bandV2 } from "@/server/modules/behavioral/matrix";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Comparar candidatos" };

export default function ComparePage({ params }: PageProps<"/teste-comportamental/comparar/[jobId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

const cell = (s: number) => {
  const t = bandV2(s).tone;
  return t === "success" ? "bg-success-soft text-success" : t === "brand" ? "bg-brand-soft" : t === "warning" ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger";
};
const nameOf = (k: string) => COMPETENCIES.find((c) => c.key === k)?.name ?? k;

async function Content({ params }: { params: PageProps<"/teste-comportamental/comparar/[jobId]">["params"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "behavioral.view")) return <NoPermission />;
  const { jobId } = await params;
  const data = await compareForJob(actor, jobId).catch(() => null);
  if (!data) return notFoundCard("Vaga não encontrada", "/teste-comportamental", "Voltar para os testes");
  return (
    <>
      <Breadcrumb items={[{ href: "/teste-comportamental", label: "Teste Comportamental" }, { label: `Comparar · ${data.job.title}` }]} />
      <PageHeader
        title="Comparar candidatos da vaga"
        description={`${data.job.title} · ${data.job.store.name}. Só aparecem juntos candidatos avaliados com os mesmos pesos.`}
        actions={<Link href={`/vagas/${data.job.id}/perfil-comportamental`} className={buttonClass("secondary")}>Pesos da vaga</Link>}
      />
      {data.groups.length === 0 ? (
        <Card><EmptyState title="Nenhum teste respondido nesta vaga">Quando os candidatos desta vaga responderem, eles aparecem aqui lado a lado.</EmptyState></Card>
      ) : data.groups.map((g, gi) => (
        <Card key={gi} className="mb-5 min-w-0">
          <CardHeader title={`Pesos: ${g.profile.name}`} description={`${g.rows.length} candidato(s). ${g.profile.essentials.length ? `Essenciais: ${g.profile.essentials.map((e) => `${nameOf(e.key)} (${e.min})`).join(", ")}.` : "Sem competências essenciais."}`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-[13px]">
              <thead className="border-b border-line text-[11.5px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-5 py-2.5">Candidato</th>
                  <th className="px-2 py-2.5">Geral</th>
                  {COMPETENCIES.map((c) => <th key={c.key} className="px-2 py-2.5 text-center">{c.name}<span className="block normal-case">peso {g.profile.weights[c.key]}</span></th>)}
                  <th className="px-2 py-2.5">Compatibilidade</th>
                  <th className="px-2 py-2.5">Confiança</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {g.rows.map((x) => (
                  <tr key={x.id} className="align-top">
                    <td className="px-5 py-3"><span className="font-semibold">{x.candidate.fullName}</span><span className="block text-[12px] text-muted">{formatDate(x.completedAt)}</span>
                      <span className="mt-1 block text-[12px]"><span className="text-success">+ {x.r.strengths.map(nameOf).join(", ") || "—"}</span><br /><span className="text-warning">! {x.r.attention.map(nameOf).join(", ") || "—"}</span></span>
                    </td>
                    <td className="px-2 py-3"><span className={`tabular inline-flex rounded-md px-2 py-1 font-bold ${cell(x.r.overall)}`}>{x.r.overall}</span></td>
                    {x.r.competencies.map((c) => <td key={c.key} className="px-2 py-3 text-center"><span className={`tabular inline-flex rounded-md px-2 py-1 font-semibold ${cell(c.score)}`}>{c.score}</span></td>)}
                    <td className="px-2 py-3"><Badge tone={x.r.compatibility.level === "alta" ? "success" : x.r.compatibility.level === "parcial" ? "warning" : "danger"}>{x.r.compatibility.level === "alta" ? "Alta" : x.r.compatibility.level === "parcial" ? "Parcial" : "Baixa"}</Badge>
                      {x.r.essentials.filter((e) => !e.met).length > 0 && <span className="mt-1 block text-[12px] text-danger">Abaixo: {x.r.essentials.filter((e) => !e.met).map((e) => nameOf(e.key)).join(", ")}</span>}
                    </td>
                    <td className="px-2 py-3">{x.r.confidence.level}{x.r.contradictions.length > 0 && <span className="block text-[12px] text-muted">{x.r.contradictions.length} contradição(ões)</span>}</td>
                    <td className="px-5 py-3 text-right"><Link href={`/teste-comportamental/${x.id}`} className={buttonClass("secondary", "sm")}>Relatório</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      <p className="text-[12.5px] text-muted">Use a comparação junto com as entrevistas: a nota geral sozinha não define o melhor candidato.</p>
    </>
  );
}
