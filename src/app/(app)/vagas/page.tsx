import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Briefcase, MagnifyingGlass, Plus } from "@phosphor-icons/react/ssr";
import { Alert, Badge, Card, EmptyState, Input, PageHeader, PageSkeleton, Select, buttonClass } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { JOB_STATUS_LABEL, PRIORITY_LABEL, jobFormOptions, listJobs } from "@/server/modules/jobs/service";
import { formatDate } from "@/lib/format";
import { JobStatusButtons } from "./job-controls";

export const metadata: Metadata = { title: "Vagas" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function JobsPage({ searchParams }: PageProps<"/vagas">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const STATUS_TONE = { OPEN: "success", PAUSED: "warning", DRAFT: "neutral", CLOSED: "neutral" } as const;

async function Content({ searchParams }: { searchParams: PageProps<"/vagas">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "jobs.view")) return <NoPermission />;
  const sp = await searchParams;
  const f = { q: one(sp.q), status: one(sp.situacao), storeId: one(sp.loja), recruiterId: one(sp.responsavel), priority: one(sp.prioridade), mine: one(sp.minhas) === "1" };
  const [jobs, opts] = await Promise.all([listJobs(actor, f), jobFormOptions(actor)]);
  const canCreate = can(actor, "jobs.create");
  const filtered = Boolean(f.q || f.status || f.storeId || f.recruiterId || f.priority || f.mine);
  const totals = { open: jobs.filter((j) => j.status === "OPEN").length, applicants: jobs.reduce((a, j) => a + j.applicants, 0), urgent: jobs.filter((j) => j.priority === "URGENT" && j.status === "OPEN").length };

  return (
    <>
      <PageHeader
        title="Vagas"
        description={`${totals.open} aberta(s) · ${totals.applicants} candidato(s) vinculados${totals.urgent ? ` · ${totals.urgent} urgente(s)` : ""}`}
        actions={canCreate && <Link href="/vagas/nova" className={buttonClass("primary")}><Plus size={18} weight="bold" /> Nova vaga</Link>}
      />
      {sp.excluida && <div className="mb-5"><Alert tone="success">Vaga excluída.</Alert></div>}
      <Card className="min-w-0">
        <form className="flex flex-wrap gap-3 border-b border-line p-4" role="search">
          <div className="relative min-w-[200px] flex-1">
            <MagnifyingGlass size={17} className="pointer-events-none absolute top-3 left-3 text-muted" />
            <Input name="q" defaultValue={f.q} placeholder="Buscar por vaga ou cidade" aria-label="Buscar vaga" className="pl-9" />
          </div>
          <Select name="situacao" defaultValue={f.status ?? ""} aria-label="Situação" className="w-auto">
            <option value="">Em andamento</option>
            {Object.entries(JOB_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {opts.stores.length > 1 && (
            <Select name="loja" defaultValue={f.storeId ?? ""} aria-label="Loja" className="w-auto">
              <option value="">Todas as lojas</option>
              {opts.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          <Select name="responsavel" defaultValue={f.recruiterId ?? ""} aria-label="Responsável" className="w-auto">
            <option value="">Todos os responsáveis</option>
            {opts.recruiters.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Select name="prioridade" defaultValue={f.priority ?? ""} aria-label="Prioridade" className="w-auto">
            <option value="">Qualquer prioridade</option>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" name="minhas" value="1" defaultChecked={f.mine} className="h-4 w-4 accent-[#F5B900]" /> Só as minhas
          </label>
          <button className={buttonClass("dark")}>Filtrar</button>
          {filtered && <Link href="/vagas" className={buttonClass("ghost")}>Limpar</Link>}
        </form>
        {jobs.length === 0 ? (
          <EmptyState
            icon={<Briefcase size={20} weight="fill" />}
            title={filtered ? "Nenhuma vaga com esses filtros" : "Nenhuma vaga em andamento"}
            action={canCreate && !filtered ? <Link href="/vagas/nova" className={buttonClass("primary")}><Plus size={18} weight="bold" /> Criar a primeira vaga</Link> : undefined}
          >
            {filtered ? "Ajuste ou limpe os filtros." : "Abra uma vaga para começar a receber e organizar candidatos."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-line text-[12px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Vaga</th>
                  <th className="px-5 py-3 font-medium">Responsável</th>
                  <th className="px-5 py-3 text-right font-medium">Candidatos</th>
                  <th className="px-5 py-3 text-right font-medium">Contratados</th>
                  <th className="px-5 py-3 font-medium">Previsão</th>
                  <th className="px-5 py-3 font-medium">Situação</th>
                  <th className="px-5 py-3 font-medium"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-surface/60">
                    <td className="px-5 py-3">
                      <Link href={`/vagas/${j.id}`} className="font-semibold text-ink hover:underline hover:decoration-brand hover:decoration-2 hover:underline-offset-4">{j.title}</Link>
                      <p className="text-[12.5px] text-muted">
                        {j.store.name}{j.city !== j.store.name && ` · ${j.city}`} · {j.openings} posição(ões)
                        {(j.priority === "URGENT" || j.priority === "HIGH") && <Badge tone="warning" className="ml-2">{PRIORITY_LABEL[j.priority]}</Badge>}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-muted">{j.recruiter?.name ?? "—"}</td>
                    <td className="tabular px-5 py-3 text-right font-semibold">{j.applicants}</td>
                    <td className="tabular px-5 py-3 text-right">{j.hired}/{j.openings}</td>
                    <td className="px-5 py-3 text-muted">{formatDate(j.expectedCloseAt)}</td>
                    <td className="px-5 py-3"><Badge tone={STATUS_TONE[j.status]}>{JOB_STATUS_LABEL[j.status]}</Badge></td>
                    <td className="px-5 py-3">{j.canEdit && <JobStatusButtons id={j.id} status={j.status} size="sm" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
