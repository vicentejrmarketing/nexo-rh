import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MagnifyingGlass, Plus, Storefront, Trophy } from "@phosphor-icons/react/ssr";
import { Alert, Badge, Card, CardHeader, EmptyState, Input, PageHeader, PageSkeleton, Select, buttonClass } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { listStores, storeRanking } from "@/server/modules/stores/service";
import { addDays, startOfDaySP } from "@/lib/period";

export const metadata: Metadata = { title: "Lojas" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function StoresPage({ searchParams }: PageProps<"/lojas">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/lojas">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "stores.view")) return <NoPermission />;
  const sp = await searchParams;
  const q = one(sp.q), status = one(sp.situacao);
  const to = addDays(startOfDaySP(new Date()), 1);
  const [stores, ranking] = await Promise.all([listStores(actor, { q, status }), storeRanking(actor, addDays(to, -90), to)]);
  const canManage = can(actor, "stores.manage");

  return (
    <>
      <PageHeader
        title="Lojas"
        description={actor.allStores ? "Todas as unidades da empresa." : "As lojas que você acompanha."}
        actions={canManage && <Link href="/lojas/nova" className={buttonClass("primary")}><Plus size={18} weight="bold" /> Nova loja</Link>}
      />
      {sp.excluida && <div className="mb-5"><Alert tone="success">Loja excluída.</Alert></div>}
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card className="min-w-0">
          <form className="flex flex-wrap gap-3 border-b border-line p-4" role="search">
            <div className="relative min-w-[200px] flex-1">
              <MagnifyingGlass size={17} className="pointer-events-none absolute top-3 left-3 text-muted" />
              <Input name="q" defaultValue={q} placeholder="Buscar por nome ou cidade" aria-label="Buscar loja" className="pl-9" />
            </div>
            <Select name="situacao" defaultValue={status ?? ""} aria-label="Situação" className="w-auto">
              <option value="">Todas as situações</option>
              <option value="ACTIVE">Ativas</option>
              <option value="INACTIVE">Inativas</option>
            </Select>
            <button className={buttonClass("dark")}>Filtrar</button>
          </form>
          {stores.length === 0 ? (
            <EmptyState icon={<Storefront size={20} weight="fill" />} title={q || status ? "Nenhuma loja encontrada" : "Nenhuma loja cadastrada"}>
              {canManage && !q && !status ? "Cadastre a primeira unidade para começar a abrir vagas." : !canManage ? "Peça ao administrador para vincular você às suas lojas." : "Ajuste a busca."}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-line text-[12px] tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-5 py-3 font-medium">Loja</th>
                    <th className="px-5 py-3 font-medium">Responsável</th>
                    <th className="px-5 py-3 text-right font-medium">Vagas abertas</th>
                    <th className="px-5 py-3 text-right font-medium">Em processo</th>
                    <th className="px-5 py-3 text-right font-medium">Contratações 90 d</th>
                    <th className="px-5 py-3 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {stores.map((s) => (
                    <tr key={s.id} className="hover:bg-surface/60">
                      <td className="px-5 py-3">
                        <Link href={`/lojas/${s.id}`} className="font-semibold text-ink hover:underline hover:decoration-brand hover:decoration-2 hover:underline-offset-4">{s.name}</Link>
                        <p className="text-[12.5px] text-muted">{s.city}/{s.state} · {s.employeeCount} funcionário(s)</p>
                      </td>
                      <td className="px-5 py-3 text-muted">{s.manager?.name ?? "—"}</td>
                      <td className="tabular px-5 py-3 text-right font-semibold">{s.openJobs}</td>
                      <td className="tabular px-5 py-3 text-right">{s.activeProcesses}</td>
                      <td className="tabular px-5 py-3 text-right">{s.hires90}</td>
                      <td className="px-5 py-3">{s.status === "ACTIVE" ? <Badge tone="success">Ativa</Badge> : <Badge>Inativa</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title={<span className="flex items-center gap-2"><Trophy size={20} weight="fill" className="text-brand" /> Ranking das lojas</span>} description="Contratações nos últimos 90 dias." />
          {ranking.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">O ranking aparece quando houver inscrições ou contratações.</p>
          ) : (
            <ol className="divide-y divide-line">
              {ranking.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${i === 0 ? "bg-brand text-ink" : "bg-surface text-ink"}`}>{i + 1}</span>
                  <Link href={`/lojas/${r.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{r.name}</p>
                    <p className="text-[12px] text-muted">{r.applications} inscrição(ões) · conversão {r.conversion === null ? "—" : `${r.conversion}%`}</p>
                  </Link>
                  <span className="tabular text-right">
                    <span className="block text-[17px] font-bold">{r.hires}</span>
                    <span className="text-[11px] text-muted">contratações</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
