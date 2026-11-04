import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ModulePending, NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";

export const metadata: Metadata = { title: "Mensagens" };

export default function MensagensPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "messages.view")) return <NoPermission />;
  return (
    <>
      <PageHeader title="Mensagens" description="Central de atendimento integrada ao WhatsApp oficial (Meta Cloud API)" />
      <ModulePending
        stage="Etapa 4 — Comunicação"
        items={["Lista de conversas, histórico e dados do candidato em 3 colunas", "Envio e recebimento pela API oficial, com status de entrega", "Modelos de mensagens e regras da janela de 24 h", "Pesquisa e filtro por responsável"]}
      />
    </>
  );
}
