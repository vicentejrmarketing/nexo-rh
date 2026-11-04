import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FunnelSimple, MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { Skeleton } from "@/components/ui";
import { Pagination } from "@/components/ui/pagination";
import { PublicJobCard } from "@/components/portal/job-card";
import { AutoSubmitForm } from "@/components/portal/auto-submit";
import { DAY_RANGES, SALARY_RANGES, listPublicJobs, publicFilterOptions } from "@/server/modules/portal/service";

export const metadata: Metadata = { title: "Vagas abertas" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 100);

export default function PublicJobsPage({ searchParams }: PageProps<"/trabalhe-conosco/vagas">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-[28px] font-extrabold tracking-tight sm:text-[34px]">Vagas abertas</h1>
      <Suspense fallback={<div className="mt-6 grid gap-4 lg:grid-cols-[280px_1fr]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const sel = "h-10 w-full rounded-lg border border-line bg-white px-3 text-[14px] text-ink focus:border-ink focus:outline-none";

async function Results({ searchParams }: { searchParams: PageProps<"/trabalhe-conosco/vagas">["searchParams"] }) {
  const sp = await searchParams;
  const params = {
    q: one(sp.q), cargo: one(sp.cargo), area: one(sp.area), cidade: one(sp.cidade), estado: one(sp.estado), loja: one(sp.loja),
    contratacao: one(sp.contratacao), salario: one(sp.salario), publicacao: one(sp.publicacao), ordem: one(sp.ordem),
  };
  const [res, opts] = await Promise.all([
    listPublicJobs({
      q: params.q, positionId: params.cargo, area: params.area, city: params.cidade, state: params.estado, storeId: params.loja,
      contract: params.contratacao, salary: params.salario, days: params.publicacao, sort: params.ordem, page: Number(one(sp.pagina)) || 1,
    }),
    publicFilterOptions(),
  ]);
  const filtered = Object.entries(params).some(([k, v]) => k !== "ordem" && v);

  return (
    <AutoSubmitForm action="/trabalhe-conosco/vagas" className="mt-6 grid items-start gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-[var(--radius-card)] border border-black/[0.06] bg-white p-5 shadow-[0_2px_14px_rgba(17,18,22,0.05)] lg:sticky lg:top-24">
        <p className="mb-4 flex items-center gap-2 text-[15px] font-bold"><FunnelSimple size={18} weight="bold" /> Filtrar vagas</p>
        <div className="flex flex-col gap-3.5 text-[13px]">
          <label className="flex flex-col gap-1 font-medium">Palavra-chave
            <span className="relative">
              <MagnifyingGlass size={16} className="pointer-events-none absolute top-3 left-3 text-muted" />
              <input name="q" defaultValue={params.q} placeholder="Ex.: caixa, vendas" className={`${sel} pl-9`} />
            </span>
          </label>
          {opts.positions.length > 0 && (
            <label className="flex flex-col gap-1 font-medium">Cargo
              <select name="cargo" defaultValue={params.cargo ?? ""} className={sel}><option value="">Todos</option>{opts.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
          )}
          {opts.areas.length > 0 && (
            <label className="flex flex-col gap-1 font-medium">Área profissional
              <select name="area" defaultValue={params.area ?? ""} className={sel}><option value="">Todas</option>{opts.areas.map((a) => <option key={a} value={a}>{a}</option>)}</select>
            </label>
          )}
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <label className="flex flex-col gap-1 font-medium">Cidade
              <select name="cidade" defaultValue={params.cidade ?? ""} className={sel}><option value="">Todas</option>{opts.cities.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1 font-medium">Estado
              <select name="estado" defaultValue={params.estado ?? ""} className={sel}><option value="">UF</option>{opts.states.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </label>
          </div>
          {opts.stores.length > 1 && (
            <label className="flex flex-col gap-1 font-medium">Loja
              <select name="loja" defaultValue={params.loja ?? ""} className={sel}><option value="">Todas</option>{opts.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </label>
          )}
          <label className="flex flex-col gap-1 font-medium">Tipo de contratação
            <select name="contratacao" defaultValue={params.contratacao ?? ""} className={sel}><option value="">Todos</option>{opts.contracts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 font-medium">Faixa salarial
            <select name="salario" defaultValue={params.salario ?? ""} className={sel}><option value="">Qualquer</option>{SALARY_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 font-medium">Data de publicação
            <select name="publicacao" defaultValue={params.publicacao ?? ""} className={sel}><option value="">Qualquer data</option>{DAY_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
          </label>
          <button className="mt-1 h-11 rounded-lg bg-ink text-[14px] font-semibold text-white hover:bg-ink-2">Buscar</button>
          {filtered && <Link href="/trabalhe-conosco/vagas" className="text-center text-[13px] font-semibold text-muted underline underline-offset-4">Limpar filtros</Link>}
        </div>
      </aside>

      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14.5px] text-muted" aria-live="polite">
            <strong className="text-ink">{res.total}</strong> {res.total === 1 ? "vaga encontrada" : "vagas encontradas"}
          </p>
          <label className="flex items-center gap-2 text-[13.5px] font-medium">Ordenar por
            <select name="ordem" defaultValue={params.ordem ?? ""} className={`${sel} w-auto`}>
              <option value="">Mais recentes</option>
              <option value="relevantes">Mais relevantes</option>
            </select>
          </label>
        </div>
        {res.items.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-white px-6 py-14 text-center">
            <p className="text-[17px] font-semibold">{filtered ? "Nenhuma vaga com esses filtros" : "Nenhuma vaga aberta no momento"}</p>
            <p className="mt-1 text-[14px] text-muted">{filtered ? "Tente remover algum filtro ou buscar outra palavra." : "Volte em breve: novas vagas aparecem aqui assim que forem publicadas."}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">{res.items.map((j) => <PublicJobCard key={j.id} job={j} />)}</div>
            {res.pageCount > 1 && (
              <div className="mt-4 overflow-hidden rounded-xl bg-white">
                <Pagination page={res.page} pageCount={res.pageCount} total={res.total} params={params} basePath="/trabalhe-conosco/vagas" noun="vaga(s)" />
              </div>
            )}
          </>
        )}
      </section>
    </AutoSubmitForm>
  );
}
