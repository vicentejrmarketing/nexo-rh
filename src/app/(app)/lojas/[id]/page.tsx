import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Briefcase, CalendarDots, ClockCounterClockwise, PencilSimple, Plus, UserCheck, UsersThree } from "@phosphor-icons/react/ssr";
import { Alert, Badge, Breadcrumb, PageHeader, PageSkeleton, buttonClass } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { notFoundCard } from "@/components/layout/not-found-card";
import { Panel } from "@/components/dashboard/widgets";
import { StagePill } from "@/components/recruitment/stage-pill";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { getStore } from "@/server/modules/stores/service";
import { PRIORITY_LABEL, JOB_STATUS_LABEL } from "@/server/modules/jobs/service";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Loja" };

export default function StorePage({ params, searchParams }: PageProps<"/lojas/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} searchParams={searchParams} />
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

async function Content({ params, searchParams }: { params: PageProps<"/lojas/[id]">["params"]; searchParams: PageProps<"/lojas/[id]">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "stores.view")) return <NoPermission />;
  const { id } = await params;
  const sp = await searchParams;
  const data = await getStore(actor, id).catch(() => null);
  if (!data) return notFoundCard("Loja não encontrada", "/lojas", "Voltar para lojas");
  const { store, stats } = data;

  return (
    <>
      <Breadcrumb items={[{ href: "/lojas", label: "Lojas" }, { label: store.name }]} />
      <PageHeader
        title={store.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {store.city}/{store.state}
            {store.address ? ` · ${store.address}` : ""}
            {store.status === "ACTIVE" ? <Badge tone="success">Ativa</Badge> : <Badge>Inativa</Badge>}
            {store.manager && <span>· Responsável: {store.manager.name}</span>}
          </span>
        }
        actions={
          <>
            {can(actor, "jobs.create") && store.status === "ACTIVE" && (
              <Link href={`/vagas/nova?loja=${store.id}`} className={buttonClass("primary")}><Plus size={18} weight="bold" /> Nova vaga</Link>
            )}
            {can(actor, "stores.manage") && <Link href={`/lojas/${store.id}/editar`} className={buttonClass("secondary")}><PencilSimple size={17} /> Editar</Link>}
          </>
        }
      />
      {sp.salvo && <div className="mb-5"><Alert tone="success">Loja salva.</Alert></div>}

      <section className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6" aria-label="Indicadores da loja">
        <Stat label="Vagas abertas" value={stats.openJobs} hint={`${stats.openings} posição(ões)`} />
        <Stat label="Em processo" value={stats.active} />
        <Stat label="Inscrições 30 dias" value={stats.applications30} />
        <Stat label="Contratações 30 dias" value={stats.hires30} />
        <Stat label="Conversão 30 dias" value={stats.conversion30 === null ? "—" : `${stats.conversion30}%`} hint="contratados ÷ inscritos" />
        <Stat label="Funcionários" value={store.employeeCount} />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Vagas abertas" icon={Briefcase} action={<Link href={`/vagas?loja=${store.id}`} className="text-[13px] font-semibold hover:underline">Ver todas</Link>}>
          {data.jobs.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">Nenhuma vaga aberta ou pausada nesta loja.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-3 py-2.5">
                  <Link href={`/vagas/${j.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{j.title}</p>
                    <p className="text-[12px] text-muted">{j.openings} posição(ões) · {j._count.processes} candidato(s) · {j.recruiter?.name ?? "sem responsável"}</p>
                  </Link>
                  {j.priority === "URGENT" || j.priority === "HIGH" ? <Badge tone="warning">{PRIORITY_LABEL[j.priority]}</Badge> : null}
                  <Badge tone={j.status === "OPEN" ? "success" : "neutral"}>{JOB_STATUS_LABEL[j.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Candidatos em processo" icon={UsersThree}>
          {data.processes.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">Nenhum candidato em processo nesta loja.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.processes.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <Link href={`/candidatos/${p.candidate.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{p.candidate.fullName}</p>
                    <p className="truncate text-[12px] text-muted">{p.job.title} · {formatDateTime(p.lastMovedAt)}</p>
                  </Link>
                  <StagePill stageKey={p.stage.key} name={p.stage.name} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Próximas entrevistas" icon={CalendarDots}>
          {data.interviews.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">Nenhuma entrevista agendada. O calendário chega na Etapa 3.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.interviews.map((i) => (
                <li key={i.id} className="py-2.5 text-[14px]">
                  <span className="font-medium">{i.candidateJob.candidate.fullName}</span> · {i.candidateJob.job.title}
                  <p className="text-[12px] text-muted">{formatDateTime(i.scheduledAt)} · {i.mode === "ONLINE" ? "Online" : "Presencial"}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Contratações recentes" icon={UserCheck}>
          {data.hires.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">Nenhuma contratação registrada ainda.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.hires.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                  <Link href={`/candidatos/${h.candidate.id}`} className="truncate font-medium hover:underline">{h.candidate.fullName}</Link>
                  <span className="shrink-0 text-[12px] text-muted">{h.job.title} · {formatDate(h.hiredAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Histórico da loja" icon={ClockCounterClockwise} className="mt-5">
        {data.activity.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">Nenhuma atividade registrada.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13.5px]">
                <span>{a.summary}</span>
                <span className="text-[12px] text-muted">{a.actor?.name ?? "Sistema"} · {formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
