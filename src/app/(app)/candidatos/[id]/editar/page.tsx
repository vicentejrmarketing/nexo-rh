import { formatCpf } from "@/lib/cpf";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumb, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { notFoundCard } from "@/components/layout/not-found-card";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { ROLES } from "@/server/authz/catalog";
import { SOURCE_LABEL, candidateFormOptions, getCandidateProfile } from "@/server/modules/candidates/service";
import { UFS } from "@/server/modules/stores/service";
import { formatPhoneBR } from "@/lib/phone";
import { CandidateForm } from "../../candidate-form";

export const metadata: Metadata = { title: "Editar candidato" };

export default function EditCandidatePage({ params }: PageProps<"/candidatos/[id]/editar">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/candidatos/[id]/editar">["params"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "candidates.update")) return <NoPermission />;
  const { id } = await params;
  const data = await getCandidateProfile(actor, id).catch(() => null);
  if (!data || data.candidate.anonymizedAt) return notFoundCard("Candidato não encontrado", "/candidatos", "Voltar para candidatos");
  if (!data.canEdit) return <NoPermission />;
  const c = data.candidate;
  const opts = await candidateFormOptions(actor);
  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ href: "/candidatos", label: "Candidatos" }, { href: `/candidatos/${id}`, label: c.fullName }, { label: "Editar" }]} />
      <PageHeader title={`Editar ${c.fullName}`} />
      <CandidateForm
        candidate={{
          id: c.id, fullName: c.fullName, cpf: formatCpf(c.cpf), phone: formatPhoneBR(c.phoneE164), whatsapp: formatPhoneBR(c.whatsappE164), email: c.email, city: c.city, state: c.state,
          address: c.address, desiredPositionId: c.desiredPositionId, desiredStoreId: c.desiredStoreId, source: c.source, experience: c.experience,
          introduction: c.introduction, ownerId: c.ownerId,
        }}
        stores={opts.stores}
        positions={opts.positions}
        owners={opts.owners}
        jobs={[]}
        sources={Object.entries(SOURCE_LABEL)}
        ufs={UFS}
        storageReady
        ownerLocked={ROLES[actor.roleKey].ownRecordsOnly}
      />
    </div>
  );
}
