import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumb, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { getStore, listStoreManagers, UFS } from "@/server/modules/stores/service";
import { StoreForm } from "../../store-form";
import { notFoundCard } from "@/components/layout/not-found-card";

export const metadata: Metadata = { title: "Editar loja" };

export default function EditStorePage({ params }: PageProps<"/lojas/[id]/editar">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/lojas/[id]/editar">["params"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "stores.manage")) return <NoPermission />;
  const { id } = await params;
  const data = await getStore(actor, id).catch(() => null);
  if (!data) return notFoundCard("Loja não encontrada", "/lojas", "Voltar para lojas");
  return (
    <div className="max-w-3xl">
      <Breadcrumb items={[{ href: "/lojas", label: "Lojas" }, { href: `/lojas/${id}`, label: data.store.name }, { label: "Editar" }]} />
      <PageHeader title={`Editar ${data.store.name}`} />
      <StoreForm store={data.store} managers={await listStoreManagers()} ufs={UFS} />
    </div>
  );
}
