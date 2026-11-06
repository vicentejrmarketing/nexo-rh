import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Suspense } from "react";
import {
  Briefcase, CalendarDots, ChatText, ClockCounterClockwise, FilePdf, FolderOpen, IdentificationCard, ListChecks, UserCircle, UsersThree,
} from "@phosphor-icons/react/ssr";
import { Badge, Breadcrumb, InfoList, PageHeader, PageSkeleton, buttonClass } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { notFoundCard } from "@/components/layout/not-found-card";
import { Panel } from "@/components/dashboard/widgets";
import { AdmissionBadge } from "@/components/admission/status";
import { AdmissionLink, FileReview, FinishReview, ReopenButton } from "@/components/admission/panel";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { DOC_INFO, DOC_KINDS, getHire } from "@/server/modules/admission/service";
import { SOURCE_LABEL } from "@/server/modules/candidates/service";
import { CONTRACT_LABEL } from "@/server/modules/jobs/service";
import { RECOMMENDATION_LABEL } from "@/server/modules/interviews/service";
import { getCompanySettings } from "@/server/modules/settings/service";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoneyBR } from "@/lib/form";
import { digitsOnly, formatPhoneBR } from "@/lib/phone";
import { formatCpf } from "@/lib/cpf";

export const metadata: Metadata = { title: "Contratado" };

export default function HirePage({ params }: PageProps<"/contratados/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "—");
const brDate = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "—");

async function Content({ params }: { params: PageProps<"/contratados/[id]">["params"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "admission.view")) return <NoPermission />;
  const { id } = await params;
  const data = await getHire(actor, id).catch(() => null);
  if (!data) return notFoundCard("Contratado não encontrado", "/contratados", "Voltar para contratados");
  const { process: p, canManage, link } = data;
  const c = p.candidate;
  const a = p.admission;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
  const settings = await getCompanySettings();
  const phone = c.whatsappE164 ?? c.phoneE164;
  const children = (Array.isArray(a?.children) ? a.children : []) as { name: string; cpf: string; birthDate: string }[];
  const files = a?.files ?? [];
  const reviewable = canManage && (a?.status === "SUBMITTED" || a?.status === "CHANGES_REQUESTED");

  return (
    <>
      <Breadcrumb items={[{ href: "/contratados", label: "Contratados" }, { label: c.fullName }]} />
      <PageHeader
        title={c.fullName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {p.job.title} · {p.job.store.name}
            <Badge tone="success">Contratado{p.hiredAt ? ` em ${formatDate(p.hiredAt)}` : ""}</Badge>
            <AdmissionBadge status={a?.status ?? null} />
          </span>
        }
        actions={<Link href={`/candidatos/${c.id}`} className={buttonClass("secondary")}><UserCircle size={17} /> Perfil do candidato</Link>}
      />

      <Panel title="Documentos de admissão" icon={FolderOpen}>
        <AdmissionLink
          processId={p.id} origin={origin} path={link} expiresAt={a?.tokenExpiresAt?.toISOString() ?? null} status={a?.status ?? null} canManage={canManage}
          phoneDigits={phone ? digitsOnly(phone) : null} firstName={c.fullName.split(" ")[0]} jobTitle={p.job.title} storeName={p.job.store.name} companyName={settings.companyName}
        />
        {a && (a.submittedAt || files.length > 0) && (
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Documentos</h3>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {DOC_KINDS.map((k) => {
                  const list = files.filter((f) => f.kind === k);
                  return (
                    <li key={k} className="flex flex-col gap-2 p-3">
                      <p className="text-[14px] font-medium">{DOC_INFO[k].label}{!DOC_INFO[k].required && <span className="font-normal text-muted"> (quando se aplica)</span>}</p>
                      {list.length === 0 ? (
                        <p className="text-[12.5px] text-muted">Não enviado.</p>
                      ) : (
                        list.map((f) => (
                          <FileReview key={f.id} canReview={reviewable}
                            file={{ id: f.id, status: f.status, rejectionReason: f.rejectionReason, fileName: f.fileName, mimeType: f.mimeType, reviewedBy: f.reviewedBy?.name ?? null }} />
                        ))
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex flex-col gap-5">
              <div>
                <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Dados informados</h3>
                <InfoList items={[
                  { label: "E-mail", value: dash(a.email) },
                  { label: "Raça/cor", value: dash(a.race) },
                  { label: "Tamanho do uniforme", value: dash(a.uniformSize) },
                  { label: "Escolaridade", value: dash(a.education) },
                  { label: "PIS/NIS", value: a.pisNis ? a.pisNis.replace(/^(\d{3})(\d{5})(\d{2})(\d)$/, "$1.$2.$3-$4") : "—" },
                  { label: "Estado civil", value: dash(a.maritalStatus) },
                  { label: "Vale-transporte", value: a.needsTransport === null ? "—" : a.needsTransport ? `Sim · ${a.busesPerDay ?? "?"} ônibus/dia · ${a.transportDailyCost ? `R$ ${formatMoneyBR(Number(a.transportDailyCost))}` : "?"}/dia` : "Não precisa" },
                  { label: "Banco Santander", value: a.bankAccount || a.bankBranch ? `Ag. ${dash(a.bankBranch)} · Conta ${dash(a.bankAccount)}` : "—" },
                  { label: "Chave Pix", value: dash(a.pixKey) },
                  { label: "Cônjuge", value: a.spouseName ? `${a.spouseName} · CPF ${formatCpf(a.spouseCpf)} · ${brDate(a.spouseBirthDate)}` : "—" },
                ]} />
              </div>
              <div>
                <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Filhos</h3>
                {children.length === 0 ? <p className="text-[13.5px] text-muted">Nenhum informado.</p> : (
                  <ul className="divide-y divide-line rounded-lg border border-line text-[13.5px]">
                    {children.map((ch, i) => <li key={i} className="p-3"><span className="font-medium">{ch.name}</span> · CPF {formatCpf(ch.cpf)} · nasc. {brDate(ch.birthDate)}</li>)}
                  </ul>
                )}
              </div>
              {a.submittedAt && <p className="text-[12.5px] text-muted">Enviado em {formatDateTime(a.submittedAt)}{a.completedAt ? ` · concluído em ${formatDateTime(a.completedAt)}` : ""}</p>}
              {a.status === "CHANGES_REQUESTED" && a.reviewNote && <p className="rounded-lg bg-danger-soft/40 p-3 text-[13px]"><strong>Recado enviado:</strong> {a.reviewNote}</p>}
              {reviewable && a.status === "SUBMITTED" && (
                <FinishReview processId={p.id} hasRejected={files.some((f) => f.status === "REJECTED")} pendingCount={files.filter((f) => f.status === "PENDING").length} />
              )}
              {a.status === "CHANGES_REQUESTED" && <p className="text-[13px] text-muted">Aguardando o contratado corrigir e reenviar pelo link.</p>}
              {canManage && a.status === "COMPLETED" && <div><ReopenButton processId={p.id} /></div>}
            </div>
          </div>
        )}
      </Panel>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Dados pessoais e contato" icon={IdentificationCard}>
          <InfoList items={[
            { label: "CPF", value: c.cpf ? formatCpf(c.cpf) : "—" },
            { label: "Telefone", value: formatPhoneBR(c.phoneE164) || "—" },
            { label: "WhatsApp", value: formatPhoneBR(c.whatsappE164) || "—" },
            { label: "E-mail", value: dash(c.email) },
            { label: "Cidade", value: c.city ? `${c.city}${c.state ? `/${c.state}` : ""}` : "—" },
            { label: "Endereço", value: dash(c.address) },
            { label: "Cargo desejado", value: dash(c.desiredPosition?.name) },
            { label: "Origem", value: SOURCE_LABEL[c.source] },
            { label: "Responsável", value: dash(c.owner?.name) },
            { label: "Etiquetas", value: c.tags.length ? <span className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t.tagId}>{t.tag.name}</Badge>)}</span> : "—" },
          ]} />
        </Panel>

        <Panel title="Contratação" icon={Briefcase}>
          <InfoList items={[
            { label: "Vaga", value: <Link href={`/vagas/${p.job.id}`} className="font-medium hover:underline">{p.job.title}</Link> },
            { label: "Cargo", value: dash(p.job.position?.name) },
            { label: "Loja", value: `${p.job.store.name} · ${p.job.store.city}/${p.job.store.state}` },
            { label: "Endereço da loja", value: dash(p.job.store.address) },
            { label: "Contratação", value: CONTRACT_LABEL[p.job.contractType] },
            { label: "Pretensão salarial", value: p.salaryExpectation ? `R$ ${formatMoneyBR(Number(p.salaryExpectation))}` : "—" },
            { label: "Trabalhando quando se inscreveu", value: p.currentlyEmployed === null ? "—" : p.currentlyEmployed ? "Sim" : "Não" },
            { label: "Inscrição", value: `${formatDate(p.appliedAt)} · ${SOURCE_LABEL[p.source]}` },
            { label: "Contratado em", value: p.hiredAt ? formatDate(p.hiredAt) : "—" },
            { label: "Recrutador", value: dash(p.recruiter?.name) },
            { label: "Currículo", value: p.resume ? <a href={`/api/files/${p.resume.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline"><FilePdf size={15} /> {p.resume.fileName}</a> : "—" },
          ]} />
          {p.applicantMessage && <p className="mt-3 rounded-lg bg-surface p-3 text-[13.5px]"><strong>Mensagem na inscrição:</strong> {p.applicantMessage}</p>}
        </Panel>
      </div>

      {(c.experience || c.introduction) && (
        <Panel title="Experiência e apresentação" icon={ListChecks} className="mt-5">
          {c.experience && <p className="text-[14px] whitespace-pre-line">{c.experience}</p>}
          {c.introduction && <p className="mt-3 text-[14px] whitespace-pre-line text-muted">{c.introduction}</p>}
        </Panel>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Entrevistas e avaliações" icon={CalendarDots}>
          {p.interviews.length === 0 ? <p className="py-4 text-center text-[13px] text-muted">Nenhuma entrevista registrada.</p> : (
            <ul className="divide-y divide-line">
              {p.interviews.map((i) => (
                <li key={i.id} className="py-3 text-[13.5px]">
                  <Link href={`/entrevistas/${i.id}`} className="font-medium hover:underline">{formatDateTime(i.scheduledAt)}</Link>
                  <span className="text-muted"> · {i.mode === "ONLINE" ? "Online" : "Presencial"}{i.interviewer ? ` · ${i.interviewer.name}` : ""}</span>
                  {i.evaluations.map((e) => (
                    <p key={e.id} className="mt-1 text-[13px]">
                      Nota {e.overall}/5 · {RECOMMENDATION_LABEL[e.recommendation]}{e.evaluator ? ` · ${e.evaluator.name}` : ""}{e.comments ? ` — ${e.comments}` : ""}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Histórico no funil" icon={ClockCounterClockwise}>
          <ul className="divide-y divide-line">
            {p.history.map((hs) => (
              <li key={hs.id} className="flex flex-wrap justify-between gap-2 py-2.5 text-[13.5px]">
                <span>{hs.fromStage ? `${hs.fromStage.name} → ` : ""}<strong>{hs.toStage.name}</strong>{hs.note ? <span className="text-muted"> · {hs.note}</span> : null}</span>
                <span className="text-[12px] text-muted">{hs.movedBy?.name ?? "Sistema"} · {formatDateTime(hs.movedAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Observações" icon={ChatText}>
          {c.notes.length === 0 ? <p className="py-4 text-center text-[13px] text-muted">Nenhuma observação.</p> : (
            <ul className="divide-y divide-line">
              {c.notes.map((n) => (
                <li key={n.id} className="py-2.5 text-[13.5px]">
                  <p className="whitespace-pre-line">{n.body}</p>
                  <p className="mt-0.5 text-[12px] text-muted">{n.author?.name ?? "—"} · {formatDateTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Candidaturas" icon={UsersThree}>
          <ul className="divide-y divide-line">
            {c.processes.map((o) => (
              <li key={o.id} className="flex flex-wrap justify-between gap-2 py-2.5 text-[13.5px]">
                <span>{o.job.title} <span className="text-muted">· {o.job.store.name}</span></span>
                <span className="text-[12px] text-muted">{o.stage.name} · {formatDate(o.appliedAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
