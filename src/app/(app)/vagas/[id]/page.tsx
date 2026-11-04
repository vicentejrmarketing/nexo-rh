import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FunnelSimple, Info, PencilSimple, Trash, UserPlus, UsersThree } from "@phosphor-icons/react/ssr";
import { Alert, Badge, Breadcrumb, InfoList, PageHeader, PageSkeleton, buttonClass } from "@/components/ui";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { NoPermission } from "@/components/layout/states";
import { notFoundCard } from "@/components/layout/not-found-card";
import { Panel } from "@/components/dashboard/widgets";
import { StagePill } from "@/components/recruitment/stage-pill";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { CONTRACT_LABEL, JOB_STATUS_LABEL, PRIORITY_LABEL, getJob } from "@/server/modules/jobs/service";
import { CopyJobLink, ViewOnSite } from "@/components/portal/site-controls";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoneyBR } from "@/lib/form";
import { formatPhoneBR } from "@/lib/phone";
import { deleteJobAction, jobStatusAction } from "../actions";
import { DuplicateJobButton, JobStatusButtons, LinkCandidateBox } from "../job-controls";

export const metadata: Metadata = { title: "Vaga" };

export default function JobPage({ params, searchParams }: PageProps<"/vagas/[id]">) {
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

function salary(j: { salaryMin: unknown; salaryMax: unknown; salaryText: string | null }) {
  const min = j.salaryMin ? `R$ ${formatMoneyBR(String(j.salaryMin))}` : null;
  const max = j.salaryMax ? `R$ ${formatMoneyBR(String(j.salaryMax))}` : null;
  const range = min && max ? `${min} a ${max}` : min ? `A partir de ${min}` : max ? `Até ${max}` : null;
  return [range, j.salaryText].filter(Boolean).join(" · ") || "Não informado";
}

const STATUS_TONE = { OPEN: "success", PAUSED: "warning", DRAFT: "neutral", CLOSED: "neutral", CANCELED: "danger" } as const;

async function Content({ params, searchParams }: { params: PageProps<"/vagas/[id]">["params"]; searchParams: PageProps<"/vagas/[id]">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "jobs.view")) return <NoPermission />;
  const { id } = await params;
  const sp = await searchParams;
  const data = await getJob(actor, id).catch(() => null);
  if (!data) return notFoundCard("Vaga não encontrada", "/vagas", "Voltar para vagas");
  const { job, stats, byStage, processes } = data;
  const canLink = job.status === "OPEN" && can(actor, "candidates.update");
  const maxStage = Math.max(1, ...byStage.map((s) => s.count));

  return (
    <>
      <Breadcrumb items={[{ href: "/vagas", label: "Vagas" }, { label: job.title }]} />
      <PageHeader
        title={job.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/lojas/${job.store.id}`} className="hover:underline">{job.store.name}</Link>{job.city !== job.store.name && ` · ${job.city}`}
            <Badge tone={STATUS_TONE[job.status]}>{JOB_STATUS_LABEL[job.status]}</Badge>
            {job.priority !== "MEDIUM" && <Badge tone={job.priority === "LOW" ? "neutral" : "warning"}>Prioridade {PRIORITY_LABEL[job.priority].toLowerCase()}</Badge>}
          </span>
        }
        actions={
          <>
            {data.canEdit && <JobStatusButtons id={job.id} status={job.status} />}
            {data.canEdit && <Link href={`/vagas/${job.id}/editar`} className={buttonClass("secondary")}><PencilSimple size={17} /> Editar</Link>}
            {data.canCreate && <DuplicateJobButton id={job.id} />}
            {job.publishedOnline && ["OPEN", "PAUSED", "CLOSED"].includes(job.status) && (
              <>
                <ViewOnSite slug={job.slug} size="md" />
                <CopyJobLink slug={job.slug} size="md" />
              </>
            )}
          </>
        }
      />
      {sp.salvo && <div className="mb-5"><Alert tone="success">Vaga salva.</Alert></div>}
      {job.status === "DRAFT" && <div className="mb-5"><Alert tone="brand" title="Rascunho">Publique a vaga para poder vincular candidatos.</Alert></div>}

      <section className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5" aria-label="Indicadores da vaga">
        <Stat label="Candidatos" value={stats.applicants} />
        <Stat label="Em processo" value={stats.active} />
        <Stat label="Contratados" value={`${stats.hired}/${job.openings}`} hint={stats.remaining ? `faltam ${stats.remaining}` : "vagas preenchidas"} />
        <Stat label="Dias aberta" value={stats.daysOpen ?? "—"} hint={job.openedAt ? `desde ${formatDate(job.openedAt)}` : "ainda não publicada"} />
        <Stat label="Encerramento previsto" value={job.expectedCloseAt ? formatDate(job.expectedCloseAt) : "—"} />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_400px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Candidatos desta vaga" icon={UsersThree}>
            {processes.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted">Nenhum candidato vinculado ainda.</p>
            ) : (
              <ul className="divide-y divide-line">
                {processes.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <Link href={`/candidatos/${p.candidate.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">{p.candidate.fullName}</p>
                      <p className="truncate text-[12px] text-muted">
                        {[p.candidate.phoneE164 ? formatPhoneBR(p.candidate.phoneE164) : null, p.candidate.city, `movido ${formatDateTime(p.lastMovedAt)}`].filter(Boolean).join(" · ")}
                      </p>
                    </Link>
                    <StagePill stageKey={p.stage.key} name={p.stage.name} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Detalhes da vaga" icon={Info}>
            <InfoList
              items={[
                { label: "Cargo", value: job.position?.name ?? "—" },
                { label: "Responsável", value: job.recruiter?.name ?? "Sem responsável" },
                { label: "Salário", value: salary(job) },
                { label: "Posições", value: job.openings },
                { label: "Contratação", value: CONTRACT_LABEL[job.contractType] },
                {
                  label: "Site de vagas",
                  value: !job.publishedOnline ? "Fora do site" : job.status === "OPEN" ? `No ar${job.publishedAt ? ` desde ${formatDate(job.publishedAt)}` : ""}` : "Publicada, mas sem aceitar inscrições (vaga não está aberta)",
                },
                { label: "Salário no site", value: job.showSalary ? "Mostrar" : "Ocultar" },
                { label: "Criada por", value: `${job.createdBy?.name ?? "—"} em ${formatDate(job.createdAt)}` },
              ]}
            />
            <div className="mt-5 flex flex-col gap-4 text-[14px] leading-relaxed">
              <div><p className="mb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Descrição</p><p className="whitespace-pre-line">{job.description}</p></div>
              {job.responsibilities && <div><p className="mb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Responsabilidades</p><p className="whitespace-pre-line">{job.responsibilities}</p></div>}
              {job.requirements && <div><p className="mb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Requisitos</p><p className="whitespace-pre-line">{job.requirements}</p></div>}
              {job.benefits && <div><p className="mb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Benefícios</p><p className="whitespace-pre-line">{job.benefits}</p></div>}
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {canLink && (
            <Panel title="Adicionar candidato" icon={UserPlus}>
              <LinkCandidateBox jobId={job.id} canCreate={can(actor, "candidates.create")} />
            </Panel>
          )}
          <Panel title="Funil da vaga" icon={FunnelSimple}>
            <ul className="flex flex-col gap-2.5">
              {byStage.map((s) => (
                <li key={s.key} className="text-[13px]">
                  <div className="mb-1 flex justify-between"><span>{s.name}</span><span className="tabular font-semibold">{s.count}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface">
                    <div className={s.kind === "REJECTED" || s.kind === "WITHDRAWN" ? "h-full rounded-full bg-muted/50" : s.kind === "HIRED" ? "h-full rounded-full bg-success" : "h-full rounded-full bg-brand"} style={{ width: `${(s.count / maxStage) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] text-muted">Mover candidatos entre etapas chega com o Funil, na Etapa 3.</p>
          </Panel>
          {data.canEdit && ["DRAFT", "OPEN", "PAUSED"].includes(job.status) && (
            <Panel title="Cancelar vaga" icon={Trash}>
              <p className="mb-3 text-[13px] text-muted">Para vagas que não vão mais acontecer: sai do site e da lista de vagas em andamento. Os candidatos e o histórico ficam guardados.</p>
              <ConfirmAction label="Cancelar vaga" size="sm" variant="secondary" question="Cancelar esta vaga? Ela some do site e para de aceitar inscrições." confirmLabel="Cancelar vaga" action={jobStatusAction.bind(null, job.id, "CANCELED")} />
            </Panel>
          )}
          {data.canDelete && (
            <Panel title="Excluir vaga" icon={Trash}>
              {stats.applicants > 0 ? (
                <p className="text-[13px] text-muted">Vagas com candidatos não podem ser excluídas — encerre a vaga para manter o histórico.</p>
              ) : (
                <ConfirmAction label="Excluir vaga" question="Excluir esta vaga definitivamente? Ela não tem candidatos vinculados." confirmLabel="Excluir" size="sm" action={deleteJobAction.bind(null, job.id)} />
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
