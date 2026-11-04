import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { db } from "@/server/db/client";

export const metadata: Metadata = { title: "Etapas do funil" };

const KIND = {
  OPEN: { label: "Em andamento", tone: "neutral" },
  HIRED: { label: "Final · contratação", tone: "success" },
  REJECTED: { label: "Final · reprovação", tone: "danger" },
  WITHDRAWN: { label: "Final · desistência", tone: "warning" },
} as const;

export default function StagesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "settings.manage") && !can(actor, "pipeline.view")) return <NoPermission />;
  const [stages, settings] = await Promise.all([
    db.recruitmentStage.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    db.companySettings.findUnique({ where: { id: "default" }, select: { stalledDays: true } }),
  ]);
  return (
    <div className="max-w-3xl">
      <nav className="mb-2 text-[13px] text-muted">
        <Link href="/configuracoes" className="hover:text-ink">Configurações</Link> / Etapas do funil
      </nav>
      <PageHeader title="Etapas do funil" description="Etapas usadas no Kanban. A edição de nomes, ordem e prazos de alerta chega com o funil, na Etapa 3." />
      <Card>
        <ol className="divide-y divide-line">
          {stages.map((s, i) => (
            <li key={s.id} className="flex items-center gap-4 px-5 py-3.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-brand tabular">{i + 1}</span>
              <span className="flex-1 font-medium">{s.name}</span>
              <span className="text-[12.5px] text-muted">
                {s.kind === "OPEN" ? `Alerta após ${s.stalledDays ?? settings?.stalledDays ?? 3} dia(s) parado` : ""}
              </span>
              <Badge tone={KIND[s.kind].tone}>{KIND[s.kind].label}</Badge>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
