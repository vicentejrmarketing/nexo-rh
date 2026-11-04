import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ModulePending, NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";

export const metadata: Metadata = { title: "Entrevistas" };

export default function EntrevistasPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "interviews.view")) return <NoPermission />;
  return (
    <>
      <PageHeader title="Entrevistas" description="Calendário e avaliações das entrevistas" />
      <ModulePending
        stage="Etapa 3 — Recrutamento"
        items={["Calendário diário, semanal e mensal", "Agendar, reagendar e cancelar, online ou presencial", "Avaliação estruturada e observações", "Alertas de entrevistas próximas"]}
      />
    </>
  );
}
