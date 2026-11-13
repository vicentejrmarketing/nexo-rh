import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, CardHeader, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { NotFoundError } from "@/server/errors";
import { getUser, listAssignableStores, listRoles } from "@/server/modules/users/service";
import { formatDateTime } from "@/lib/format";
import { EditUserForm } from "../user-form";
import { DeleteUserCard, ResetPasswordCard } from "../danger-zone";

export const metadata: Metadata = { title: "Usuário" };

export default function UserPage({ params }: PageProps<"/configuracoes/usuarios/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/configuracoes/usuarios/[id]">["params"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "users.view")) return <NoPermission />;
  const { id } = await params;
  let user;
  try {
    user = await getUser(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) {
      return (
        <Card className="p-8 text-center">
          <p className="font-semibold">Usuário não encontrado</p>
          <Link href="/configuracoes/usuarios" className="mt-2 inline-block text-sm underline">Voltar para usuários</Link>
        </Card>
      );
    }
    throw e;
  }
  const canManage = can(actor, "users.manage");
  const isSelf = user.id === actor.id;

  return (
    <div className="max-w-3xl">
      <nav className="mb-2 text-[13px] text-muted">
        <Link href="/configuracoes" className="hover:text-ink">Configurações</Link> /{" "}
        <Link href="/configuracoes/usuarios" className="hover:text-ink">Usuários</Link> / {user.name}
      </nav>
      <PageHeader
        title={user.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {user.email}
            <Badge tone={user.role.key === "ADMIN" ? "dark" : "neutral"}>{user.role.name}</Badge>
            {user.status === "ACTIVE" ? <Badge tone="success">Ativo</Badge> : <Badge>Inativo</Badge>}
            {isSelf && <Badge tone="brand">Você</Badge>}
          </span>
        }
      />

      <div className="flex flex-col gap-4">
        {canManage ? (
          <>
            <EditUserForm
              roles={await listRoles()}
              stores={await listAssignableStores(actor)}
              existing={{
                id: user.id, name: user.name, email: user.email, phone: user.phone, roleKey: user.role.key,
                status: user.status, storeIds: user.stores.map((s) => s.store.id), isSelf,
              }}
            />
            {!isSelf && <ResetPasswordCard userId={user.id} userName={user.name} />}
            {!isSelf && <DeleteUserCard userId={user.id} />}
          </>
        ) : (
          <Card>
            <CardHeader title="Dados de acesso" />
            <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Telefone</dt><dd>{user.phone || "—"}</dd></div>
              <div><dt className="text-muted">Lojas</dt><dd>{user.stores.map((s) => s.store.name).join(", ") || "Nenhuma"}</dd></div>
            </dl>
          </Card>
        )}
        <p className="text-[12.5px] text-muted">
          Criado em {formatDateTime(user.createdAt)} · Último acesso: {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "nunca"}
        </p>
      </div>
    </div>
  );
}
