import { Badge } from "@/components/ui";

const STATUS = {
  SENT: { label: "Aguardando resposta", tone: "warning" },
  COMPLETED: { label: "Respondido", tone: "success" },
  EXPIRED: { label: "Link vencido", tone: "danger" },
  CANCELED: { label: "Substituído", tone: "neutral" },
} as const;

export function TestStatusBadge({ state }: { state: keyof typeof STATUS }) {
  return <Badge tone={STATUS[state].tone}>{STATUS[state].label}</Badge>;
}

/** Faixas fixas: 80+ Forte · 60–79 Adequado · 40–59 Atenção · abaixo de 40 Investigar. */
export function scoreBand(score: number) {
  if (score >= 80) return { label: "Forte", tone: "success" as const, color: "#15803d" };
  if (score >= 60) return { label: "Adequado", tone: "brand" as const, color: "#F5B900" };
  if (score >= 40) return { label: "Atenção", tone: "warning" as const, color: "#b45309" };
  return { label: "Investigar", tone: "danger" as const, color: "#c62828" };
}

export function ScoreBadge({ score }: { score: number }) {
  const b = scoreBand(score);
  return <Badge tone={b.tone}><strong className="tabular">{score}</strong> · {b.label}</Badge>;
}
