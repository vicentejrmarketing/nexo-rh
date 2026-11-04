import type { ActionResult } from "@/server/errors";

// Formulários: em caso de erro, a ação devolve o que foi digitado (values) e um contador
// (submission) que remonta os campos com esses valores — nada se perde.
export type FormValues = Record<string, string | string[]>;
export type FormState<D = undefined> = ActionResult<D> & { values?: FormValues; submission?: number };

const SKIP = /^\$ACTION_|^__/;

export function formValues(fd: FormData): FormValues {
  const out: FormValues = {};
  for (const key of new Set(fd.keys())) {
    if (SKIP.test(key)) continue;
    const all = fd.getAll(key).filter((v): v is string => typeof v === "string");
    if (all.length === 0) continue;
    out[key] = all.length > 1 || key.endsWith("[]") ? all : all[0];
  }
  return out;
}

export function str(v: FormValues, key: string): string {
  const x = v[key];
  return Array.isArray(x) ? (x[0] ?? "") : (x ?? "");
}

export function list(v: FormValues, key: string): string[] {
  const x = v[key];
  return Array.isArray(x) ? x : x ? [x] : [];
}

/** Valor para defaultValue: o que foi digitado, senão o valor salvo, senão "". */
export function pick(state: { values?: FormValues } | undefined, key: string, saved?: string | number | null): string {
  if (state?.values && key in state.values) return str(state.values, key);
  return saved === null || saved === undefined ? "" : String(saved);
}

export function nextSubmission(prev: { submission?: number }): number {
  return (prev.submission ?? 0) + 1;
}

/** Converte "1.800,50" ou "1800.50" em número; vazio vira null. */
export function parseMoneyBR(v: string): number | null {
  const s = v.trim().replace(/[R$\s]/g, "");
  if (!s) return null;
  // Com vírgula: "1.800,50". Sem vírgula, pontos em grupos de 3 são milhar ("2.200" = 2200).
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

export function formatMoneyBR(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "";
  return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Mensagem mais útil de um resultado com erro: o primeiro erro de campo, senão a mensagem geral. */
export function errorText(r: { ok: boolean; message?: string; fieldErrors?: Record<string, string[]> }): string {
  const first = r.fieldErrors ? Object.values(r.fieldErrors).flat()[0] : undefined;
  return first ?? r.message ?? "Não foi possível concluir.";
}
