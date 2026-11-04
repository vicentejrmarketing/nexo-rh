import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ModulePending, NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";

export const metadata: Metadata = { title: "Relatórios" };

export default function RelatoriosPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "reports.view")) return <NoPermission />;
  return (
    <>
      <PageHeader title="Relatórios" description="Relatórios dinâmicos com exportação" />
      <ModulePending
        stage="Etapa 6 — Inteligência"
        items={["Candidatos e contratações por período, loja e recrutador", "Tempo médio de contratação, conversão do funil e taxas", "Origem dos candidatos e produtividade dos recrutadores", "Exportação em PDF e Excel"]}
      />
    </>
  );
}
