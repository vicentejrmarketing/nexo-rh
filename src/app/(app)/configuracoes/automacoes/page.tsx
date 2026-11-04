import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert, Badge, Breadcrumb, Card, CardHeader, PageHeader, PageSkeleton, Select, buttonClass } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { RequeueButton } from "@/components/messages/queue";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { DISPATCH_STATUS_LABEL, dispatchHistory, listRules } from "@/server/modules/automations/service";
import { VARIABLES, fromMetaFormat } from "@/server/modules/messages/templates";
import { formatDateTime } from "@/lib/format";
import { AddReminder, RuleCard, type RuleView } from "./rules";

export const metadata: Metadata = { title: "Mensagens automáticas" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const HINT: Record<string, string> = {
  "stage:applied": "Quando o candidato se inscreve pelo site ou é vinculado a uma vaga.",
  "stage:contacted": "Quando o candidato vai para Contato iniciado.",
  "interview:online": "Quando uma entrevista online é agendada (precisa de data, horário e link).",
  "interview:in_person": "Quando uma entrevista presencial é agendada (precisa de data, horário e endereço).",
  "interview:rescheduled": "Quando uma entrevista já avisada muda de horário.",
  "interview:canceled": "Quando uma entrevista já avisada é cancelada.",
  "stage:trial": "Quando o candidato vai para Em teste.",
  "stage:approved": "Quando o candidato vai para Aprovados.",
  "stage:hired": "Quando o candidato vai para Contratados.",
  "stage:rejected": "Quando o candidato vai para Reprovados.",
  "stage:withdrawn": "Quando o candidato vai para Desistentes. Use só se fizer sentido para a sua equipe.",
};
const TONE = { PENDING: "brand", BLOCKED: "warning", SENT: "success", SKIPPED: "neutral", CANCELED: "neutral" } as const;

export default function AutomationsPage({ searchParams }: PageProps<"/configuracoes/automacoes">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/configuracoes/automacoes">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "templates.manage")) return <NoPermission />;
  const sp = await searchParams;
  const status = one(sp.situacao);
  const [rules, history] = await Promise.all([listRules(actor), dispatchHistory(actor, { status })]);
  const vars = Object.entries(VARIABLES).map(([key, v]) => ({ key, label: v.label, example: v.example }));
  const view = (r: (typeof rules)[number]): RuleView => ({
    id: r.id, event: r.event, name: r.name, enabled: r.enabled, offsetMinutes: r.offsetMinutes, sent: r._count.dispatches,
    text: r.template ? fromMetaFormat(r.template.body, (r.template.variables as string[] | null) ?? []) : "",
    hint: HINT[r.event] ?? (r.event.startsWith("reminder:") ? "Antes de cada entrevista agendada. Some se a entrevista for cancelada ou remarcada." : ""),
  });
  const active = rules.filter((r) => r.enabled || !r.event.startsWith("reminder:"));
  const groups = [
    { title: "Funil de recrutamento", items: active.filter((r) => r.event.startsWith("stage:")) },
    { title: "Entrevistas", items: active.filter((r) => r.event.startsWith("interview:")) },
    { title: "Lembretes de entrevista", items: active.filter((r) => r.event.startsWith("reminder:")) },
  ];

  return (
    <div className="max-w-5xl">
      <Breadcrumb items={[{ href: "/configuracoes", label: "Configurações" }, { label: "Mensagens automáticas" }]} />
      <PageHeader title="Mensagens automáticas" description="Cada evento do processo gera uma mensagem pronta na fila Para enviar. O recrutador clica e o WhatsApp abre com o texto — sem custo." />
      <div className="mb-5">
        <Alert tone="brand" title="Como funciona">
          Cada candidatura recebe no máximo uma mensagem por evento. Mensagens com data, horário, link ou endereço faltando ficam paradas e o recrutador é avisado.
          Candidatos que pediram para não receber mensagens nunca entram na fila. <Link href="/mensagens/enviar" className="font-semibold underline">Abrir a fila</Link>
        </Alert>
      </div>

      <div className="flex flex-col gap-6">
        {groups.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 text-[16px] font-bold">{g.title}</h2>
            <ul className="flex flex-col gap-3">{g.items.map((r) => <RuleCard key={r.id} rule={view(r)} vars={vars} />)}</ul>
            {g.title.startsWith("Lembretes") && <div className="mt-3"><AddReminder existing={g.items.map((r) => r.offsetMinutes ?? 0)} /></div>}
          </section>
        ))}

        <Card>
          <CardHeader
            title="Histórico de envios"
            action={
              <form className="flex gap-2">
                <Select name="situacao" defaultValue={status ?? ""} aria-label="Situação" className="h-9 w-auto text-[13px]">
                  <option value="">Todas</option>
                  {Object.entries(DISPATCH_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                <button className={buttonClass("dark", "sm")}>Filtrar</button>
              </form>
            }
          />
          {history.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">Nenhuma mensagem automática ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-line text-[12px] tracking-wide text-muted uppercase">
                  <tr><th className="px-5 py-3 font-medium">Candidato</th><th className="px-5 py-3 font-medium">Mensagem</th><th className="px-5 py-3 font-medium">Situação</th><th className="px-5 py-3 font-medium">Quando</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {history.map((h) => (
                    <tr key={h.id} className="align-top">
                      <td className="px-5 py-3"><Link href={`/candidatos/${h.candidateJob.candidate.id}`} className="font-medium hover:underline">{h.candidateJob.candidate.fullName}</Link><p className="text-[12px] text-muted">{h.candidateJob.job.title}</p></td>
                      <td className="px-5 py-3 text-[13px]">{h.rule.name}</td>
                      <td className="px-5 py-3">
                        <Badge tone={TONE[h.status]}>{DISPATCH_STATUS_LABEL[h.status]}</Badge>
                        {h.reason && <p className="mt-1 text-[12px] text-muted">{h.reason}</p>}
                        {(h.status === "SKIPPED" || h.status === "CANCELED") && <div className="mt-1"><RequeueButton id={h.id} /></div>}
                      </td>
                      <td className="px-5 py-3 text-[12.5px] text-muted">{h.status === "SENT" ? `${formatDateTime(h.sentAt)} · ${h.sentBy?.name ?? ""}` : formatDateTime(h.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
