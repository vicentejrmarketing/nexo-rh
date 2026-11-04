"use client";

import { useRef, useState, useTransition } from "react";
import { PencilSimple, Plus, Trash, WhatsappLogo } from "@phosphor-icons/react";
import { Alert, Badge, Button, Input, Select, Textarea, cn } from "@/components/ui";
import { errorText } from "@/lib/form";
import { addReminderAction, reminderOffsetAction, removeReminderAction, saveRuleTextAction, toggleRuleAction } from "@/app/(app)/mensagens/enviar/actions";

export type RuleView = { id: string; event: string; name: string; enabled: boolean; text: string; offsetMinutes: number | null; sent: number; hint: string };
type VarInfo = { key: string; label: string; example: string };

const OFFSETS = [[15, "15 minutos"], [30, "30 minutos"], [60, "1 hora"], [120, "2 horas"], [180, "3 horas"], [360, "6 horas"], [720, "12 horas"], [1440, "24 horas"], [2880, "2 dias"]] as const;

function Toggle({ id, enabled }: { id: string; enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "Desativar automação" : "Ativar automação"}
      disabled={pending}
      onClick={() => start(async () => { const r = await toggleRuleAction(id, !on); if (r.ok) setOn(!on); })}
      className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60", on ? "bg-brand" : "bg-line")}
    >
      <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1")} />
    </button>
  );
}

const render = (text: string, vars: VarInfo[]) => text.replace(/\{\{?([a-z_0-9]+)\}?\}/gi, (m, k: string) => vars.find((v) => v.key === k.toLowerCase())?.example ?? m);

export function RuleCard({ rule, vars }: { rule: RuleView; vars: VarInfo[] }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(rule.text);
  const [saved, setSaved] = useState(rule.text);
  const [phone, setPhone] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const reminder = rule.event.startsWith("reminder:");
  const insert = (k: string) => {
    const el = ref.current;
    const at = el?.selectionStart ?? text.length;
    setText(`${text.slice(0, at)}{${k}}${text.slice(el?.selectionEnd ?? at)}`);
    requestAnimationFrame(() => el?.focus());
  };
  const preview = render(editing ? text : saved, vars);
  const testHref = phone.replace(/\D/g, "").length >= 10 ? `https://wa.me/${(phone.replace(/\D/g, "").length <= 11 ? "55" : "") + phone.replace(/\D/g, "")}?text=${encodeURIComponent(`[TESTE] ${preview}`)}` : null;

  return (
    <li className={cn("rounded-xl border bg-white p-4", rule.enabled ? "border-black/[0.06]" : "border-line opacity-75")}>
      <div className="flex items-start gap-3">
        <Toggle id={rule.id} enabled={rule.enabled} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">{rule.name} {rule.sent > 0 && <Badge>{rule.sent} enviada(s)</Badge>}</p>
          <p className="text-[12.5px] text-muted">{rule.hint}</p>
        </div>
        {reminder && (
          <div className="flex items-center gap-1">
            <Select aria-label="Antecedência" defaultValue={rule.offsetMinutes ?? 60} disabled={pending} onChange={(e) => start(async () => { const r = await reminderOffsetAction(rule.id, Number(e.target.value)); setMsg(r.ok ? { ok: true, text: "Antecedência atualizada." } : { ok: false, text: errorText(r) }); })} className="h-9 w-auto text-[13px]">
              {OFFSETS.map(([m, l]) => <option key={m} value={m}>{l} antes</option>)}
            </Select>
            <Button type="button" size="sm" variant="ghost" aria-label="Remover lembrete" disabled={pending} onClick={() => start(async () => { await removeReminderAction(rule.id); })}><Trash size={15} /></Button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {vars.map((v) => <button key={v.key} type="button" title={v.label} onClick={() => insert(v.key)} className="rounded-full border border-line px-2 py-0.5 font-mono text-[11.5px] hover:border-ink">{`{${v.key}}`}</button>)}
          </div>
          <Textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} maxLength={1024} className="min-h-24" aria-label={`Texto de ${rule.name}`} />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => { setText(saved); setEditing(false); }}>Cancelar</Button>
            <Button type="button" size="sm" disabled={pending} onClick={() => start(async () => {
              const r = await saveRuleTextAction(rule.id, text);
              if (r.ok) { setSaved(text); setEditing(false); setMsg({ ok: true, text: "Texto salvo." }); } else setMsg({ ok: false, text: errorText(r) });
            })}>{pending ? "Salvando…" : "Salvar texto"}</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <p className="rounded-lg bg-[#fff3c4] px-3 py-2 text-[13.5px] whitespace-pre-line">{preview}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}><PencilSimple size={15} /> Editar texto</Button>
            <span className="flex items-center gap-1.5">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Seu WhatsApp para teste" inputMode="tel" className="h-8 w-48 text-[13px]" aria-label="Número para teste" />
              {testHref ? (
                <a href={testHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-[12.5px] font-semibold hover:border-ink"><WhatsappLogo size={15} weight="fill" /> Enviar teste</a>
              ) : (
                <span className="text-[12px] text-muted">com DDD</span>
              )}
            </span>
          </div>
        </div>
      )}
      {msg && <div className="mt-2"><Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert></div>}
    </li>
  );
}

export function AddReminder({ existing }: { existing: number[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const options = OFFSETS.filter(([m]) => !existing.includes(m));
  const [value, setValue] = useState<number>(options[0]?.[0] ?? 60);
  if (!options.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value} onChange={(e) => setValue(Number(e.target.value))} aria-label="Antecedência do novo lembrete" className="h-9 w-auto text-[13px]">
        {options.map(([m, l]) => <option key={m} value={m}>{l} antes</option>)}
      </Select>
      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await addReminderAction(value); setError(r.ok ? null : errorText(r)); })}><Plus size={15} weight="bold" /> Adicionar lembrete</Button>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
