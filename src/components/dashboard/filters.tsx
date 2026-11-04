"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarBlank, CaretDown } from "@phosphor-icons/react";
import { useDismiss } from "@/components/layout/sidebar";
import { Button, Select, cn, inputClass } from "@/components/ui";

const PERIODS = [
  ["hoje", "Hoje"],
  ["7d", "Últimos 7 dias"],
  ["30d", "Últimos 30 dias"],
  ["mes", "Mês atual"],
  ["mes-anterior", "Mês anterior"],
  ["personalizado", "Período personalizado"],
] as const;

type Opt = { id: string; name: string };

function useParamUpdater() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    start(() => router.push(`?${next.toString()}`, { scroll: false }));
  };
  return { params, update, pending };
}

/** Botão "Hoje" da referência: abre período, período personalizado, loja e recrutador. */
export function DashboardFilter({ label, stores, recruiters }: { label: string; stores: Opt[]; recruiters: Opt[] }) {
  const { params, update, pending } = useParamUpdater();
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const [period, setPeriod] = useState(params.get("periodo") ?? "hoje");
  const [de, setDe] = useState(params.get("de") ?? "");
  const [ate, setAte] = useState(params.get("ate") ?? "");
  const [loja, setLoja] = useState(params.get("loja") ?? "");
  const [recrutador, setRecrutador] = useState(params.get("recrutador") ?? "");
  const extra = [loja && stores.find((s) => s.id === loja)?.name, recrutador && recruiters.find((r) => r.id === recrutador)?.name].filter(Boolean);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex h-12 items-center gap-2.5 rounded-full bg-white px-5 text-[15px] font-semibold text-ink shadow-[0_2px_10px_rgba(17,18,22,0.06)] hover:bg-surface",
          pending && "opacity-70",
        )}
      >
        <CalendarBlank size={20} weight="regular" />
        <span className="max-w-[220px] truncate">{[label, ...extra].join(" · ")}</span>
        <CaretDown size={15} weight="bold" />
      </button>
      {open && (
        <form
          className="absolute right-0 z-30 mt-2 w-[300px] rounded-2xl border border-line bg-white p-4 shadow-xl"
          onSubmit={(e) => {
            e.preventDefault();
            update({
              periodo: period === "hoje" ? undefined : period,
              de: period === "personalizado" ? de : undefined,
              ate: period === "personalizado" ? ate : undefined,
              loja: loja || undefined,
              recrutador: recrutador || undefined,
            });
            setOpen(false);
          }}
        >
          <fieldset>
            <legend className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Período</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {PERIODS.map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPeriod(k)}
                  aria-pressed={period === k}
                  className={cn("rounded-lg px-2.5 py-2 text-left text-[13px]", period === k ? "bg-ink font-semibold text-brand" : "bg-surface text-ink hover:bg-line", k === "personalizado" && "col-span-2")}
                >
                  {l}
                </button>
              ))}
            </div>
          </fieldset>
          {period === "personalizado" && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[12px] text-muted">
                De
                <input type="date" value={de} onChange={(e) => setDe(e.target.value)} required className={cn(inputClass, "mt-1 h-9 px-2 text-[13px]")} />
              </label>
              <label className="text-[12px] text-muted">
                Até
                <input type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} required className={cn(inputClass, "mt-1 h-9 px-2 text-[13px]")} />
              </label>
            </div>
          )}
          {stores.length > 0 && (
            <label className="mt-4 block text-[12px] font-semibold tracking-wide text-muted uppercase">
              Loja
              <Select value={loja} onChange={(e) => setLoja(e.target.value)} className="mt-1 h-9 text-[13px] font-normal normal-case">
                <option value="">Todas as lojas</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </label>
          )}
          {recruiters.length > 0 && (
            <label className="mt-3 block text-[12px] font-semibold tracking-wide text-muted uppercase">
              Recrutador
              <Select value={recrutador} onChange={(e) => setRecrutador(e.target.value)} className="mt-1 h-9 text-[13px] font-normal normal-case">
                <option value="">Todos os recrutadores</option>
                {recruiters.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </label>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                update({ periodo: undefined, de: undefined, ate: undefined, loja: undefined, recrutador: undefined });
                setOpen(false);
              }}
            >
              Limpar
            </Button>
            <Button type="submit" size="sm">Aplicar</Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Seletor compacto (ex.: "Últimos 30 dias", "Top 5") que grava o valor na URL. */
export function ParamSelect({ param, value, options, label }: { param: string; value: string; options: [string, string][]; label: string }) {
  const { update, pending } = useParamUpdater();
  return (
    <span className="relative inline-flex items-center">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => update({ [param]: e.target.value })}
        className={cn(
          "h-9 appearance-none rounded-full border border-line bg-white py-0 pr-8 pl-4 text-[13px] font-medium text-ink hover:border-ink/30 focus:outline-none",
          pending && "opacity-60",
        )}
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <CaretDown size={13} weight="bold" className="pointer-events-none absolute right-3" />
    </span>
  );
}
