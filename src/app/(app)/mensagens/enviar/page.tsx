import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle, GearSix } from "@phosphor-icons/react/ssr";
import { PageHeader, PageSkeleton, buttonClass } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { MessagesTabs } from "@/components/messages/tabs";
import { QueueItem, type QueueRow } from "@/components/messages/queue";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { pendingQueue } from "@/server/modules/automations/service";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Mensagens para enviar" };

export default function SendQueuePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "messages.send")) return <NoPermission />;
  const q = await pendingQueue(actor);
  const toRow = (d: (typeof q.ready)[number]): QueueRow => ({
    id: d.id, rule: d.rule.name, candidateId: d.candidateJob.candidate.id, candidate: d.candidateJob.candidate.fullName, job: d.candidateJob.job.title,
    stage: d.candidateJob.stage.name, phone: d.eval.phone, body: d.eval.body, reason: d.reason, dueAt: d.dueAt.toISOString(),
    interview: d.interview ? formatDateTime(d.interview.scheduledAt) : null,
    fixHref: d.interview ? `/entrevistas/${d.interview.id}` : d.rule.event.startsWith("interview:") ? `/entrevistas/nova?processo=${d.candidateJobId}` : `/candidatos/${d.candidateJob.candidate.id}/editar`,
  });
  return (
    <>
      <PageHeader
        title="Mensagens"
        description="Mensagens automáticas prontas: clique, o WhatsApp abre com o texto e você só confirma o envio."
        actions={can(actor, "templates.manage") && <Link href="/configuracoes/automacoes" className={buttonClass("secondary")}><GearSix size={17} /> Configurar</Link>}
      />
      <MessagesTabs active="enviar" pending={q.ready.length} />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section aria-label="Prontas para enviar">
          <h2 className="mb-3 text-[16px] font-bold">Prontas para enviar <span className="text-muted">({q.ready.length})</span></h2>
          {q.ready.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line bg-white px-6 py-12 text-center">
              <CheckCircle size={32} weight="fill" className="text-success" />
              <p className="font-semibold">Tudo em dia</p>
              <p className="text-[13.5px] text-muted">Novas mensagens aparecem aqui quando um candidato se inscreve, muda de etapa ou tem entrevista.{q.upcoming ? ` ${q.upcoming} lembrete(s) agendado(s) aparecerão na hora certa.` : ""}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">{q.ready.map((d) => <QueueItem key={d.id} row={toRow(d)} />)}</ul>
          )}
        </section>
        <aside className="flex flex-col gap-3">
          <h2 className="text-[16px] font-bold">Falta informação <span className="text-muted">({q.blocked.length})</span></h2>
          {q.blocked.length === 0 ? (
            <p className="rounded-[var(--radius-card)] bg-white px-4 py-6 text-center text-[13px] text-muted">Nenhuma mensagem parada por dado faltando.</p>
          ) : (
            <ul className="flex flex-col gap-3">{q.blocked.map((d) => <QueueItem key={d.id} row={toRow(d)} blocked />)}</ul>
          )}
          <p className="text-[12px] text-muted">Mensagens com data, horário, link ou endereço faltando nunca são enviadas. Corrija e elas voltam sozinhas para a fila.</p>
        </aside>
      </div>
    </>
  );
}
