import { ArrowDown, ArrowUp, CalendarDots, ChatsCircle, CheckCircle, UserCheck, UsersThree } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Kpi, KpiKey } from "@/server/modules/dashboard/service";

const META: Record<KpiKey, { label: string; icon: Icon }> = {
  candidates: { label: "Candidatos cadastrados", icon: UsersThree },
  conversations: { label: "Conversas iniciadas", icon: ChatsCircle },
  interviews: { label: "Entrevistas agendadas", icon: CalendarDots },
  approved: { label: "Aprovados", icon: CheckCircle },
  hired: { label: "Contratações realizadas", icon: UserCheck },
};

/** Minigráfico amarelo com área suave, desenhado a partir da série diária real. */
function Sparkline({ values, id }: { values: number[]; id: string }) {
  const w = 78, h = 40, pad = 3;
  // Média móvel de 5 dias: mostra a tendência sem o serrilhado do dia a dia.
  const smooth = values.map((_, i) => {
    const win = values.slice(Math.max(0, i - 4), i + 1);
    return win.reduce((a, b) => a + b, 0) / win.length;
  });
  const max = Math.max(...smooth, 1);
  const step = smooth.length > 1 ? (w - pad * 2) / (smooth.length - 1) : 0;
  const pts = smooth.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2 - 6)] as const);
  // Curva suave (Catmull-Rom convertida em Bézier).
  const line = pts
    .map(([x, y], i) => {
      if (i === 0) return `M${x.toFixed(1)} ${y.toFixed(1)}`;
      const [x0, y0] = pts[Math.max(0, i - 2)];
      const [x1, y1] = pts[i - 1];
      const [x3, y3] = pts[Math.min(pts.length - 1, i + 1)];
      const c1x = x1 + (x - x0) / 6, c1y = y1 + (y - y0) / 6;
      const c2x = x - (x3 - x1) / 6, c2y = y - (y3 - y1) / 6;
      return `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const area = `${line} L${pts.at(-1)![0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-[64px]" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5B900" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#F5B900" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path d={line} fill="none" stroke="#F5B900" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const { label, icon: Ico } = META[kpi.key];
  const up = kpi.change !== null && kpi.change >= 0;
  return (
    <div className="@container relative overflow-hidden rounded-[var(--radius-card)] border border-black/[0.05] bg-white py-5 pr-4 pl-6 shadow-[0_2px_14px_rgba(17,18,22,0.05)]">
      <span className="absolute top-4 bottom-4 left-0 w-[5px] rounded-r-full bg-brand" aria-hidden="true" />
      <div className="flex items-center gap-4">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-brand text-ink">
          <Ico size={27} weight="fill" />
        </span>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="tabular text-[30px] leading-none font-bold tracking-tight text-ink">{kpi.value.toLocaleString("pt-BR")}</span>
            {kpi.change !== null && (
              <span className={`inline-flex items-center gap-0.5 text-[13px] font-semibold ${up ? "text-success" : "text-danger"}`} title="Comparado ao período anterior">
                {up ? <ArrowUp size={13} weight="bold" /> : <ArrowDown size={13} weight="bold" />}
                {up ? "+" : ""}
                {Math.abs(kpi.change) > 999 ? (up ? "999" : "-999") : kpi.change}%
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[13.5px] font-medium whitespace-nowrap text-ink/80">{label}</p>
        </div>
      </div>
      <div className="pointer-events-none absolute top-4 right-4 hidden @min-[230px]:block">
        <Sparkline values={kpi.spark} id={kpi.key} />
      </div>
    </div>
  );
}
