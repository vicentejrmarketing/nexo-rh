import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Suspense } from "react";
import { Brain, CheckCircle, HourglassMedium, MagnifyingGlass, PaperPlaneTilt } from "@phosphor-icons/react/ssr";
import { Badge, Card, EmptyState, Input, PageHeader, PageSkeleton, buttonClass, cn } from "@/components/ui";
import { Pagination } from "@/components/ui/pagination";
import { NoPermission } from "@/components/layout/states";
import { GenerateTestButton } from "@/components/behavioral/generate-dialog";
import { TestStatusBadge, ScoreBadge } from "@/components/behavioral/badges";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { TEST_STATUS_LABEL, listTests } from "@/server/modules/behavioral/service";
import { getCompanySettings } from "@/server/modules/settings/service";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Teste Comportamental" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function BehavioralPage({ searchParams }: PageProps<"/teste-comportamental">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

function Stat({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Brain; tone: string }) {
  return (
    <div className="flex items-center gap-4 rounded-[var(--radius-card)] border border-black/[0.05] bg-white px-5 py-4 shadow-[0_2px_14px_rgba(17,18,22,0.05)]">
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tone)}><Icon size={22} weight="fill" /></span>
      <div>
        <p className="text-[13px] text-muted">{label}</p>
        <p className="tabular text-[26px] leading-none font-bold">{value.toLocaleString("pt-BR")}</p>
      </div>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/teste-comportamental">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "behavioral.send")) return <NoPermission />;
  const sp = await searchParams;
  const params = { q: one(sp.q), situacao: one(sp.situacao) };
  const [res, settings, h] = await Promise.all([
    listTests(actor, { q: params.q, status: params.situacao, page: Number(one(sp.pagina)) || 1 }),
    getCompanySettings(),
    headers(),
  ]);
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
  const filtered = Object.values(params).some(Boolean);
  const chips = [["", "Todos"], ["SENT", "Aguardando"], ["COMPLETED", "Respondidos"], ["EXPIRED", "Vencidos"], ["CANCELED", "Substituídos"]] as const;
  const chipHref = (k: string) => {
    const q = new URLSearchParams(Object.entries({ ...params, situacao: k }).filter(([, v]) => v) as [string, string][]);
    return `/teste-comportamental${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Teste Comportamental" description="Avaliação comportamental de candidatos." actions={<GenerateTestButton origin={origin} company={settings.companyName} />} />
      <section className="mb-5 grid gap-4 sm:grid-cols-3" aria-label="Indicadores">
        <Stat label="Testes enviados" value={res.stats.sent} icon={PaperPlaneTilt} tone="bg-ink text-brand" />
        <Stat label="Testes respondidos" value={res.stats.completed} icon={CheckCircle} tone="bg-success-soft text-success" />
        <Stat label="Aguardando resposta" value={res.stats.waiting} icon={HourglassMedium} tone="bg-brand-soft text-ink" />
      </section>

      <Card className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <form className="relative min-w-[220px] flex-1" role="search" action="/teste-comportamental">
            {params.situacao && <input type="hidden" name="situacao" value={params.situacao} />}
            <MagnifyingGlass size={17} className="pointer-events-none absolute top-3 left-3 text-muted" />
            <Input name="q" defaultValue={params.q} placeholder="Buscar por nome ou CPF" aria-label="Buscar candidato" className="pl-9" />
          </form>
          <nav className="flex flex-wrap gap-1.5" aria-label="Status">
            {chips.map(([k, label]) => {
              const active = (params.situacao ?? "") === k;
              return (
                <Link key={k} href={chipHref(k)} aria-current={active ? "page" : undefined}
                  className={cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-medium", active ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink/40")}>
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        {res.rows.length === 0 ? (
          <EmptyState icon={<Brain size={20} weight="fill" />} title={filtered ? "Nenhum teste com esses filtros" : "Nenhum teste enviado ainda"}>
            {filtered ? <Link href="/teste-comportamental" className={buttonClass("ghost", "sm")}>Limpar filtros</Link> : "Clique em GERAR TESTE, escolha o candidato e envie o link."}
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-line text-[12px] tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-5 py-3 font-medium">Candidato</th>
                    <th className="px-3 py-3 font-medium">Vaga pretendida</th>
                    <th className="px-3 py-3 font-medium">Envio</th>
                    <th className="px-3 py-3 font-medium">Conclusão</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Resultado</th>
                    <th className="px-5 py-3 text-right font-medium"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {res.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-surface/60">
                      <td className="px-5 py-3">
                        <Link href={`/candidatos/${r.candidate.id}`} className="font-semibold hover:underline">{r.candidate.fullName}</Link>
                        {r.createdBy && <p className="text-[12px] text-muted">Enviado por {r.createdBy.name}</p>}
                      </td>
                      <td className="px-3 py-3">{r.candidateJob ? <>{r.candidateJob.job.title}<p className="text-[12px] text-muted">{r.candidateJob.job.store.name}</p></> : <span className="text-muted">—</span>}</td>
                      <td className="px-3 py-3 tabular">{formatDate(r.sentAt)}</td>
                      <td className="px-3 py-3 tabular">{r.completedAt ? formatDateTime(r.completedAt) : "—"}</td>
                      <td className="px-3 py-3"><TestStatusBadge state={r.state} /></td>
                      <td className="px-3 py-3">
                        {r.state !== "COMPLETED" ? <span className="text-muted">—</span>
                          : res.showResult && r.overall !== null ? <span className="flex flex-col items-start gap-0.5"><ScoreBadge score={r.overall} /><span className="text-[12px] text-muted">{r.profile}</span></span>
                          : <Badge>Restrito ao RH</Badge>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {r.state === "COMPLETED" && res.showResult && <Link href={`/teste-comportamental/${r.id}`} className={buttonClass("secondary", "sm")}>Ver relatório</Link>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={res.page} pageCount={res.pages} total={res.total} params={params} basePath="/teste-comportamental" noun="teste(s)" />
          </>
        )}
      </Card>
      <p className="mt-3 text-[12.5px] text-muted">
        Status: {Object.values(TEST_STATUS_LABEL).join(" · ")}. O resultado é um apoio à seleção, não um diagnóstico psicológico.{" "}
        {can(actor, "behavioral.view") && <Link href="/configuracoes/teste-comportamental" className="underline underline-offset-4">Ver perguntas e critérios</Link>}
      </p>
    </>
  );
}
