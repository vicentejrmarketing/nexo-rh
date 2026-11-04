import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowsClockwise, CalendarDots, ChatCircleText, Info, LinkSimple, MapPin, Star, WhatsappLogo } from "@phosphor-icons/react/ssr";
import { Alert, Badge, Breadcrumb, InfoList, PageHeader, PageSkeleton, buttonClass } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { notFoundCard } from "@/components/layout/not-found-card";
import { Panel } from "@/components/dashboard/widgets";
import { StagePill } from "@/components/recruitment/stage-pill";
import { InterviewForm } from "@/components/interviews/interview-form";
import { CancelForm, EvaluationForm, OutcomeButtons } from "@/components/interviews/detail-controls";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { INTERVIEW_STATUS_LABEL, MODE_LABEL, RECOMMENDATION_LABEL, getInterview, interviewFormOptions } from "@/server/modules/interviews/service";
import { formatDateTime } from "@/lib/format";
import { dayKey, timeKey } from "@/lib/period";
import { digitsOnly, formatPhoneBR } from "@/lib/phone";

export const metadata: Metadata = { title: "Entrevista" };

const STATUS_TONE = { SCHEDULED: "brand", COMPLETED: "success", CANCELED: "danger", RESCHEDULED: "neutral", NO_SHOW: "warning" } as const;

export default function InterviewPage({ params, searchParams }: PageProps<"/entrevistas/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: { params: PageProps<"/entrevistas/[id]">["params"]; searchParams: PageProps<"/entrevistas/[id]">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "interviews.view")) return <NoPermission />;
  const { id } = await params;
  const sp = await searchParams;
  const data = await getInterview(actor, id).catch(() => null);
  if (!data) return notFoundCard("Entrevista não encontrada", "/entrevistas", "Voltar para a agenda");
  const { interview: i, canManage, canEvaluate, started } = data;
  const c = i.candidateJob.candidate;
  const wa = c.whatsappE164 ?? c.phoneE164;
  const end = new Date(i.scheduledAt.getTime() + i.durationMinutes * 60000);
  const mine = i.evaluations.find((e) => e.evaluator?.id === actor.id);
  const reschedule = sp.remarcar === "1" && canManage && i.status === "SCHEDULED";
  const opts = reschedule ? await interviewFormOptions(actor) : null;

  return (
    <>
      <Breadcrumb items={[{ href: `/entrevistas?visao=dia&data=${dayKey(i.scheduledAt)}`, label: "Entrevistas" }, { label: c.fullName }]} />
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Entrevista · {c.fullName} <Badge tone={STATUS_TONE[i.status]}>{INTERVIEW_STATUS_LABEL[i.status]}</Badge></span>}
        description={`${formatDateTime(i.scheduledAt)} até ${timeKey(end)} · ${MODE_LABEL[i.mode]} · ${i.candidateJob.job.title}`}
        actions={
          <>
            {wa && <a href={`https://wa.me/${digitsOnly(wa)}`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}><WhatsappLogo size={17} weight="fill" /> WhatsApp</a>}
            {i.meetingUrl && i.status === "SCHEDULED" && <a href={i.meetingUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}><LinkSimple size={17} weight="bold" /> Entrar na reunião</a>}
          </>
        }
      />
      {sp.agendada && <div className="mb-5"><Alert tone="success">Entrevista agendada.{i.interviewer && i.interviewer.id !== actor.id ? ` ${i.interviewer.name} foi avisado(a).` : ""}</Alert></div>}
      {sp.reagendada && <div className="mb-5"><Alert tone="success">Entrevista reagendada para {formatDateTime(i.scheduledAt)}.</Alert></div>}
      {i.status === "RESCHEDULED" && i.rescheduledTo && (
        <div className="mb-5"><Alert tone="brand">Esta entrevista foi remarcada. <Link href={`/entrevistas/${i.rescheduledTo.id}`} className="font-semibold underline">Ver o novo horário ({formatDateTime(i.rescheduledTo.scheduledAt)})</Link></Alert></div>
      )}

      {reschedule && opts ? (
        <div className="max-w-3xl">
          <InterviewForm
            mode="reschedule"
            interviewId={i.id}
            process={null}
            stores={opts.stores}
            interviewers={opts.interviewers.map((u) => ({ id: u.id, name: u.name, role: u.role.name }))}
            initial={{ date: dayKey(i.scheduledAt), time: timeKey(i.scheduledAt), durationMinutes: i.durationMinutes, mode: i.mode, interviewerId: i.interviewerId, meetingUrl: i.meetingUrl, location: i.location, storeId: i.storeId, notes: i.notes }}
            cancelHref={`/entrevistas/${i.id}`}
          />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <div className="flex min-w-0 flex-col gap-5">
            <Panel title="Detalhes" icon={Info}>
              <InfoList
                items={[
                  { label: "Candidato", value: <Link href={`/candidatos/${c.id}`} className="font-medium underline decoration-brand decoration-2 underline-offset-4">{c.fullName}</Link> },
                  { label: "Telefone", value: formatPhoneBR(wa) || "—" },
                  { label: "Vaga", value: <Link href={`/vagas/${i.candidateJob.job.id}`} className="hover:underline">{i.candidateJob.job.title}</Link> },
                  { label: "Etapa atual", value: <StagePill stageKey={i.candidateJob.stage.key} name={i.candidateJob.stage.name} /> },
                  { label: "Entrevistador", value: i.interviewer?.name ?? "A definir" },
                  { label: "Loja", value: i.store.name },
                  { label: i.mode === "ONLINE" ? "Link" : "Local", value: i.mode === "ONLINE" ? (i.meetingUrl ? <a href={i.meetingUrl} target="_blank" rel="noopener noreferrer" className="break-all underline">{i.meetingUrl}</a> : "Não informado") : (i.location || [i.store.address, i.store.city].filter(Boolean).join(" · ") || "Na loja") },
                  { label: "Agendada por", value: `${i.createdBy?.name ?? "—"} em ${formatDateTime(i.createdAt)}` },
                ]}
              />
              {i.notes && <p className="mt-4 rounded-lg bg-surface px-3 py-2.5 text-[14px] whitespace-pre-line">{i.notes}</p>}
              {i.canceledReason && <p className="mt-3 text-[13px] text-muted">{i.status === "CANCELED" ? "Motivo do cancelamento" : "Motivo da remarcação"}: {i.canceledReason}</p>}
              {i.rescheduledFrom && <p className="mt-3 text-[13px] text-muted">Remarcada de <Link href={`/entrevistas/${i.rescheduledFrom.id}`} className="underline">{formatDateTime(i.rescheduledFrom.scheduledAt)}</Link>.</p>}
            </Panel>

            <Panel title="Avaliações" icon={Star}>
              {i.evaluations.length === 0 ? (
                <p className="text-[13px] text-muted">Nenhuma avaliação registrada.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {i.evaluations.map((ev) => (
                    <li key={ev.id} className="rounded-lg border border-line p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[14px] font-semibold">{ev.evaluator?.name ?? "—"}</span>
                        <span className="flex items-center gap-2">
                          <Badge tone={ev.recommendation === "ADVANCE" ? "success" : ev.recommendation === "REJECT" ? "danger" : "warning"}>{RECOMMENDATION_LABEL[ev.recommendation]}</Badge>
                          <span className="tabular rounded-full bg-ink px-2 py-0.5 text-[12px] font-bold text-brand">{ev.overall}/5</span>
                        </span>
                      </div>
                      <p className="mt-1 text-[12.5px] text-muted">
                        {[["Comunicação", ev.communication], ["Experiência", ev.experience], ["Postura", ev.attitude], ["Disponibilidade", ev.availability]].filter(([, v]) => v).map(([l, v]) => `${l} ${v}`).join(" · ")}
                        {" · "}{formatDateTime(ev.createdAt)}
                      </p>
                      {ev.comments && <p className="mt-2 text-[14px] whitespace-pre-line">{ev.comments}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {canEvaluate && started && (i.status === "SCHEDULED" || i.status === "COMPLETED") && (
                <div className="mt-5 border-t border-line pt-5">
                  <p className="mb-3 text-[14px] font-semibold">{mine ? "Sua avaliação" : "Registrar avaliação"}</p>
                  <EvaluationForm
                    id={i.id}
                    initial={mine ? {
                      communication: String(mine.communication ?? ""), experience: String(mine.experience ?? ""), attitude: String(mine.attitude ?? ""),
                      availability: String(mine.availability ?? ""), overall: String(mine.overall), recommendation: mine.recommendation, comments: mine.comments ?? "",
                    } : undefined}
                  />
                </div>
              )}
              {canEvaluate && !started && i.status === "SCHEDULED" && <p className="mt-3 text-[12.5px] text-muted">A avaliação fica disponível no horário da entrevista.</p>}
            </Panel>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            {i.status === "SCHEDULED" && (canManage || canEvaluate) && (
              <Panel title="Ações" icon={CalendarDots}>
                <div className="flex flex-col gap-4">
                  {started && (
                    <div>
                      <p className="mb-2 text-[13px] text-muted">Como foi?</p>
                      <OutcomeButtons id={i.id} />
                    </div>
                  )}
                  {canManage && (
                    <div className="flex flex-col gap-2">
                      <Link href={`/entrevistas/${i.id}?remarcar=1`} className={buttonClass("secondary", "sm")}><ArrowsClockwise size={16} /> Reagendar</Link>
                      <CancelForm id={i.id} />
                    </div>
                  )}
                </div>
              </Panel>
            )}
            <Panel title="Próximo passo" icon={ChatCircleText}>
              <p className="text-[13px] text-muted">Depois da entrevista, mova o candidato no funil (aprovado, em teste, reprovado...).</p>
              <Link href={`/funil?vaga=${i.candidateJob.job.id}`} className={`${buttonClass("secondary", "sm")} mt-3`}>Abrir o funil da vaga</Link>
            </Panel>
            {i.mode === "IN_PERSON" && (
              <Panel title="Endereço" icon={MapPin}>
                <p className="text-[14px]">{i.location || [i.store.address, i.store.city].filter(Boolean).join(" · ") || i.store.name}</p>
              </Panel>
            )}
          </div>
        </div>
      )}
    </>
  );
}
