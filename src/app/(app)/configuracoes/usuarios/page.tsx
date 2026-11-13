import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus, Search, Users } from "lucide-react";
import { Alert, Badge, Card, EmptyState, Input, PageHeader, PageSkeleton, Select, buttonClass } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { listRoles, listUsers } from "@/server/modules/users/service";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Usuários" };

export default function UsersPage({ searchParams }: PageProps<"/configuracoes/usuarios">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

async function Content({ searchParams }: { searchParams: PageProps<"/configuracoes/usuarios">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "users.view")) return <NoPermission />;
  const sp = await searchParams;
  const filters = { q: one(sp.q), roleKey: one(sp.perfil), status: one(sp.situacao) };
  const [users, roles] = await Promise.all([listUsers(actor, filters), listRoles()]);
  const canManage = can(actor, "users.manage");
  const filtered = Boolean(filters.q || filters.roleKey || filters.status);

  return (
    <>
      <nav className="mb-2 text-[13px] text-muted">
        <Link href="/configuracoes" className="hover:text-ink">Configurações</Link> / Usuários
      </nav>
      <PageHeader
        title="Usuários"
        description={canManage ? "Crie acessos, defina perfis e lojas, e gere senhas temporárias." : "Usuários das lojas que você acompanha."}
        actions={
          canManage && (
            <Link href="/configuracoes/usuarios/novo" className={buttonClass("primary")}>
              <Plus size={18} /> Novo usuário
            </Link>
          )
        }
      />
      {one(sp.excluido) && (
        <div className="mb-4">
          <Alert tone="success">Usuário excluído.</Alert>
        </div>
      )}

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-line p-4" role="search">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute top-3 left-3 text-muted" />
            <Input name="q" defaultValue={filters.q} placeholder="Buscar por nome ou e-mail" aria-label="Buscar" className="pl-9" />
          </div>
          <Select name="perfil" defaultValue={filters.roleKey ?? ""} aria-label="Perfil" className="w-auto min-w-[170px]">
            <option value="">Todos os perfis</option>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>{r.name}</option>
            ))}
          </Select>
          <Select name="situacao" defaultValue={filters.status ?? ""} aria-label="Situação" className="w-auto min-w-[140px]">
            <option value="">Todas as situações</option>
            <option value="ACTIVE">Ativos</option>
            <option value="INACTIVE">Inativos</option>
          </Select>
          <button type="submit" className={buttonClass("dark")}>Filtrar</button>
          {filtered && <Link href="/configuracoes/usuarios" className={buttonClass("ghost")}>Limpar</Link>}
        </form>

        {users.length === 0 ? (
          <EmptyState icon={<Users size={20} />} title={filtered ? "Nenhum usuário encontrado" : "Nenhum usuário"}>
            {filtered ? "Ajuste os filtros da busca." : "Crie o primeiro usuário da equipe."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line text-[12px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Nome</th>
                  <th className="px-5 py-3 font-medium">Perfil</th>
                  <th className="px-5 py-3 font-medium">Lojas</th>
                  <th className="px-5 py-3 font-medium">Último acesso</th>
                  <th className="px-5 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-surface/60">
                    <td className="px-5 py-3">
                      <Link href={`/configuracoes/usuarios/${u.id}`} className="font-medium text-ink hover:underline hover:decoration-brand hover:decoration-2 hover:underline-offset-4">
                        {u.name}
                      </Link>
                      <p className="text-[12.5px] text-muted">{u.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={u.role.key === "ADMIN" ? "dark" : "neutral"}>{u.role.name}</Badge>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-muted">
                      {u.role.key === "ADMIN"
                        ? "Todas"
                        : u.stores.length === 0
                          ? "Nenhuma"
                          : u.stores.length <= 2
                            ? u.stores.map((s) => s.store.name).join(", ")
                            : `${u.stores.length} lojas`}
                    </td>
                    <td className="px-5 py-3 text-[13px] text-muted tabular">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : u.mustChangePassword ? "Aguardando 1º acesso" : "—"}
                    </td>
                    <td className="px-5 py-3">
                      {u.status === "ACTIVE" ? <Badge tone="success">Ativo</Badge> : <Badge>Inativo</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-2 text-[12.5px] text-muted">{users.length} usuário(s)</p>
    </>
  );
}
