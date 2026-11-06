import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumb, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { notFoundCard } from "@/components/layout/not-found-card";
import { JobProfileForm } from "@/components/behavioral/job-profile-form";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { getJobProfile } from "@/server/modules/behavioral/service";
import { COMPETENCIES } from "@/server/modules/behavioral/questionnaire";
import { JOB_TEMPLATES } from "@/server/modules/behavioral/matrix";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Perfil comportamental da vaga" };

export default function JobProfilePage({ params }: PageProps<"/vagas/[id]/perfil-comportamental">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/vagas/[id]/perfil-comportamental">["params"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "behavioral.view")) return <NoPermission />;
  const { id } = await params;
  const data = await getJobProfile(actor, id).catch(() => null);
  if (!data) return notFoundCard("Vaga não encontrada", "/vagas", "Voltar para vagas");
  return (
    <>
      <Breadcrumb items={[{ href: "/vagas", label: "Vagas" }, { href: `/vagas/${id}`, label: data.job.title }, { label: "Perfil comportamental" }]} />
      <PageHeader
        title="Perfil comportamental da vaga"
        description={`${data.job.title} · ${data.job.store.name}. Pesos das competências usados na nota geral e na compatibilidade do teste comportamental.`}
      />
      <JobProfileForm
        jobId={id}
        competencies={COMPETENCIES.map((c) => ({ key: c.key, name: c.name }))}
        templates={JOB_TEMPLATES.map((t) => ({ key: t.key, name: t.name, weights: t.weights, essentials: t.essentials }))}
        current={data.profile}
        updated={data.updatedAt ? `Última alteração: ${data.updatedBy ?? "—"} em ${formatDateTime(data.updatedAt)}` : "Ainda com o padrão (pesos iguais)."}
      />
    </>
  );
}
