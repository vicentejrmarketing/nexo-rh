import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "@phosphor-icons/react/ssr";
import { Alert, PageHeader, PageSkeleton, buttonClass } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { CandidateList } from "@/components/recruitment/candidate-list";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";

export const metadata: Metadata = { title: "Candidatos" };

export default function CandidatesPage({ searchParams }: PageProps<"/candidatos">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/candidatos">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "candidates.view")) return <NoPermission />;
  const sp = await searchParams;
  const newBtn = can(actor, "candidates.create") && <Link href="/candidatos/novo" className={buttonClass("primary")}><Plus size={18} weight="bold" /> Novo candidato</Link>;
  return (
    <>
      <PageHeader title="Candidatos" description="Busque por nome, telefone ou e-mail e filtre por loja, cargo e etapa." actions={newBtn} />
      {sp.anonimizado && <div className="mb-5"><Alert tone="success">Os dados pessoais do candidato foram removidos.</Alert></div>}
      <CandidateList actor={actor} sp={sp} basePath="/candidatos" emptyAction={newBtn || undefined} />
    </>
  );
}
