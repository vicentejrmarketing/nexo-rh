import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ShieldCheck } from "@phosphor-icons/react/ssr";
import { Badge, Breadcrumb, Card, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { listPrivacyRequests } from "@/server/modules/portal/admin";
import { formatDateTime } from "@/lib/format";
import { formatPhoneBR } from "@/lib/phone";
import { resolvePrivacyAction } from "../actions";

export const metadata: Metadata = { title: "Pedidos de privacidade" };

export default function PrivacyRequestsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "privacy.manage")) return <NoPermission />;
  const items = await listPrivacyRequests(actor);
  return (
    <>
      <Breadcrumb items={[{ href: "/site-de-vagas", label: "Site de vagas" }, { label: "Pedidos de privacidade" }]} />
      <PageHeader title="Pedidos de exclusão de dados" description="Enviados pelo site. Confira se os dados batem com o cadastro antes de anonimizar." />
      <Card>
        {items.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={20} weight="fill" />} title="Nenhum pedido recebido">Os pedidos feitos em Trabalhe conosco → Privacidade aparecem aqui.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 p-5 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {r.fullName}
                    {r.status === "OPEN" ? <Badge tone="warning">Aguardando</Badge> : r.status === "DONE" ? <Badge tone="success">Concluído</Badge> : <Badge>Recusado</Badge>}
                  </p>
                  <p className="text-[13px] text-muted">{[formatPhoneBR(r.phoneE164), r.email].filter(Boolean).join(" · ") || "Contatos removidos após o atendimento"} · {formatDateTime(r.createdAt)}</p>
                  {r.message && <p className="mt-1 text-[13.5px] whitespace-pre-line">{r.message}</p>}
                  <p className="mt-1 text-[13px]">
                    {r.candidate ? (
                      r.candidate.anonymizedAt ? <span className="text-muted">Cadastro já anonimizado.</span> : <>Cadastro encontrado: <Link href={`/candidatos/${r.candidate.id}`} className="font-semibold underline underline-offset-4">{r.candidate.fullName}</Link></>
                    ) : (
                      <span className="text-muted">Nenhum cadastro com esses dados.</span>
                    )}
                  </p>
                  {r.handledBy && <p className="text-[12px] text-muted">Tratado por {r.handledBy.name} em {formatDateTime(r.handledAt)}</p>}
                </div>
                {r.status === "OPEN" && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {r.candidate && !r.candidate.anonymizedAt ? (
                      <ConfirmAction label="Anonimizar cadastro" size="sm" confirmLabel="Anonimizar" question="Remover nome, contatos, currículo e observações deste candidato? Não dá para desfazer." action={resolvePrivacyAction.bind(null, r.id, "anonymize")} />
                    ) : (
                      <ConfirmAction label="Marcar como concluído" size="sm" variant="secondary" question="Concluir o pedido sem cadastro para anonimizar?" action={resolvePrivacyAction.bind(null, r.id, "done")} />
                    )}
                    <ConfirmAction label="Recusar" size="sm" variant="secondary" question="Recusar o pedido (ex.: não foi possível confirmar a identidade)?" action={resolvePrivacyAction.bind(null, r.id, "reject")} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
