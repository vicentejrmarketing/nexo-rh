import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ModulePending, NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";

export const metadata: Metadata = { title: "Candidatos" };

export default function CandidatosPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "candidates.view")) return <NoPermission />;
  return (
    <>
      <PageHeader title="Candidatos" description="Cadastro completo e perfil individual de cada candidato" />
      <ModulePending
        stage="Etapa 2 — Gestão"
        items={["Cadastro com currículo em PDF em armazenamento privado", "Pesquisa por nome, telefone, e-mail, cargo, loja e status", "Detecção de possíveis duplicados por telefone e e-mail", "Perfil com vagas, histórico, entrevistas, mensagens e avaliações"]}
      />
    </>
  );
}
