import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CaretLeft, CaretRight, Laptop, Plus, Storefront, Warning } from "@phosphor-icons/react/ssr";
import { Card, PageHeader, PageSkeleton, Select, buttonClass, cn } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { INTERVIEW_STATUS_LABEL, interviewFormOptions, listInterviews, pendingResults } from "@/server/modules/interviews/service";
import { addDays, dayKey, parseDateSP, partsSP, startOfDaySP, timeKey } from "@/lib/period";

export const metadata: Metadata = { title: "Entrevistas" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type View = "dia" | "semana" | "mes";
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const weekday = (d: Date) => { const p = partsSP(d); return new Date(Date.UTC(p.y, p.m, p.day)).getUTCDay(); };
const monthStart = (d: Date) => { const p = partsSP(d); return parseDateSP(`${p.y}-${String(p.m + 1).padStart(2, "0")}-01`)!; };
const nextMonth = (d: Date) => { const p = partsSP(d); const y = p.m === 11 ? p.y + 1 : p.y; const m = p.m === 11 ? 0 : p.m + 1; return parseDateSP(`${y}-${String(m + 1).padStart(2, "0")}-01`)!; };
const prevMonth = (d: Date) => { const p = partsSP(d); const y = p.m === 0 ? p.y - 1 : p.y; const m = p.m === 0 ? 11 : p.m - 1; return parseDateSP(`${y}-${String(m + 1).padStart(2, "0")}-01`)!; };

function range(view: View, anchor: Date) {
  if (view === "dia") return { from: anchor, to: addDays(anchor, 1), prev: addDays(anchor, -1), next: addDays(anchor, 1) };
  if (view === "semana") { const from = addDays(anchor, -weekday(anchor)); return { from, to: addDays(from, 7), prev: addDays(anchor, -7), next: addDays(anchor, 7) }; }
  const ms = monthStart(anchor);
  const from = addDays(ms, -weekday(ms));
  const me = nextMonth(anchor);
  const to = addDays(me, (7 - weekday(me)) % 7);
  return { from, to, prev: prevMonth(anchor), next: me, monthFrom: ms, monthTo: me };
}

function title(view: View, from: Date, to: Date, anchor: Date) {
  const p = partsSP(anchor);
  if (view === "mes") return `${MONTHS[p.m]} de ${p.y}`;
  if (view === "dia") return `${WEEKDAYS[weekday(anchor)]}, ${p.day} de ${MONTHS[p.m]}`;
  const a = partsSP(from), b = partsSP(addDays(to, -1));
  return a.m === b.m ? `${a.day} a ${b.day} de ${MONTHS[a.m]}` : `${a.day} de ${MONTHS[a.m]} a ${b.day} de ${MONTHS[b.m]}`;
}

const CHIP: Record<string, string> = {
  SCHEDULED: "border-l-brand bg-brand-soft",
  COMPLETED: "border-l-success bg-success-soft",
  NO_SHOW: "border-l-warning bg-warning-soft",
  CANCELED: "border-l-danger bg-danger-soft line-through opacity-70",
  RESCHEDULED: "border-l-muted bg-surface opacity-70",
};

export default function InterviewsPage({ searchParams }: PageProps<"/entrevistas">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/entrevistas">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "interviews.view")) return <NoPermission />;
  const sp = await searchParams;
  const view: View = (["dia", "semana", "mes"] as const).find((v) => v === one(sp.visao)) ?? "semana";
  const today = startOfDaySP(new Date());
  const anchor = parseDateSP(one(sp.data)) ?? today;
  const r = range(view, anchor);
  const f = { storeId: one(sp.loja), interviewerId: one(sp.entrevistador), status: one(sp.situacao), mine: one(sp.minhas) === "1" };
  const [items, opts, pending] = await Promise.all([listInterviews(actor, r.from, r.to, f), interviewFormOptions(actor), pendingResults(actor)]);
  const canManage = can(actor, "interviews.manage");

  const qs = (over: Record<string, string | undefined>) => {
    const base = { visao: view, data: dayKey(anchor), loja: f.storeId, entrevistador: f.interviewerId, situacao: f.status, minhas: f.mine ? "1" : undefined, ...over };
    return `/entrevistas?${new URLSearchParams(Object.entries(base).filter(([, v]) => v) as [string, string][])}`;
  };
  const byDay = new Map<string, typeof items>();
  for (const i of items) {
    const k = dayKey(i.scheduledAt);
    byDay.set(k, [...(byDay.get(k) ?? []), i]);
  }
  const days: Date[] = [];
  for (let d = r.from; d < r.to; d = addDays(d, 1)) days.push(d);

  const Chip = ({ i, compact }: { i: (typeof items)[number]; compact?: boolean }) => (
    <Link
      href={`/entrevistas/${i.id}`}
      className={cn("block rounded-md border-l-4 px-2 py-1.5 text-[12px] leading-tight hover:ring-1 hover:ring-ink/30", CHIP[i.status])}
      title={`${timeKey(i.scheduledAt)} · ${i.candidateJob.candidate.fullName} · ${i.candidateJob.job.title} · ${INTERVIEW_STATUS_LABEL[i.status]}`}
    >
      <span className="flex items-center gap-1 font-bold">
        {i.mode === "ONLINE" ? <Laptop size={12} /> : <Storefront size={12} />} {timeKey(i.scheduledAt)}
      </span>
      <span className="block truncate font-medium">{i.candidateJob.candidate.fullName}</span>
      {!compact && <span className="block truncate text-muted">{i.candidateJob.job.title}{i.interviewer ? ` · ${i.interviewer.name}` : ""}</span>}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Entrevistas"
        description="Agenda de entrevistas online e presenciais."
        actions={canManage && <Link href={`/entrevistas/nova${anchor > today ? `?data=${dayKey(anchor)}` : ""}`} className={buttonClass("primary")}><Plus size={18} weight="bold" /> Agendar entrevista</Link>}
      />
      {pending > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft px-4 py-3 text-[14px] font-medium text-warning">
          <Warning size={18} weight="fill" /> {pending} entrevista(s) já passaram e estão sem resultado. Abra cada uma e marque se foi realizada ou se o candidato faltou.
          <Link href={qs({ situacao: "SCHEDULED", visao: "mes" })} className="ml-auto shrink-0 underline underline-offset-4">Ver</Link>
        </div>
      )}
      <Card className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="flex items-center gap-1">
            <Link href={qs({ data: dayKey(r.prev) })} className={buttonClass("secondary", "sm")} aria-label="Anterior"><CaretLeft size={16} weight="bold" /></Link>
            <Link href={qs({ data: dayKey(today) })} className={buttonClass("secondary", "sm")}>Hoje</Link>
            <Link href={qs({ data: dayKey(r.next) })} className={buttonClass("secondary", "sm")} aria-label="Próximo"><CaretRight size={16} weight="bold" /></Link>
          </div>
          <h2 className="text-[17px] font-bold">{((t) => t[0].toUpperCase() + t.slice(1))(title(view, r.from, r.to, anchor))}</h2>
          <div className="ml-auto flex rounded-lg border border-line p-0.5" role="tablist" aria-label="Visualização">
            {(["dia", "semana", "mes"] as const).map((v) => (
              <Link key={v} href={qs({ visao: v })} role="tab" aria-selected={view === v} className={cn("rounded-md px-3 py-1.5 text-[13px] font-semibold", view === v ? "bg-ink text-white" : "text-muted hover:text-ink")}>
                {v === "dia" ? "Dia" : v === "semana" ? "Semana" : "Mês"}
              </Link>
            ))}
          </div>
        </div>
        <form className="flex flex-wrap gap-2 border-b border-line p-3" role="search">
          <input type="hidden" name="visao" value={view} />
          <input type="hidden" name="data" value={dayKey(anchor)} />
          {opts.stores.length > 1 && (
            <Select name="loja" defaultValue={f.storeId ?? ""} aria-label="Loja" className="w-auto">
              <option value="">Todas as lojas</option>
              {opts.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          <Select name="entrevistador" defaultValue={f.interviewerId ?? ""} aria-label="Entrevistador" className="w-auto">
            <option value="">Todos os entrevistadores</option>
            {opts.interviewers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          <Select name="situacao" defaultValue={f.status ?? ""} aria-label="Situação" className="w-auto">
            <option value="">Todas (exceto remarcadas)</option>
            {Object.entries(INTERVIEW_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <label className="flex items-center gap-2 px-1 text-[13.5px]"><input type="checkbox" name="minhas" value="1" defaultChecked={f.mine} className="h-4 w-4 accent-[#F5B900]" /> Só as minhas</label>
          <button className={buttonClass("dark", "sm")}>Filtrar</button>
        </form>

        {view === "mes" ? (
          <div className="overflow-x-auto">
            <div className="grid min-w-[760px] grid-cols-7">
              {WEEKDAYS.map((w) => <div key={w} className="border-b border-line px-2 py-2 text-center text-[12px] font-semibold tracking-wide text-muted uppercase">{w}</div>)}
              {days.map((d) => {
                const k = dayKey(d);
                const list = byDay.get(k) ?? [];
                const out = r.monthFrom && (d < r.monthFrom || d >= r.monthTo!);
                return (
                  <div key={k} className={cn("min-h-28 border-r border-b border-line p-1.5", out && "bg-surface/60")}>
                    <div className="mb-1 flex items-center justify-between">
                      <Link href={qs({ visao: "dia", data: k })} className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold", k === dayKey(today) ? "bg-brand text-ink" : out ? "text-muted" : "text-ink hover:bg-surface")}>{partsSP(d).day}</Link>
                      {list.length > 3 && <span className="text-[11px] text-muted">{list.length}</span>}
                    </div>
                    <div className="flex flex-col gap-1">
                      {list.slice(0, 3).map((i) => <Chip key={i.id} i={i} compact />)}
                      {list.length > 3 && <Link href={qs({ visao: "dia", data: k })} className="px-1 text-[11.5px] font-semibold text-muted hover:text-ink">+{list.length - 3} mais</Link>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className={cn("grid", view === "semana" ? "min-w-[860px] grid-cols-7" : "grid-cols-1")}>
              {days.map((d) => {
                const k = dayKey(d);
                const list = byDay.get(k) ?? [];
                const isToday = k === dayKey(today);
                return (
                  <div key={k} className="min-h-64 border-r border-line last:border-r-0">
                    <div className={cn("flex items-center justify-between border-b border-line px-3 py-2", isToday && "bg-brand-soft")}>
                      <Link href={qs({ visao: "dia", data: k })} className="text-[13px] font-semibold hover:underline">
                        {WEEKDAYS[weekday(d)]} <span className={cn("ml-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1", isToday && "bg-brand")}>{partsSP(d).day}</span>
                      </Link>
                      {canManage && d >= today && (
                        <Link href={`/entrevistas/nova?data=${k}`} className="rounded-md p-1 text-muted hover:bg-white hover:text-ink" aria-label={`Agendar em ${k}`}><Plus size={14} weight="bold" /></Link>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 p-2">
                      {list.length === 0 ? <p className="py-4 text-center text-[12px] text-muted">{view === "dia" ? "Nenhuma entrevista neste dia." : "—"}</p> : list.map((i) => <Chip key={i.id} i={i} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-[12px] text-muted">
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-brand" />Agendada</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-success" />Realizada</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-warning" />Faltou</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-danger" />Cancelada</span>
          <span className="ml-auto">{items.length} entrevista(s) no período</span>
        </p>
      </Card>
    </>
  );
}
