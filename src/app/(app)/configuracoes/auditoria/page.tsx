import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { History, Search } from "lucide-react";
import { Card, EmptyState, Input, PageHeader, PageSkeleton, buttonClass } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { listActivity } from "@/server/modules/audit/service";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Histórico de atividades" };

export default function AuditPage({ searchParams }: PageProps<"/configuracoes/auditoria">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/configuracoes/auditoria">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "audit.view")) return <NoPermission />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const page = Number(typeof sp.pagina === "string" ? sp.pagina : 1) || 1;
  const { items, total, pageCount } = await listActivity(actor, { q, page });
  const link = (p: number) => `/configuracoes/auditoria?${new URLSearchParams({ ...(q ? { q } : {}), pagina: String(p) })}`;

  return (
    <>
      <nav className="mb-2 text-[13px] text-muted">
        <Link href="/configuracoes" className="hover:text-ink">Configurações</Link> / Histórico de atividades
      </nav>
      <PageHeader
        title="Histórico de atividades"
        description={actor.allStores ? "Todas as ações registradas no sistema." : "Ações nas suas lojas e as suas próprias ações."}
      />
      <Card>
        <form className="flex gap-3 border-b border-line p-4" role="search">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute top-3 left-3 text-muted" />
            <Input name="q" defaultValue={q} placeholder="Buscar na descrição" aria-label="Buscar" className="pl-9" />
          </div>
          <button type="submit" className={buttonClass("dark")}>Buscar</button>
        </form>
        {items.length === 0 ? (
          <EmptyState icon={<History size={20} />} title="Nenhuma atividade encontrada" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-[12px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Data e hora</th>
                  <th className="px-5 py-3 font-medium">Usuário</th>
                  <th className="px-5 py-3 font-medium">Ação</th>
                  <th className="px-5 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((a) => (
                  <tr key={a.id}>
                    <td className="px-5 py-3 whitespace-nowrap text-muted tabular">{formatDateTime(a.createdAt)}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{a.actor?.name ?? <span className="text-muted">Sistema</span>}</td>
                    <td className="px-5 py-3">
                      {a.summary}
                      <span className="ml-2 font-mono text-[11.5px] text-muted">{a.action}</span>
                    </td>
                    <td className="px-5 py-3 font-mono text-[12px] text-muted">{a.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-muted">
            <span>{total} registros · página {page} de {pageCount}</span>
            <span className="flex gap-2">
              {page > 1 && <Link className={buttonClass("secondary", "sm")} href={link(page - 1)}>Anterior</Link>}
              {page < pageCount && <Link className={buttonClass("secondary", "sm")} href={link(page + 1)}>Próxima</Link>}
            </span>
          </div>
        )}
      </Card>
    </>
  );
}
