import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { listAssignableStores, listRoles } from "@/server/modules/users/service";
import { CreateUserForm } from "../user-form";

export const metadata: Metadata = { title: "Novo usuário" };

export default function NewUserPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "users.manage")) return <NoPermission />;
  const [roles, stores] = await Promise.all([listRoles(), listAssignableStores(actor)]);
  return (
    <div className="max-w-3xl">
      <nav className="mb-2 text-[13px] text-muted">
        <Link href="/configuracoes" className="hover:text-ink">Configurações</Link> /{" "}
        <Link href="/configuracoes/usuarios" className="hover:text-ink">Usuários</Link> / Novo
      </nav>
      <PageHeader title="Novo usuário" description="O sistema gera uma senha temporária, trocada pela pessoa no primeiro acesso." />
      <CreateUserForm roles={roles} stores={stores} />
    </div>
  );
}
