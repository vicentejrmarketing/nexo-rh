import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ModulePending, NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";

export const metadata: Metadata = { title: "Funil de Recrutamento" };

export default function FunilPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "pipeline.view")) return <NoPermission />;
  return (
    <>
      <PageHeader title="Funil de Recrutamento" description="Kanban das 9 etapas do processo seletivo" />
      <ModulePending
        stage="Etapa 3 — Recrutamento"
        items={["Arrastar candidatos entre as etapas com observação", "Histórico automático: etapa anterior, nova, data, hora e usuário", "Filtros por loja, vaga, recrutador e período", "Alertas de candidatos sem movimentação"]}
      />
    </>
  );
}
