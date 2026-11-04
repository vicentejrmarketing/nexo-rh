import Link from "next/link";
import {
  ArrowRight, CalendarCheck, CalendarDots, ChartLineUp, ChatCircle, ChatsCircle, CheckCircle, ClipboardText, EnvelopeSimple,
  Eye, Laptop, MapPin, PencilSimple, Trophy, UserCircle, UserPlus, UsersThree, XCircle,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/components/ui";
import { partsSP, startOfDaySP } from "@/lib/period";

// ───────── Cartão de bloco ─────────
export function Panel({ title, icon: Ico, action, className, children }: { title: string; icon: Icon; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    // min-w-0: impede que tabelas largas estiquem a grade além da tela no celular.
    <section className={cn("min-w-0 rounded-[var(--radius-card)] border border-black/[0.05] bg-white p-5 shadow-[0_2px_14px_rgba(17,18,22,0.05)]", className)}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="flex items-center gap-2.5 text-[17px] font-bold whitespace-nowrap text-ink">
          <Ico size={24} weight="fill" /> {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

// ───────── Funil ─────────
const FUNNEL_STYLE: Record<string, { icon: Icon; bar: string; text: string; iconColor: string }> = {
  applied: { icon: UsersThree, bar: "bg-ink", text: "text-white", iconColor: "text-brand" },
  contacted: { icon: ChatsCircle, bar: "bg-brand", text: "text-ink", iconColor: "text-ink" },
  online_interview: { icon: Laptop, bar: "bg-[#E4E4E9]", text: "text-ink", iconColor: "text-ink" },
  onsite_interview: { icon: CalendarDots, bar: "bg-brand", text: "text-ink", iconColor: "text-ink" },
  trial: { icon: ClipboardText, bar: "bg-[#E4E4E9]", text: "text-ink", iconColor: "text-ink" },
  approved: { icon: CheckCircle, bar: "bg-[#3BB05A]", text: "text-ink", iconColor: "text-white" },
};

export function Funnel({ rows }: { rows: { key: string; name: string; count: number; percent: number | null }[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r, i) => {
        const st = FUNNEL_STYLE[r.key] ?? FUNNEL_STYLE.trial;
        const Ico = st.icon;
        // Largura decrescente em degraus, como um funil; os números trazem o valor real.
        const width = 100 - i * (26 / Math.max(rows.length - 1, 1));
        return (
          <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_56px_44px] items-center gap-2.5">
            <div className="relative h-[34px]">
              <div
                className={cn("flex h-full items-center gap-2.5 rounded-l-lg pl-3 text-[14px] font-semibold", st.bar, st.text)}
                style={{ width: `${width}%`, clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)" }}
              >
                <Ico size={21} weight="fill" className={st.iconColor} />
                <span className="truncate pr-5">{r.name}</span>
              </div>
            </div>
            <span className="tabular text-right text-[17px] font-bold text-ink">{r.count.toLocaleString("pt-BR")}</span>
            <span className="tabular text-right text-[14px] text-ink/70">{r.percent === null ? "—" : `${r.percent}%`}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ───────── Vagas por status (rosca) ─────────
export function JobsDonut({ total, open, paused, closed }: { total: number; open: number; paused: number; closed: number }) {
  const r = 52, c = 2 * Math.PI * r;
  const parts = [
    { label: "Em andamento", value: open, color: "#F5B900" },
    { label: "Pausadas", value: paused, color: "#C9CAD1" },
    { label: "Finalizadas", value: closed, color: "#111216" },
  ];
  let offset = 0;
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <svg viewBox="0 0 140 140" className="h-[112px] w-[112px] shrink-0 -rotate-90 2xl:h-[128px] 2xl:w-[128px]" role="img" aria-label={`${total} vagas`}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#EDEDF1" strokeWidth="24" />
        {total > 0 &&
          parts.map((p) => {
            const len = (p.value / total) * c;
            const el = <circle key={p.label} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="24" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
        <g className="rotate-90" style={{ transformOrigin: "70px 70px" }}>
          <text x="70" y="70" textAnchor="middle" fontSize="28" fontWeight="800" fill="#111216">{total}</text>
          <text x="70" y="90" textAnchor="middle" fontSize="13" fontWeight="600" fill="#111216">Vagas</text>
        </g>
      </svg>
      <ul className="flex min-w-[168px] flex-1 flex-col gap-4 text-[13.5px]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 whitespace-nowrap text-ink/85">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} /> {p.label}
            </span>
            <span className="tabular shrink-0 font-bold">{pct(p.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────── Desempenho por loja ─────────
export function StoreBars({ rows }: { rows: { name: string; value: number }[] }) {
  if (rows.length === 0) {
    return <p className="flex h-[150px] items-center justify-center text-center text-[13px] text-muted">Nenhuma contratação no período.</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex h-[150px] items-end justify-around gap-3 border-b border-line pb-0">
      {rows.map((r) => (
        <div key={r.name} className="flex min-w-0 flex-1 flex-col items-center">
          <span className="tabular mb-1.5 text-[14px] font-bold">{r.value}</span>
          <div className="w-full max-w-[46px] rounded-t-md bg-brand" style={{ height: `${Math.max(8, (r.value / max) * 92)}px` }} />
        </div>
      ))}
    </div>
  );
}

export function StoreBarLabels({ rows }: { rows: { name: string }[] }) {
  return (
    <div className="mt-2 flex justify-around gap-3">
      {rows.map((r) => (
        <span key={r.name} className="min-w-0 flex-1 truncate text-center text-[13px] text-ink/80" title={r.name}>{r.name}</span>
      ))}
    </div>
  );
}

// ───────── Atividades recentes ─────────
function activityIcon(action: string): { icon: Icon; cls: string } {
  if (action.includes("approve") || action.includes("hire")) return { icon: CheckCircle, cls: "bg-[#3BB05A] text-white" };
  if (action.startsWith("interview")) return { icon: CalendarDots, cls: "bg-white text-ink" };
  if (action.startsWith("message")) return { icon: EnvelopeSimple, cls: "bg-brand text-ink" };
  if (action.startsWith("candidate") || action.startsWith("application")) return { icon: ChatCircle, cls: "bg-white text-ink" };
  if (action.includes("reject")) return { icon: XCircle, cls: "bg-white text-danger" };
  return { icon: UserCircle, cls: "bg-white text-ink" };
}

export function relativeTime(d: Date, now = new Date()) {
  const s = Math.max(0, (now.getTime() - d.getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const days = Math.floor(s / 86400);
  return days === 1 ? "ontem" : `há ${days} dias`;
}

export function ActivityList({ items }: { items: { id: string; action: string; summary: string; createdAt: Date }[] }) {
  if (items.length === 0) return <p className="py-8 text-center text-[13px] text-ink/60">Nenhuma atividade registrada ainda.</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((a) => {
        const { icon: Ico, cls } = activityIcon(a.action);
        return (
          <li key={a.id} className="flex items-center gap-3">
            <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm", cls)}>
              <Ico size={16} weight="fill" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{a.summary}</span>
            <span className="shrink-0 text-[12.5px] text-ink/60">{relativeTime(a.createdAt)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ───────── Candidatos em acompanhamento ─────────
const STAGE_PILL: Record<string, { icon: Icon; cls: string }> = {
  applied: { icon: UserPlus, cls: "bg-surface text-ink" },
  contacted: { icon: ChatCircle, cls: "bg-brand-soft text-ink" },
  online_interview: { icon: Laptop, cls: "bg-[#EEF0F4] text-ink" },
  onsite_interview: { icon: CalendarCheck, cls: "bg-brand-soft text-ink" },
  trial: { icon: ClipboardText, cls: "bg-[#EEF0F4] text-ink" },
  approved: { icon: CheckCircle, cls: "bg-success-soft text-ink" },
  hired: { icon: CheckCircle, cls: "bg-success-soft text-ink" },
};

function whenLabel(d: Date) {
  const p = partsSP(d);
  const time = `${String(p.hour).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
  const today = startOfDaySP(new Date()).getTime();
  const day = startOfDaySP(d).getTime();
  if (day === today) return `Hoje, ${time}`;
  if (day === today - 86400_000) return `Ontem, ${time}`;
  return `${String(p.day).padStart(2, "0")}/${String(p.m + 1).padStart(2, "0")}, ${time}`;
}

type FollowUp = {
  id: string;
  lastMovedAt: Date;
  candidate: { id: string; fullName: string };
  job: { title: string; store: { name: string } };
  stage: { key: string; name: string };
};

export function FollowUpTable({ rows, canEdit }: { rows: FollowUp[]; canEdit: boolean }) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-[13px] text-muted">Nenhum candidato em processo seletivo no momento.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-[13.5px]">
        <thead>
          <tr className="bg-surface text-[13px] font-semibold whitespace-nowrap text-ink">
            <th className="rounded-l-lg px-3 py-2">Nome</th>
            <th className="px-3 py-2">Vaga</th>
            <th className="px-3 py-2">Loja</th>
            <th className="px-3 py-2">Etapa</th>
            <th className="px-3 py-2">Última atualização</th>
            <th className="rounded-r-lg px-3 py-2">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const pill = STAGE_PILL[r.stage.key] ?? STAGE_PILL.applied;
            const Ico = pill.icon;
            return (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/80 text-[10px] font-bold text-ink">
                      {r.candidate.fullName.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                    <span className="whitespace-nowrap">{r.candidate.fullName}</span>
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{r.job.title}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.job.store.name}</td>
                <td className="px-3 py-2">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap", pill.cls)}>
                    <Ico size={14} weight="fill" /> {r.stage.name}
                  </span>
                </td>
                <td className="tabular px-3 py-2 whitespace-nowrap">{whenLabel(r.lastMovedAt)}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2 text-ink">
                    <Link prefetch={false} href={`/candidatos/${r.candidate.id}`} title="Ver candidato" aria-label={`Ver ${r.candidate.fullName}`} className="rounded p-1 hover:bg-surface">
                      <Eye size={18} weight="bold" />
                    </Link>
                    {canEdit && (
                      <Link prefetch={false} href={`/candidatos/${r.candidate.id}?editar=1`} title="Editar" aria-label={`Editar ${r.candidate.fullName}`} className="rounded p-1 hover:bg-surface">
                        <PencilSimple size={18} weight="bold" />
                      </Link>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ───────── Banner ─────────
export function FootprintBanner({ stores, states, contacts }: { stores: number; states: string[]; contacts: number }) {
  const statesLabel = states.length === 0 ? "—" : states.length <= 4 ? states.join(" | ") : `${states.length}`;
  return (
    <section className="relative flex min-w-0 flex-col justify-between gap-6 overflow-hidden rounded-[var(--radius-card)] bg-ink p-6 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,185,0,0.16),transparent_55%)]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-10 -bottom-16 h-48 w-48 rounded-full border-[28px] border-white/[0.04]" aria-hidden="true" />
      <div className="relative flex items-center gap-5">
        <span className="text-brand"><ChartLineUp size={64} weight="fill" /></span>
        <p className="text-[19px] leading-snug font-bold 2xl:text-[21px]">
          Recrutamento estratégico,
          <br />
          <span className="text-brand">resultados ainda maiores.</span>
        </p>
      </div>
      <div className="relative grid grid-cols-[0.8fr_1.35fr_1fr] divide-x divide-white/15 border-t border-white/10 pt-5">
        {[
          { icon: Trophy, value: stores.toLocaleString("pt-BR"), label: "Lojas" },
          { icon: MapPin, value: statesLabel, label: "Estados" },
          { icon: UsersThree, value: contacts.toLocaleString("pt-BR"), label: "Contatos" },
        ].map(({ icon: Ico, value, label }) => (
          <div key={label} className="flex items-center justify-center gap-2.5 px-2">
            <Ico size={26} weight="fill" className="shrink-0 text-brand" />
            <div className="min-w-0">
              <p className="text-[15px] leading-tight font-bold whitespace-nowrap 2xl:text-[17px]">{value}</p>
              <p className="text-[13px] text-white/75">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SeeAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-semibold whitespace-nowrap text-ink hover:underline hover:decoration-brand hover:decoration-2 hover:underline-offset-4">
      {children} <ArrowRight size={14} weight="bold" />
    </Link>
  );
}
