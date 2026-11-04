import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ModulePending, NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";

export const metadata: Metadata = { title: "Banco de Talentos" };

export default function BancoDeTalentosPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "talentpool.view")) return <NoPermission />;
  return (
    <>
      <PageHeader title="Banco de Talentos" description="Base permanente de candidatos, com consentimento e retenção" />
      <ModulePending
        stage="Etapa 2 — Gestão"
        items={["Pesquisa e filtros por cidade, cargo e experiência", "Etiquetas, observações e vínculo a novas vagas", "Consentimento, prazo de retenção e anonimização (LGPD)"]}
      />
    </>
  );
}
