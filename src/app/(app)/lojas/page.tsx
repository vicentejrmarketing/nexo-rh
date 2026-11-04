import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ModulePending, NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";

export const metadata: Metadata = { title: "Lojas" };

export default function LojasPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "stores.view")) return <NoPermission />;
  return (
    <>
      <PageHeader title="Lojas" description="Unidades da empresa e seus indicadores" />
      <ModulePending
        stage="Etapa 2 — Gestão"
        items={["Cadastro de lojas com responsável e quantidade de funcionários", "Página da loja com vagas, candidatos, entrevistas e contratações", "Ranking de desempenho das lojas"]}
      />
    </>
  );
}
