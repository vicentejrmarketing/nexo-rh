"use client";

import { Area, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Row = { day: string; candidatos: number; entrevistas: number; contratacoes: number };

const SERIES = [
  { key: "candidatos", label: "Candidatos", color: "#F5B900", badge: "#F5B900", text: "#111216" },
  { key: "entrevistas", label: "Entrevistas", color: "#111216", badge: "#111216", text: "#FFFFFF" },
  { key: "contratacoes", label: "Contratações", color: "#B9BAC2", badge: "#C9CAD1", text: "#111216" },
] as const;

const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Selo com o último valor de cada linha, como na referência. */
function EndBadge({ fill, text, total }: { fill: string; text: string; total: number }) {
  // eslint-disable-next-line react/display-name
  return (props: { x?: unknown; y?: unknown; value?: unknown; index?: number }) => {
    if (props.index !== total - 1) return null;
    const x = Number(props.x), y = Number(props.y);
    const label = String(props.value ?? 0);
    const w = Math.max(28, label.length * 8 + 14);
    return (
      <g>
        <rect x={x + 6} y={y - 11} width={w} height={22} rx={5} fill={fill} />
        <text x={x + 6 + w / 2} y={y + 4.5} textAnchor="middle" fontSize={13} fontWeight={700} fill={text}>
          {label}
        </text>
      </g>
    );
  };
}

export function PerformanceChart({ data }: { data: Row[] }) {
  const empty = data.every((r) => !r.candidatos && !r.entrevistas && !r.contratacoes);
  const tickEvery = Math.max(1, Math.ceil(data.length / 7));
  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap justify-center gap-5 text-[13px] text-ink/80">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 14, right: 46, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="perf-cand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F5B900" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#F5B900" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ECECF0" vertical horizontal strokeDasharray="0" />
            <XAxis
              dataKey="day"
              tickFormatter={fmtDay}
              interval={tickEvery - 1}
              tick={{ fontSize: 12.5, fill: "#3b3c44" }}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 13, fill: "#3b3c44", fontWeight: 600 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              labelFormatter={(d) => fmtDay(String(d))}
              contentStyle={{ borderRadius: 12, border: "1px solid #E6E6EA", fontSize: 13 }}
              formatter={(v, name) => [v, SERIES.find((s) => s.key === name)?.label ?? name]}
            />
            <Area type="monotone" dataKey="candidatos" stroke="#F5B900" strokeWidth={2.5} fill="url(#perf-cand)" dot={{ r: 4, fill: "#F5B900", strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false}>
              <LabelList dataKey="candidatos" content={EndBadge({ fill: SERIES[0].badge, text: SERIES[0].text, total: data.length })} />
            </Area>
            <Line type="monotone" dataKey="entrevistas" stroke="#111216" strokeWidth={2.5} dot={{ r: 4, fill: "#111216", strokeWidth: 0 }} isAnimationActive={false}>
              <LabelList dataKey="entrevistas" content={EndBadge({ fill: SERIES[1].badge, text: SERIES[1].text, total: data.length })} />
            </Line>
            <Line type="monotone" dataKey="contratacoes" stroke="#B9BAC2" strokeWidth={2.5} dot={{ r: 4, fill: "#B9BAC2", strokeWidth: 0 }} isAnimationActive={false}>
              <LabelList dataKey="contratacoes" content={EndBadge({ fill: SERIES[2].badge, text: SERIES[2].text, total: data.length })} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {empty && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-[13px] font-medium text-muted">
          Nenhum candidato, entrevista ou contratação neste período.
        </p>
      )}
    </div>
  );
}
