import type { Metadata } from "next";
import { Suspense } from "react";
import { ChartBar, ChartPieSlice, ClockCounterClockwise, Funnel as FunnelIcon, UsersThree } from "@phosphor-icons/react/ssr";
import { Alert, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PerformanceChart } from "@/components/dashboard/performance-chart";
import { DashboardFilter, ParamSelect } from "@/components/dashboard/filters";
import { ActivityList, FollowUpTable, FootprintBanner, Funnel, JobsDonut, Panel, SeeAll, StoreBarLabels, StoreBars } from "@/components/dashboard/widgets";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import {
  getFilterOptions, getFollowUps, getFootprint, getFunnel, getJobsByStatus, getKpis, getPerformance, getRecentActivity, getStoreRanking,
} from "@/server/modules/dashboard/service";
import { greetingSP, resolvePeriod } from "@/lib/period";

export const metadata: Metadata = { title: "Visão Geral" };

type SP = PageProps<"/visao-geral">["searchParams"];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function OverviewPage({ searchParams }: PageProps<"/visao-geral">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: { searchParams: SP }) {
  const actor = await requirePageActor();
  if (!can(actor, "dashboard.view")) return <NoPermission />;
  const sp = await searchParams;

  const period = resolvePeriod(one(sp.periodo), { de: one(sp.de), ate: one(sp.ate) });
  const filters = { storeId: one(sp.loja), recruiterId: one(sp.recrutador) };
  const chartDays = ["7", "30", "90"].includes(one(sp.grafico) ?? "") ? Number(one(sp.grafico)) : 30;
  const topStores = one(sp.lojas) === "10" ? 10 : 5;

  const [options, kpis, performance, funnel, jobs, storeRanking, activity, followUps, footprint] = await Promise.all([
    getFilterOptions(actor),
    getKpis(actor, period, filters),
    getPerformance(actor, chartDays, filters),
    getFunnel(actor, null, filters),
    getJobsByStatus(actor, filters),
    getStoreRanking(actor, period, filters, topStores),
    getRecentActivity(actor, 5),
    getFollowUps(actor, filters, 5),
    getFootprint(actor),
  ]);

  const firstName = actor.name.split(" ").slice(0, 2).join(" ");
  const subtitle = period.key === "hoje" ? "Confira o resumo do seu recrutamento de hoje" : `Confira o resumo do seu recrutamento · ${period.label.toLowerCase()}`;

  return (
    <>
      <PageHeader
        title={
          <>
            {greetingSP()}, {firstName}! <span aria-hidden="true">👋</span>
          </>
        }
        description={subtitle}
        actions={<DashboardFilter label={period.label} stores={options.stores} recruiters={options.recruiters} />}
      />
      {sp.senha === "alterada" && (
        <div className="mb-5">
          <Alert tone="success">Senha alterada. As suas outras sessões foram encerradas.</Alert>
        </div>
      )}

      {/* Quatro cartões como na referência; as contratações aparecem no gráfico de desempenho e no funil. */}
      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.filter((k) => k.key !== "hired").map((k) => (
          <KpiCard key={k.key} kpi={k} />
        ))}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <Panel
          title="Desempenho Geral"
          icon={ChartBar}
          action={<ParamSelect param="grafico" label="Período do gráfico" value={String(chartDays)} options={[["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"]]} />}
        >
          <PerformanceChart data={performance} />
        </Panel>
        <Panel title="Funil de Recrutamento" icon={FunnelIcon}>
          <Funnel rows={funnel} />
          <p className="mt-3 text-[12px] text-muted">Processos que chegaram a cada etapa, em relação aos inscritos.</p>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-[0.8fr_1fr_1.05fr]">
        <Panel title="Vagas por Status" icon={ChartPieSlice}>
          <JobsDonut {...jobs} />
        </Panel>
        <Panel
          title="Desempenho por Loja"
          icon={ChartBar}
          action={<ParamSelect param="lojas" label="Quantidade de lojas" value={String(topStores)} options={[["5", "Top 5"], ["10", "Top 10"]]} />}
        >
          <StoreBars rows={storeRanking} />
          {storeRanking.length > 0 && <StoreBarLabels rows={storeRanking} />}
          <p className="mt-2 text-[12px] text-muted">Contratações no período · {period.label.toLowerCase()}</p>
        </Panel>
        <Panel
          title="Atividades Recentes"
          icon={ClockCounterClockwise}
          className="border-brand/20 bg-brand-soft lg:col-span-2 xl:col-span-1"
          action={can(actor, "audit.view") ? <SeeAll href="/configuracoes/auditoria">Ver todas</SeeAll> : undefined}
        >
          <ActivityList items={activity} />
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.75fr_1fr]">
        <Panel title="Candidatos em Acompanhamento" icon={UsersThree} action={<SeeAll href="/candidatos">Ver todos os candidatos</SeeAll>}>
          <FollowUpTable rows={followUps} canEdit={can(actor, "candidates.update")} />
        </Panel>
        <FootprintBanner {...footprint} />
      </div>
    </>
  );
}
