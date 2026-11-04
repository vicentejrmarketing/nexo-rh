import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumb, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { listPositions } from "@/server/modules/settings/service";
import { PositionsManager } from "./positions-manager";

export const metadata: Metadata = { title: "Cargos" };

export default function PositionsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "settings.manage")) return <NoPermission />;
  const positions = await listPositions();
  return (
    <div className="max-w-3xl">
      <Breadcrumb items={[{ href: "/configuracoes", label: "Configurações" }, { label: "Cargos" }]} />
      <PageHeader title="Cargos" description="Usados nas vagas e no cargo desejado dos candidatos. Cargo em uso pode ser desativado, mas não excluído." />
      <PositionsManager positions={positions.map((p) => ({ id: p.id, name: p.name, description: p.description, area: p.area, active: p.active, uses: p._count.jobs + p._count.desiredByCandidates }))} />
    </div>
  );
}
