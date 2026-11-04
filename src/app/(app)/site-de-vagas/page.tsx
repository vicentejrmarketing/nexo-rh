import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowSquareOut, Globe, ShieldCheck, UserPlus } from "@phosphor-icons/react/ssr";
import { Alert, Badge, Card, EmptyState, PageHeader, PageSkeleton, buttonClass } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { Panel } from "@/components/dashboard/widgets";
import { StagePill } from "@/components/recruitment/stage-pill";
import { CopyJobLink, PublishToggle } from "@/components/portal/site-controls";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { canEditJob } from "@/server/authz/scopes";
import { JOB_STATUS_LABEL } from "@/server/modules/jobs/service";
import { openPrivacyRequests, recentSiteApplications, siteOverview } from "@/server/modules/portal/admin";
import { storageReady } from "@/server/storage";
import { formatDateTime } from "@/lib/format";
import { formatMoneyBR } from "@/lib/form";

export const metadata: Metadata = { title: "Site de vagas" };

export default function SitePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-black/[0.05] bg-white px-5 py-4 shadow-[0_2px_14px_rgba(17,18,22,0.05)]">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="tabular mt-1 text-[26px] leading-none font-bold">{value}</p>
      {hint && <p className="mt-1 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

const STATUS_HINT: Record<string, string> = {
  DRAFT: "Rascunho: publique a vaga para aparecer",
  PAUSED: "Pausada: não aceita inscrições",
  CLOSED: "Encerrada: não aceita inscrições",
};

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "jobs.view")) return <NoPermission />;
  const [{ rows, stats }, recent, privacyOpen] = await Promise.all([
    siteOverview(actor),
    can(actor, "candidates.view") ? recentSiteApplications(actor) : Promise.resolve([]),
    openPrivacyRequests(actor),
  ]);
  const canUpdate = can(actor, "jobs.update");

  return (
    <>
      <PageHeader
        title="Site de vagas"
        description="O que os candidatos veem em Trabalhe conosco, e as inscrições que chegam por lá."
        actions={<a href="/trabalhe-conosco" target="_blank" rel="noopener" className={buttonClass("primary")}><Globe size={18} weight="fill" /> Ver site</a>}
      />
      {!storageReady() && <div className="mb-5"><Alert tone="warning" title="Inscrições indisponíveis">O armazenamento de currículos não está configurado; o site mostra as vagas, mas não aceita envios.</Alert></div>}
      {privacyOpen > 0 && (
        <div className="mb-5">
          <Alert tone="brand" title={`${privacyOpen} pedido(s) de exclusão de dados aguardando`}>
            <Link href="/site-de-vagas/privacidade" className="font-semibold underline underline-offset-4">Tratar pedidos (LGPD)</Link>
          </Alert>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Indicadores do site">
        <Stat label="Vagas no ar" value={stats.live} hint="abertas e publicadas" />
        <Stat label="Inscrições pelo site" value={stats.total} hint="nas vagas listadas abaixo" />
        <Stat label="Últimos 7 dias" value={stats.week} />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card className="min-w-0">
          <div className="border-b border-line px-5 py-4">
            <p className="font-semibold">Publicação das vagas</p>
            <p className="text-[13px] text-muted">Só aparecem no site as vagas <strong>abertas</strong> e marcadas como <strong>No site</strong>.</p>
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={<Globe size={20} weight="fill" />} title="Nenhuma vaga ainda" action={can(actor, "jobs.create") ? <Link href="/vagas/nova" className={buttonClass("primary")}>Criar vaga</Link> : undefined}>
              As vagas cadastradas aparecem aqui para você publicar no site.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-line text-[12px] tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-5 py-3 font-medium">Vaga</th>
                    <th className="px-5 py-3 font-medium">No site</th>
                    <th className="px-5 py-3 text-right font-medium">Inscrições</th>
                    <th className="px-5 py-3 font-medium"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((j) => (
                    <tr key={j.id} className="hover:bg-surface/60">
                      <td className="px-5 py-3">
                        <Link href={`/vagas/${j.id}`} className="font-semibold hover:underline">{j.title}</Link>
                        <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                          {j.store.name}
                          {j.live ? <Badge tone="success">No ar</Badge> : <Badge>{STATUS_HINT[j.status] ?? (j.store.status !== "ACTIVE" ? "Loja inativa" : JOB_STATUS_LABEL[j.status])}</Badge>}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        {canUpdate && canEditJob(actor, j) ? <PublishToggle jobId={j.id} published={j.publishedOnline} /> : <span className="text-[13px] text-muted">{j.publishedOnline ? "Sim" : "Não"}</span>}
                      </td>
                      <td className="tabular px-5 py-3 text-right">
                        <span className="font-semibold">{j.siteApplications}</span>
                        {j.siteApplications7 > 0 && <span className="block text-[11.5px] text-success">+{j.siteApplications7} em 7 dias</span>}
                      </td>
                      <td className="px-5 py-3">
                        {j.publishedOnline && j.status !== "DRAFT" && (
                          <span className="flex justify-end gap-2">
                            <CopyJobLink slug={j.slug} />
                            <a href={`/trabalhe-conosco/vagas/${j.slug}`} target="_blank" rel="noopener" className={buttonClass("ghost", "sm")} aria-label={`Ver ${j.title} no site`}><ArrowSquareOut size={16} /></a>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Inscrições recentes pelo site" icon={UserPlus}>
            {recent.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted">Nenhuma inscrição pelo site ainda.</p>
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((r) => (
                  <li key={r.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/candidatos/${r.candidate.id}`} className="truncate text-[14px] font-medium hover:underline">{r.candidate.fullName}</Link>
                      <StagePill stageKey={r.stage.key} name={r.stage.name} />
                    </div>
                    <p className="truncate text-[12px] text-muted">
                      {r.job.title} · {formatDateTime(r.appliedAt)}
                      {r.salaryExpectation ? ` · pretensão R$ ${formatMoneyBR(String(r.salaryExpectation))}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {can(actor, "privacy.manage") && (
            <Panel title="LGPD" icon={ShieldCheck}>
              <p className="text-[13px] text-muted">Pedidos de exclusão de dados feitos pelo site.</p>
              <Link href="/site-de-vagas/privacidade" className={`${buttonClass("secondary", "sm")} mt-3`}>Ver pedidos {privacyOpen ? `(${privacyOpen})` : ""}</Link>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
