import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  Briefcase, CalendarDots, ChatText, FilePdf, IdentificationCard, NotePencil, PencilSimple, ShieldCheck, Tag, UserCircle, WhatsappLogo, Plus,
} from "@phosphor-icons/react/ssr";
import { Alert, Badge, Breadcrumb, InfoList, PageHeader, PageSkeleton, buttonClass } from "@/components/ui";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { NoPermission } from "@/components/layout/states";
import { notFoundCard } from "@/components/layout/not-found-card";
import { Panel } from "@/components/dashboard/widgets";
import { StagePill } from "@/components/recruitment/stage-pill";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { ROLES } from "@/server/authz/catalog";
import { SOURCE_LABEL, candidateFormOptions, getCandidateProfile, listTags, openJobsForLinking } from "@/server/modules/candidates/service";
import { storageReady } from "@/server/storage";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoneyBR } from "@/lib/form";
import { digitsOnly, formatPhoneBR } from "@/lib/phone";
import { formatCpf } from "@/lib/cpf";
import { anonymizeAction, deleteCandidateAction } from "../actions";
import { optOutAction } from "@/app/(app)/mensagens/enviar/actions";
import { candidateCommunication } from "@/server/modules/automations/service";
import { db } from "@/server/db/client";
import { OpenConversationButton } from "@/components/messages/open-button";
import { LinkJob, NoteForm, OwnerControl, ResumeUpload, TagEditor, TalentPoolToggle } from "./profile-controls";

export const metadata: Metadata = { title: "Candidato" };

export default function CandidatePage({ params, searchParams }: PageProps<"/candidatos/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const PURPOSE = { RECRUITMENT_PROCESS: "Processo seletivo", TALENT_POOL: "Banco de talentos", WHATSAPP_CONTACT: "Contato pelo WhatsApp" } as Record<string, string>;
const MSG_STATUS: Record<string, string> = { QUEUED: "na fila", SENT: "enviada", DELIVERED: "entregue", READ: "lida", FAILED: "falhou", RECEIVED: "recebida" };
const INTERVIEW_STATUS: Record<string, string> = { SCHEDULED: "Agendada", COMPLETED: "Realizada", NO_SHOW: "Não compareceu", CANCELED: "Cancelada", RESCHEDULED: "Remarcada" };

async function Content({ params, searchParams }: { params: PageProps<"/candidatos/[id]">["params"]; searchParams: PageProps<"/candidatos/[id]">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "candidates.view")) return <NoPermission />;
  const { id } = await params;
  const sp = await searchParams;
  const data = await getCandidateProfile(actor, id).catch(() => null);
  if (!data || data.candidate.anonymizedAt) return notFoundCard("Candidato não encontrado", "/candidatos", "Voltar para candidatos");
  const c = data.candidate;
  const [opts, jobs, tags] = await Promise.all([
    data.canEdit ? candidateFormOptions(actor) : Promise.resolve(null),
    data.canLink && data.canEdit ? openJobsForLinking(actor, c.id) : Promise.resolve([]),
    data.canManagePool ? listTags() : Promise.resolve([]),
  ]);
  const resume = c.attachments.find((a) => a.kind === "RESUME");
  const wa = c.whatsappE164 ?? c.phoneE164;
  const selfOnly = ROLES[actor.roleKey].ownRecordsOnly;
  const [comm, stages] = can(actor, "messages.view")
    ? await Promise.all([candidateCommunication(actor, c.id), db.recruitmentStage.findMany({ select: { key: true, name: true } })])
    : [{ messages: [], queue: [] }, []];
  const stageNames = new Map(stages.map((s) => [s.key, s.name]));
  const conv = c.conversations;
  const now = new Date();
  const canSchedule = can(actor, "interviews.manage");

  return (
    <>
      <Breadcrumb items={[{ href: "/candidatos", label: "Candidatos" }, { label: c.fullName }]} />
      <PageHeader
        title={c.fullName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {[c.desiredPosition?.name, c.city && `${c.city}${c.state ? `/${c.state}` : ""}`].filter(Boolean).join(" · ") || "Sem cargo ou cidade informados"}
            {c.inTalentPool && <Badge tone="brand">Banco de talentos</Badge>}
            {c.tags.map((t) => <Badge key={t.tag.id}>{t.tag.name}</Badge>)}
          </span>
        }
        actions={
          <>
            {wa && can(actor, "messages.view") && <OpenConversationButton candidateId={c.id} label="Mensagem no WhatsApp" />}
            {wa && !can(actor, "messages.view") && <a href={`https://wa.me/${digitsOnly(wa)}`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}><WhatsappLogo size={17} weight="fill" /> WhatsApp</a>}
            {data.canEdit && <Link href={`/candidatos/${c.id}/editar`} className={buttonClass("secondary")}><PencilSimple size={17} /> Editar</Link>}
          </>
        }
      />
      {sp.salvo && <div className="mb-5"><Alert tone="success">Candidato salvo.</Alert></div>}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Processos seletivos" icon={Briefcase}>
            {c.processes.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted">Ainda não participa de nenhuma vaga.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {c.processes.map((p) => (
                  <li key={p.id} className="rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/vagas/${p.job.id}`} className="font-semibold hover:underline">{p.job.title}</Link>
                        <p className="text-[12.5px] text-muted">{p.job.store.name} · inscrito em {formatDate(p.appliedAt)} · {p.recruiter?.name ?? "sem recrutador"}</p>
                      </div>
                      <span className="flex items-center gap-2">
                        {p.status === "ACTIVE" && canSchedule && (
                          <Link href={`/entrevistas/nova?processo=${p.id}`} className={buttonClass("secondary", "sm")}><CalendarDots size={15} /> Agendar entrevista</Link>
                        )}
                        <StagePill stageKey={p.stage.key} name={p.stage.name} />
                      </span>
                    </div>
                    {(p.source === "ONLINE_FORM" || p.salaryExpectation !== null || p.currentlyEmployed !== null) && (
                      <dl className="mt-3 grid gap-x-4 gap-y-1.5 rounded-lg bg-surface px-3 py-2.5 text-[12.5px] sm:grid-cols-3">
                        <div><dt className="text-muted">Origem</dt><dd className="font-medium">{SOURCE_LABEL[p.source]}</dd></div>
                        <div><dt className="text-muted">Pretensão salarial</dt><dd className="font-medium">{p.salaryExpectation ? `R$ ${formatMoneyBR(String(p.salaryExpectation))}` : "—"}</dd></div>
                        <div><dt className="text-muted">Trabalhando atualmente</dt><dd className="font-medium">{p.currentlyEmployed === null ? "—" : p.currentlyEmployed ? "Sim" : "Não"}</dd></div>
                        {p.applicantMessage && <div className="sm:col-span-3"><dt className="text-muted">Observações do candidato</dt><dd className="whitespace-pre-line">{p.applicantMessage}</dd></div>}
                        {p.resume && !p.resume.deletedAt && data.canViewResume && (
                          <div className="sm:col-span-3">
                            <dt className="text-muted">Currículo enviado nesta inscrição</dt>
                            <dd><a href={`/api/files/${p.resume.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium underline decoration-brand decoration-2 underline-offset-4"><FilePdf size={14} weight="fill" className="text-danger" /> {p.resume.fileName}</a></dd>
                          </div>
                        )}
                      </dl>
                    )}
                    {p.history.length > 0 && (
                      <ol className="mt-3 flex flex-col gap-1.5 border-l-2 border-brand/50 pl-3">
                        {p.history.map((h) => (
                          <li key={h.id} className="text-[12.5px]">
                            <span className="font-medium">{h.fromStage ? `${h.fromStage.name} → ${h.toStage.name}` : h.toStage.name}</span>
                            <span className="text-muted"> · {h.movedBy?.name ?? "Sistema"} · {formatDateTime(h.movedAt)}{h.note ? ` · ${h.note}` : ""}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                    {p.interviews.length > 0 && (
                      <ul className="mt-3 flex flex-col gap-1">
                        {p.interviews.map((i) => (
                          <li key={i.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                            <CalendarDots size={14} className="text-muted" />
                            <Link href={`/entrevistas/${i.id}`} className="hover:underline">Entrevista {i.mode === "ONLINE" ? "online" : "presencial"} em {formatDateTime(i.scheduledAt)}</Link> · {INTERVIEW_STATUS[i.status] ?? i.status}
                            {i.interviewer && <span className="text-muted">com {i.interviewer.name}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {data.canLink && data.canEdit && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><Plus size={14} weight="bold" /> Vincular a outra vaga</p>
                <LinkJob id={c.id} jobs={jobs.map((j) => ({ id: j.id, title: j.title, store: j.store.name }))} />
              </div>
            )}
          </Panel>

          {can(actor, "messages.view") && (
            <Panel title="Comunicação" icon={ChatText} action={conv[0] ? <Link href={`/mensagens?c=${conv[0].id}`} className="text-[13px] font-semibold hover:underline">Abrir conversa</Link> : undefined}>
              {comm.queue.length > 0 && (
                <ul className="mb-4 flex flex-col gap-1.5">
                  {comm.queue.map((q) => (
                    <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-soft px-3 py-2 text-[13px]">
                      <span><strong>{q.rule.name}</strong> · {q.candidateJob.job.title}{q.status === "BLOCKED" && q.reason ? ` · ${q.reason}` : ""}</span>
                      <span className="text-[12px]">{q.status === "BLOCKED" ? "Falta informação" : q.dueAt > now ? `Agendada para ${formatDateTime(q.dueAt)}` : <Link href="/mensagens/enviar" className="font-semibold underline">Para enviar</Link>}</span>
                    </li>
                  ))}
                </ul>
              )}
              {comm.messages.length === 0 ? (
                <p className="text-[13px] text-muted">Nenhuma mensagem registrada ainda.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {comm.messages.map((m) => (
                    <li key={m.id} className="py-2.5">
                      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                        <Badge tone={m.direction === "INBOUND" ? "brand" : "neutral"}>{m.direction === "INBOUND" ? "Recebida" : "Enviada"}</Badge>
                        {formatDateTime(m.createdAt)}
                        {m.stageKey && <span>· {stageNames.get(m.stageKey) ?? m.stageKey}</span>}
                        {m.candidateJob && <span>· {m.candidateJob.job.title}</span>}
                        {m.direction === "OUTBOUND" && <span>· {m.channel === "MANUAL_LINK" ? `aberta no WhatsApp por ${m.sentBy?.name ?? "—"}` : MSG_STATUS[m.status] ?? m.status}</span>}
                      </div>
                      <p className="mt-1 text-[13.5px] whitespace-pre-line">{m.body ?? (m.mediaType ? `[${m.mediaType}]` : "")}</p>
                      {m.status === "FAILED" && m.errorMessage && <p className="mt-0.5 text-[12px] text-danger">{m.errorMessage}</p>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 border-t border-line pt-3">
                {c.optedOutAt ? (
                  <p className="text-[12.5px] text-warning">Pediu para não receber mensagens em {formatDate(c.optedOutAt)}. Nenhuma mensagem automática é gerada.</p>
                ) : data.canEdit ? (
                  <ConfirmAction label="Pediu para não receber mensagens" size="sm" variant="secondary" question="Registrar que o candidato pediu para não receber mensagens? As mensagens na fila são canceladas." confirmLabel="Registrar" action={optOutAction.bind(null, c.id)} />
                ) : null}
              </div>
            </Panel>
          )}

          <Panel title="Observações" icon={NotePencil}>
            {data.canEdit && <div className="mb-4"><NoteForm id={c.id} /></div>}
            {c.notes.length === 0 ? (
              <p className="py-2 text-center text-[13px] text-muted">Nenhuma observação registrada.</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.notes.map((n) => (
                  <li key={n.id} className="py-3">
                    <p className="text-[14px] whitespace-pre-line">{n.body}</p>
                    <p className="mt-1 text-[12px] text-muted">{n.author?.name ?? "—"} · {formatDateTime(n.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Perfil" icon={IdentificationCard}>
            <InfoList
              items={[
                { label: "CPF", value: c.cpf ? formatCpf(c.cpf) : "—" },
                { label: "Telefone", value: formatPhoneBR(c.phoneE164) || "—" },
                { label: "WhatsApp", value: formatPhoneBR(c.whatsappE164) || "—" },
                { label: "E-mail", value: c.email ?? "—" },
                { label: "Endereço", value: c.address ?? "—" },
                { label: "Loja desejada", value: c.desiredStore?.name ?? "Qualquer loja" },
                { label: "Origem", value: SOURCE_LABEL[c.source] },
                { label: "Cadastrado em", value: formatDate(c.createdAt) },
                { label: "Atualizado em", value: formatDateTime(c.updatedAt) },
              ]}
            />
            {(c.experience || c.introduction) && (
              <div className="mt-5 flex flex-col gap-4 text-[14px] leading-relaxed">
                {c.experience && <div><p className="mb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Experiência</p><p className="whitespace-pre-line">{c.experience}</p></div>}
                {c.introduction && <div><p className="mb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Apresentação</p><p className="whitespace-pre-line">{c.introduction}</p></div>}
              </div>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Currículo" icon={FilePdf}>
            {resume ? (
              data.canViewResume ? (
                <a href={`/api/files/${resume.id}`} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-lg border border-line p-3 hover:border-ink/40">
                  <FilePdf size={28} weight="fill" className="shrink-0 text-danger" />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{resume.fileName}</span>
                    <span className="text-[12px] text-muted">{Math.max(1, Math.round(resume.sizeBytes / 1024))} KB · {formatDate(resume.createdAt)} · abrir</span>
                  </span>
                </a>
              ) : (
                <p className="text-[13px] text-muted">Há um currículo anexado, mas seu perfil não pode abri-lo.</p>
              )
            ) : (
              <p className="text-[13px] text-muted">Nenhum currículo anexado.</p>
            )}
            {data.canEdit && (storageReady() ? (
              <div className="mt-3"><ResumeUpload id={c.id} hasResume={!!resume} /></div>
            ) : (
              <p className="mt-3 text-[12.5px] text-muted">O armazenamento de currículos ainda não foi configurado pelo administrador.</p>
            ))}
          </Panel>

          <Panel title="Responsável" icon={UserCircle}>
            <p className="mb-3 text-[14px]">{c.owner?.name ?? <span className="text-muted">Sem recrutador responsável</span>}</p>
            {data.canEdit && opts && <OwnerControl id={c.id} ownerId={c.ownerId} owners={opts.owners} selfId={actor.id} selfOnly={selfOnly} />}
          </Panel>

          {data.canManagePool && (
            <Panel title="Banco de talentos" icon={Tag}>
              <div className="flex flex-col gap-4">
                <TagEditor id={c.id} tags={c.tags.map((t) => t.tag)} suggestions={tags.map((t) => t.name)} />
                <TalentPoolToggle id={c.id} value={c.inTalentPool} />
              </div>
            </Panel>
          )}


          <Panel title="LGPD" icon={ShieldCheck}>
            <ul className="flex flex-col gap-2 text-[13px]">
              {c.consents.length === 0 && <li className="text-muted">Nenhum consentimento registrado.</li>}
              {c.consents.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{PURPOSE[k.purpose] ?? k.purpose}</span>
                  {k.revokedAt ? <Badge tone="danger">Revogado</Badge> : <Badge tone="success">Desde {formatDate(k.grantedAt)}</Badge>}
                </li>
              ))}
              <li className="text-[12px] text-muted">Dados mantidos até {formatDate(c.retentionUntil)} — o prazo renova a cada novo contato.</li>
            </ul>
            {can(actor, "candidates.delete") && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="mb-2 text-[12.5px] text-muted">Excluir apaga tudo, inclusive candidaturas e entrevistas (somem dos relatórios). Anonimizar remove só os dados pessoais e mantém as estatísticas.</p>
                <ConfirmAction
                  label="Excluir candidato"
                  size="sm"
                  question="Excluir este candidato de vez, com candidaturas, entrevistas, mensagens e currículo? Não dá para desfazer."
                  confirmLabel="Excluir definitivamente"
                  action={deleteCandidateAction.bind(null, c.id)}
                />
              </div>
            )}
            {data.canAnonymize && (
              <div className="mt-4 border-t border-line pt-4">
                <ConfirmAction
                  label="Anonimizar dados"
                  size="sm"
                  question="Remover nome, contatos, currículo, observações e etiquetas deste candidato? Os processos ficam só como estatística. Não dá para desfazer."
                  confirmLabel="Anonimizar"
                  action={anonymizeAction.bind(null, c.id)}
                />
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
