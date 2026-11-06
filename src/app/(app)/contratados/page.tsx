import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IdentificationCard, MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { Badge, Card, EmptyState, Input, PageHeader, PageSkeleton, Select, buttonClass, cn } from "@/components/ui";
import { Pagination } from "@/components/ui/pagination";
import { NoPermission } from "@/components/layout/states";
import { AdmissionBadge } from "@/components/admission/status";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { ADMISSION_STATUS_LABEL, listHires } from "@/server/modules/admission/service";
import { candidateFilterOptions } from "@/server/modules/candidates/service";
import { formatCpf } from "@/lib/cpf";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Contratados" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function HiresPage({ searchParams }: PageProps<"/contratados">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/contratados">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "admission.view")) return <NoPermission />;
  const sp = await searchParams;
  const params = { q: one(sp.q), loja: one(sp.loja), situacao: one(sp.situacao) };
  const [res, opts] = await Promise.all([
    listHires(actor, { q: params.q, storeId: params.loja, status: params.situacao, page: Number(one(sp.pagina)) || 1 }),
    candidateFilterOptions(actor),
  ]);
  const filtered = Object.values(params).some(Boolean);
  const chips: { key: string; label: string; n: number }[] = [
    { key: "", label: "Todos", n: res.summary.total },
    { key: "NOT_SENT", label: ADMISSION_STATUS_LABEL.NOT_SENT, n: res.summary.NOT_SENT },
    { key: "PENDING", label: ADMISSION_STATUS_LABEL.PENDING, n: res.summary.PENDING },
    { key: "SUBMITTED", label: ADMISSION_STATUS_LABEL.SUBMITTED, n: res.summary.SUBMITTED },
    { key: "CHANGES_REQUESTED", label: ADMISSION_STATUS_LABEL.CHANGES_REQUESTED, n: res.summary.CHANGES_REQUESTED },
    { key: "COMPLETED", label: ADMISSION_STATUS_LABEL.COMPLETED, n: res.summary.COMPLETED },
  ];
  const chipHref = (k: string) => {
    const q = new URLSearchParams(Object.entries({ ...params, situacao: k }).filter(([, v]) => v) as [string, string][]);
    return `/contratados${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Contratados" description="Candidatos com status Contratado e a documentação de admissão de cada um." />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Situação da documentação">
        {chips.map((c) => {
          const active = (params.situacao ?? "") === c.key;
          return (
            <Link key={c.key} href={chipHref(c.key)} aria-current={active ? "page" : undefined}
              className={cn("inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium", active ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink/40")}>
              {c.label}
              <span className={cn("tabular rounded-full px-1.5 text-[12px]", active ? "bg-brand text-ink" : "bg-surface text-muted")}>{c.n}</span>
            </Link>
          );
        })}
      </nav>
      <Card className="min-w-0">
        <form className="flex flex-wrap gap-3 border-b border-line p-4" role="search" action="/contratados">
          {params.situacao && <input type="hidden" name="situacao" value={params.situacao} />}
          <div className="relative min-w-[220px] flex-[2]">
            <MagnifyingGlass size={17} className="pointer-events-none absolute top-3 left-3 text-muted" />
            <Input name="q" defaultValue={params.q} placeholder="Nome ou CPF" aria-label="Buscar contratado" className="pl-9" />
          </div>
          {opts.stores.length > 1 && (
            <Select name="loja" defaultValue={params.loja ?? ""} aria-label="Loja" className="w-auto">
              <option value="">Todas as lojas</option>
              {opts.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          <button className={buttonClass("dark")}>Filtrar</button>
          {filtered && <Link href="/contratados" className={buttonClass("ghost")}>Limpar</Link>}
        </form>
        {res.rows.length === 0 ? (
          <EmptyState icon={<IdentificationCard size={20} weight="fill" />} title={filtered ? "Nenhum contratado com esses filtros" : "Nenhum contratado ainda"}>
            {filtered ? "Ajuste ou limpe os filtros." : "Quem for movido para a etapa Contratados no funil aparece aqui."}
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-line text-[12px] tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-5 py-3 font-medium">Contratado</th>
                    <th className="px-3 py-3 font-medium">Vaga e loja</th>
                    <th className="px-3 py-3 font-medium">Contratado em</th>
                    <th className="px-3 py-3 font-medium">Documentação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {res.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-surface/60">
                      <td className="px-5 py-3">
                        <Link href={`/contratados/${r.id}`} className="font-semibold hover:underline">{r.candidate.fullName}</Link>
                        <p className="text-[12.5px] text-muted">{r.candidate.cpf ? `CPF ${formatCpf(r.candidate.cpf)}` : "CPF não informado"}{r.recruiter ? ` · ${r.recruiter.name}` : ""}</p>
                      </td>
                      <td className="px-3 py-3">{r.job.title}<p className="text-[12.5px] text-muted">{r.job.store.name}</p></td>
                      <td className="px-3 py-3 tabular">{r.hiredAt ? formatDate(r.hiredAt) : "—"}</td>
                      <td className="px-3 py-3">
                        <AdmissionBadge status={r.admission?.status ?? null} />
                        {r.admission?.status === "PENDING" && r.admission.tokenExpiresAt && r.admission.tokenExpiresAt < new Date() && <Badge tone="danger" className="ml-1">Link vencido</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={res.page} pageCount={res.pages} total={res.total} params={params} basePath="/contratados" noun="contratado(s)" />
          </>
        )}
      </Card>
    </>
  );
}
