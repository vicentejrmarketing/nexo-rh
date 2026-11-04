// Períodos do painel, sempre no fuso de São Paulo.
// O Brasil não tem horário de verão desde 2019, então o deslocamento é fixo em -03:00.
const OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PeriodKey = "hoje" | "7d" | "30d" | "mes" | "mes-anterior" | "personalizado";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  hoje: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  mes: "Mês atual",
  "mes-anterior": "Mês anterior",
  personalizado: "Período personalizado",
};

export type Period = {
  key: PeriodKey;
  label: string;
  from: Date; // inclusivo
  to: Date; // exclusivo
  prevFrom: Date; // período anterior de mesma duração, para a variação
  prevTo: Date;
};

/** Meia-noite (horário de São Paulo) do dia que contém `d`, em UTC. */
export function startOfDaySP(d: Date): Date {
  const local = d.getTime() + OFFSET_MS;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS - OFFSET_MS);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Partes da data no horário de São Paulo. */
export function partsSP(d: Date) {
  const local = new Date(d.getTime() + OFFSET_MS);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), day: local.getUTCDate(), hour: local.getUTCHours(), min: local.getUTCMinutes() };
}

function monthStartSP(y: number, m: number): Date {
  return new Date(Date.UTC(y, m, 1) - OFFSET_MS);
}

/** Converte "AAAA-MM-DD" em meia-noite de São Paulo; null se inválido. */
export function parseDateSP(s: string | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) - OFFSET_MS);
  return Number.isNaN(dt.getTime()) || partsSP(dt).day !== d ? null : dt;
}

export function resolvePeriod(key: string | undefined, custom: { de?: string; ate?: string } = {}, now = new Date()): Period {
  const today = startOfDaySP(now);
  let k: PeriodKey = (Object.keys(PERIOD_LABELS) as PeriodKey[]).includes(key as PeriodKey) ? (key as PeriodKey) : "hoje";
  let from: Date;
  let to: Date;
  switch (k) {
    case "7d":
      from = addDays(today, -6);
      to = addDays(today, 1);
      break;
    case "30d":
      from = addDays(today, -29);
      to = addDays(today, 1);
      break;
    case "mes": {
      const p = partsSP(now);
      from = monthStartSP(p.y, p.m);
      to = addDays(today, 1);
      break;
    }
    case "mes-anterior": {
      const p = partsSP(now);
      from = monthStartSP(p.m === 0 ? p.y - 1 : p.y, (p.m + 11) % 12);
      to = monthStartSP(p.y, p.m);
      break;
    }
    case "personalizado": {
      const de = parseDateSP(custom.de);
      const ate = parseDateSP(custom.ate);
      if (de && ate && de <= ate && ate.getTime() - de.getTime() <= 366 * DAY_MS) {
        from = de;
        to = addDays(ate, 1);
      } else {
        k = "30d";
        from = addDays(today, -29);
        to = addDays(today, 1);
      }
      break;
    }
    default:
      from = today;
      to = addDays(today, 1);
  }
  const len = to.getTime() - from.getTime();
  return { key: k, label: PERIOD_LABELS[k], from, to, prevFrom: new Date(from.getTime() - len), prevTo: from };
}

/** Lista de dias (meia-noite SP) entre from (incl.) e to (excl.). */
export function daysBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let d = startOfDaySP(from); d < to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function dayKey(d: Date): string {
  const p = partsSP(d);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Variação percentual; null quando não há base de comparação. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function greetingSP(now = new Date()): string {
  const h = partsSP(now).hour;
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
