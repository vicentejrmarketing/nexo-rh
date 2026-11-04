import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { db } from "@/server/db/client";
import { StageRow } from "./stage-row";

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
  const canEdit = can(actor, "settings.manage");
  return (
    <div className="max-w-4xl">
      <nav className="mb-2 text-[13px] text-muted">
        <Link href="/configuracoes" className="hover:text-ink">Configurações</Link> / Etapas do funil
      </nav>
      <PageHeader title="Etapas do funil" description="Etapas do Kanban. Dá para renomear e ajustar em quantos dias sem movimentação o candidato conta como parado; em branco, usa o padrão da empresa." />
      <Card>
        <ol className="divide-y divide-line">
          {stages.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-brand tabular">{i + 1}</span>
              {canEdit ? (
                <StageRow stage={{ id: s.id, name: s.name, kind: s.kind, stalledDays: s.stalledDays }} defaultDays={settings?.stalledDays ?? 3} />
              ) : (
                <>
                  <span className="flex-1 font-medium">{s.name}</span>
                  <span className="text-[12.5px] text-muted">{s.kind === "OPEN" ? `Alerta após ${s.stalledDays ?? settings?.stalledDays ?? 3} dia(s) parado` : ""}</span>
                </>
              )}
              <Badge tone={KIND[s.kind].tone}>{KIND[s.kind].label}</Badge>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
