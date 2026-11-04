import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MagnifyingGlass, Warning } from "@phosphor-icons/react/ssr";
import { Input, PageHeader, PageSkeleton, Select, buttonClass } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { PipelineBoard, type BoardColumn } from "@/components/pipeline/board";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { ROLES } from "@/server/authz/catalog";
import { boardFilterOptions, getBoard } from "@/server/modules/pipeline/service";

export const metadata: Metadata = { title: "Funil de Recrutamento" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function PipelinePage({ searchParams }: PageProps<"/funil">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/funil">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "pipeline.view")) return <NoPermission />;
  const sp = await searchParams;
  const own = ROLES[actor.roleKey].ownRecordsOnly;
  // Recrutador abre o funil já nos processos dele; pode trocar para "Todos".
  const recruiterParam = one(sp.recrutador);
  const f = {
    storeId: one(sp.loja), jobId: one(sp.vaga), q: one(sp.q), days: one(sp.periodo), stalled: one(sp.parados) === "1",
    recruiterId: recruiterParam === "todos" ? undefined : recruiterParam ?? (own ? actor.id : undefined),
  };
  const [board, opts] = await Promise.all([getBoard(actor, f), boardFilterOptions(actor)]);
  const columns: BoardColumn[] = board.columns.map((c) => ({
    key: c.key, name: c.name, kind: c.kind, total: c.total,
    cards: c.cards.map((x) => ({
      id: x.id, candidateId: x.candidate.id, candidateName: x.candidate.fullName, city: x.candidate.city, whatsapp: x.candidate.whatsappE164 ?? x.candidate.phoneE164,
      jobTitle: x.job.title, storeName: x.job.store.name, recruiter: x.recruiter?.name ?? null, idleDays: x.idleDays, stalled: x.stalled, canMove: x.canMove,
      source: x.source, nextInterview: x.nextInterview?.scheduledAt.toISOString() ?? null, nextInterviewMode: x.nextInterview?.mode ?? null,
    })),
  }));
  const filtered = Boolean(f.storeId || f.jobId || f.q || f.days || f.stalled || recruiterParam);
  const stalledHref = `/funil?${new URLSearchParams(Object.entries({ loja: f.storeId, vaga: f.jobId, recrutador: recruiterParam, periodo: f.days, q: f.q, parados: "1" }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <PageHeader
        title="Funil de Recrutamento"
        description={can(actor, "pipeline.move") ? "Arraste os cartões entre as etapas ou use o botão de mover. Cada mudança fica no histórico." : "Acompanhe em que etapa cada candidato está."}
      />
      {board.stalledTotal > 0 && !f.stalled && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft px-4 py-3 text-[14px] text-warning">
          <span className="flex items-center gap-2 font-medium"><Warning size={18} weight="fill" /> {board.stalledTotal} candidato(s) sem movimentação além do prazo da etapa.</span>
          <Link href={stalledHref} className="font-semibold underline underline-offset-4">Ver só os parados</Link>
        </div>
      )}
      <form className="mb-4 flex flex-wrap gap-2 rounded-[var(--radius-card)] bg-white p-3 shadow-[0_2px_14px_rgba(17,18,22,0.05)]" role="search">
        <div className="relative min-w-[200px] flex-1">
          <MagnifyingGlass size={17} className="pointer-events-none absolute top-3 left-3 text-muted" />
          <Input name="q" defaultValue={f.q} placeholder="Nome do candidato" aria-label="Buscar candidato" className="pl-9" />
        </div>
        {opts.stores.length > 1 && (
          <Select name="loja" defaultValue={f.storeId ?? ""} aria-label="Loja" className="w-auto">
            <option value="">Todas as lojas</option>
            {opts.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}
        <Select name="vaga" defaultValue={f.jobId ?? ""} aria-label="Vaga" className="w-auto max-w-[240px]">
          <option value="">Todas as vagas</option>
          {opts.jobs.map((j) => <option key={j.id} value={j.id}>{j.title} · {j.store.name}</option>)}
        </Select>
        <Select name="recrutador" defaultValue={recruiterParam ?? (own ? actor.id : "")} aria-label="Recrutador" className="w-auto">
          <option value={own ? "todos" : ""}>Todos os recrutadores</option>
          <option value="sem">Sem recrutador</option>
          {opts.recruiters.map((r) => <option key={r.id} value={r.id}>{r.id === actor.id ? `${r.name} (eu)` : r.name}</option>)}
        </Select>
        <Select name="periodo" defaultValue={f.days ?? ""} aria-label="Período da inscrição" className="w-auto">
          <option value="">Qualquer data de inscrição</option>
          <option value="7">Inscritos nos últimos 7 dias</option>
          <option value="30">Inscritos nos últimos 30 dias</option>
          <option value="90">Inscritos nos últimos 90 dias</option>
        </Select>
        <label className="flex items-center gap-2 px-1 text-[13.5px]">
          <input type="checkbox" name="parados" value="1" defaultChecked={f.stalled} className="h-4 w-4 accent-[#F5B900]" /> Só parados
        </label>
        <button className={buttonClass("dark")}>Filtrar</button>
        {filtered && <Link href="/funil" className={buttonClass("ghost")}>Limpar</Link>}
      </form>
      <PipelineBoard columns={columns} canSchedule={can(actor, "interviews.manage")} />
    </>
  );
}
