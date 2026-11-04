import type { Metadata } from "next";
import { Suspense } from "react";
import { Alert, Breadcrumb, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { notFoundCard } from "@/components/layout/not-found-card";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { CONTRACT_LABEL, getJob, jobFormOptions } from "@/server/modules/jobs/service";
import { dayKey } from "@/lib/period";
import { JobForm } from "../../job-form";

export const metadata: Metadata = { title: "Editar vaga" };

export default function EditJobPage({ params, searchParams }: PageProps<"/vagas/[id]/editar">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: { params: PageProps<"/vagas/[id]/editar">["params"]; searchParams: PageProps<"/vagas/[id]/editar">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "jobs.update")) return <NoPermission />;
  const { id } = await params;
  const sp = await searchParams;
  const data = await getJob(actor, id).catch(() => null);
  if (!data) return notFoundCard("Vaga não encontrada", "/vagas", "Voltar para vagas");
  if (!data.canEdit) return <NoPermission />;
  const { job } = data;
  const opts = await jobFormOptions(actor);
  // A loja atual entra na lista mesmo se estiver inativa, para não perder o vínculo.
  const stores = opts.stores.some((s) => s.id === job.storeId) ? opts.stores : [{ id: job.store.id, name: job.store.name, city: job.store.city }, ...opts.stores];
  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ href: "/vagas", label: "Vagas" }, { href: `/vagas/${id}`, label: job.title }, { label: "Editar" }]} />
      <PageHeader title={`Editar ${job.title}`} />
      {sp.duplicada && <div className="mb-5"><Alert tone="brand" title="Cópia criada como rascunho">Ajuste o que for preciso e publique pela página da vaga.</Alert></div>}
      <JobForm
        job={{
          id: job.id, title: job.title, description: job.description, requirements: job.requirements,
          salaryMin: job.salaryMin?.toString() ?? null, salaryMax: job.salaryMax?.toString() ?? null, salaryText: job.salaryText, benefits: job.benefits,
          openings: job.openings, storeId: job.storeId, positionId: job.positionId, city: job.city, recruiterId: job.recruiterId,
          priority: job.priority, expectedCloseAt: job.expectedCloseAt ? dayKey(job.expectedCloseAt) : null, publishedOnline: job.publishedOnline, status: job.status,
          responsibilities: job.responsibilities, contractType: job.contractType, showSalary: job.showSalary,
        }}
        stores={stores}
        contracts={CONTRACT_LABEL}
        positions={opts.positions}
        recruiters={opts.recruiters.map((r) => ({ id: r.id, name: r.name, role: r.role.name }))}
      />
    </div>
  );
}
