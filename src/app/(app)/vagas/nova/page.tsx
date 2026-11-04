import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumb, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { jobFormOptions } from "@/server/modules/jobs/service";
import { JobForm } from "../job-form";

export const metadata: Metadata = { title: "Nova vaga" };

export default function NewJobPage({ searchParams }: PageProps<"/vagas/nova">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/vagas/nova">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "jobs.create")) return <NoPermission />;
  const { loja } = await searchParams;
  const opts = await jobFormOptions(actor);
  const storeId = typeof loja === "string" && opts.stores.some((s) => s.id === loja) ? loja : undefined;
  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ href: "/vagas", label: "Vagas" }, { label: "Nova vaga" }]} />
      <PageHeader title="Nova vaga" description="A vaga abre na hora para vincular candidatos — ou salve como rascunho." />
      <JobForm stores={opts.stores} positions={opts.positions} recruiters={opts.recruiters.map((r) => ({ id: r.id, name: r.name, role: r.role.name }))} defaultStoreId={storeId} />
    </div>
  );
}
