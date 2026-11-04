import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert, Badge, Card, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { ADMIN_LOCKED } from "@/server/authz/catalog";
import { getPermissionMatrix } from "@/server/modules/users/service";
import { PermissionToggle } from "./permission-toggle";

export const metadata: Metadata = { title: "Permissões" };

export default function PermissionsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "users.view") && !can(actor, "permissions.manage")) return <NoPermission />;
  const { roles, permissions, canEdit } = await getPermissionMatrix(actor);
  const modules = [...new Set(permissions.map((p) => p.module))];

  return (
    <>
      <nav className="mb-2 text-[13px] text-muted">
        <Link href="/configuracoes" className="hover:text-ink">Configurações</Link> / Permissões
      </nav>
      <PageHeader title="Permissões" description="O que cada perfil pode ver e fazer. A regra é verificada no servidor em cada ação." />
      <div className="mb-4">
        <Alert tone="brand">
          Além das permissões abaixo, o acesso é limitado pelas <strong>lojas atribuídas</strong> a cada usuário (exceto Administrador) e o
          Recrutador vê apenas os processos sob a sua responsabilidade. {canEdit ? "Alterações valem a partir da próxima página aberta pelo usuário." : ""}
        </Alert>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-line">
              <th className="px-5 py-3 text-left text-[12px] font-medium tracking-wide text-muted uppercase">Permissão</th>
              {roles.map((r) => (
                <th key={r.key} className="w-36 px-3 py-3 text-center">
                  <span className="block text-[13px] font-semibold text-ink">{r.name}</span>
                  <span className="text-[11.5px] font-normal text-muted">{r.allStores ? "Todas as lojas" : "Lojas atribuídas"}</span>
                </th>
              ))}
            </tr>
          </thead>
          {modules.map((m) => (
            <tbody key={m} className="border-b border-line last:border-0">
              <tr>
                <th colSpan={roles.length + 1} className="bg-surface px-5 py-2 text-left text-[12px] font-semibold tracking-wide text-ink uppercase">
                  {m}
                </th>
              </tr>
              {permissions
                .filter((p) => p.module === m)
                .map((p) => (
                  <tr key={p.key} className="border-t border-line/70">
                    <td className="px-5 py-2.5 text-ink">{p.description}</td>
                    {roles.map((r) => {
                      const granted = r.granted.includes(p.key);
                      const locked = r.key === "ADMIN" && (ADMIN_LOCKED as string[]).includes(p.key);
                      return (
                        <td key={r.key} className="px-3 py-2.5 text-center">
                          {canEdit && !locked ? (
                            <PermissionToggle roleKey={r.key} roleName={r.name} permissionKey={p.key} description={p.description} granted={granted} />
                          ) : granted ? (
                            <Badge tone="dark">Sim</Badge>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </Card>
    </>
  );
}
