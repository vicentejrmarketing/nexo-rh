import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumb, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { ROLES } from "@/server/authz/catalog";
import { SOURCE_LABEL, candidateFormOptions, openJobsForLinking } from "@/server/modules/candidates/service";
import { UFS } from "@/server/modules/stores/service";
import { storageReady } from "@/server/storage";
import { CandidateForm } from "../candidate-form";

export const metadata: Metadata = { title: "Novo candidato" };

export default function NewCandidatePage({ searchParams }: PageProps<"/candidatos/novo">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/candidatos/novo">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "candidates.create")) return <NoPermission />;
  const { vaga } = await searchParams;
  const [opts, jobs] = await Promise.all([candidateFormOptions(actor), openJobsForLinking(actor)]);
  const ownerLocked = ROLES[actor.roleKey].ownRecordsOnly;
  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ href: "/candidatos", label: "Candidatos" }, { label: "Novo candidato" }]} />
      <PageHeader title="Novo candidato" description="O sistema avisa se já existir alguém com o mesmo telefone ou e-mail." />
      <CandidateForm
        stores={opts.stores}
        positions={opts.positions}
        owners={opts.owners}
        jobs={jobs.map((j) => ({ id: j.id, name: j.title, store: j.store.name }))}
        sources={Object.entries(SOURCE_LABEL)}
        ufs={UFS}
        defaultJobId={typeof vaga === "string" && jobs.some((j) => j.id === vaga) ? vaga : undefined}
        defaultOwnerId={ownerLocked || !actor.allStores ? actor.id : undefined}
        storageReady={storageReady()}
        ownerLocked={ownerLocked}
      />
    </div>
  );
}
