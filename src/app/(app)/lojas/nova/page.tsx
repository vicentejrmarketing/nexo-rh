import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumb, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { listStoreManagers, UFS } from "@/server/modules/stores/service";
import { StoreForm } from "../store-form";

export const metadata: Metadata = { title: "Nova loja" };

export default function NewStorePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "stores.manage")) return <NoPermission />;
  return (
    <div className="max-w-3xl">
      <Breadcrumb items={[{ href: "/lojas", label: "Lojas" }, { label: "Nova loja" }]} />
      <PageHeader title="Nova loja" description="Depois de cadastrar, vincule a equipe à loja em Configurações → Usuários." />
      <StoreForm managers={await listStoreManagers()} ufs={UFS} />
    </div>
  );
}
