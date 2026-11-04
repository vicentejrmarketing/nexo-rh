import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ModulePending, NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";

export const metadata: Metadata = { title: "Vagas" };

export default function VagasPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "jobs.view")) return <NoPermission />;
  return (
    <>
      <PageHeader title="Vagas" description="Cadastro, edição, pausa, encerramento e duplicação de vagas" />
      <ModulePending
        stage="Etapa 2 — Gestão"
        items={["Criar, editar, abrir, pausar, encerrar, duplicar e excluir vagas com confirmação", "Página individual da vaga com andamento e indicadores", "Candidatos vinculados a cada vaga"]}
      />
    </>
  );
}
