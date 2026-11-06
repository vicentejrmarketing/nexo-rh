"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

/** Radar das 8 competências (0–100). */
export function CompetencyRadar({ data }: { data: { name: string; score: number }[] }) {
  return (
    <div className="h-[320px] w-full" role="img" aria-label={`Gráfico das competências: ${data.map((d) => `${d.name} ${d.score}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke="#e6e6ea" />
          <PolarAngleAxis dataKey="name" tick={{ fontSize: 11.5, fill: "#111216" }} />
          <PolarRadiusAxis domain={[0, 100]} tickCount={6} tick={false} axisLine={false} />
          <Radar dataKey="score" stroke="#111216" strokeWidth={2} fill="#F5B900" fillOpacity={0.55} isAnimationActive={false} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[14px] font-semibold hover:border-ink print:hidden">
      Imprimir / salvar PDF
    </button>
  );
}
