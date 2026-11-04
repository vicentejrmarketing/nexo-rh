"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowCounterClockwise, Copy, SkipForward, WarningCircle, WhatsappLogo } from "@phosphor-icons/react";
import { Alert, Button, Input, cn } from "@/components/ui";
import { errorText } from "@/lib/form";
import { requeueDispatchAction, sendDispatchAction, skipDispatchAction } from "@/app/(app)/mensagens/enviar/actions";

/** Abre o WhatsApp com o texto pronto. A janela abre no clique (antes da resposta do servidor) para o navegador não bloquear. */
export async function openWhatsApp(getUrl: () => Promise<{ ok: boolean; data?: string; message?: string }>) {
  const w = window.open("about:blank", "_blank");
  const r = await getUrl();
  if (r.ok && r.data) {
    if (w) w.location.href = r.data;
    else window.location.href = r.data;
  } else w?.close();
  return r;
}

export type QueueRow = {
  id: string; rule: string; candidateId: string; candidate: string; job: string; stage: string; phone: string | null; body: string | null;
  reason: string | null; dueAt: string; fixHref: string | null; interview: string | null;
};

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export function QueueItem({ row, blocked }: { row: QueueRow; blocked?: boolean }) {
  const [state, setState] = useState<"idle" | "sent" | "skipped">("idle");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState("");
  const [copied, setCopied] = useState(false);
  if (state !== "idle") {
    return (
      <li className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3 text-[13.5px]">
        <span><strong>{row.candidate}</strong> · {row.rule}: {state === "sent" ? "registrada como enviada. Confirme o envio no WhatsApp que abriu." : "pulada."}</span>
        {state === "skipped" && <Button type="button" size="sm" variant="ghost" onClick={() => start(async () => { const r = await requeueDispatchAction(row.id); if (r.ok) setState("idle"); })}>Desfazer</Button>}
      </li>
    );
  }
  return (
    <li className={cn("rounded-xl border bg-white p-4 shadow-[0_1px_6px_rgba(17,18,22,0.04)]", blocked ? "border-warning/40" : "border-black/[0.06]")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <Link href={`/candidatos/${row.candidateId}`} className="font-semibold hover:underline">{row.candidate}</Link>
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11.5px] font-semibold">{row.rule}</span>
          </p>
          <p className="text-[12.5px] text-muted">{row.job} · {row.stage}{row.interview ? ` · entrevista ${row.interview}` : ""} · desde {fmt.format(new Date(row.dueAt))}</p>
        </div>
        {!blocked && row.phone && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={() => start(async () => {
                setError(null);
                const r = await openWhatsApp(() => sendDispatchAction(row.id));
                if (r.ok) setState("sent");
                else setError(errorText(r as never));
              })}
            >
              <WhatsappLogo size={17} weight="fill" /> {pending ? "Abrindo…" : "Enviar no WhatsApp"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={async () => { await navigator.clipboard.writeText(row.body ?? "").catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }} aria-label="Copiar texto">
              <Copy size={15} /> {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        )}
      </div>
      {blocked ? (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning">
          <WarningCircle size={17} weight="fill" className="mt-0.5 shrink-0" />
          <span>{row.reason} {row.fixHref && <Link href={row.fixHref} className="font-semibold underline underline-offset-2">Corrigir</Link>}</span>
        </p>
      ) : (
        row.body && <p className="mt-3 rounded-lg bg-[#fff3c4] px-3 py-2 text-[13.5px] whitespace-pre-line">{row.body}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {skipping ? (
          <>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (opcional)" className="h-9 max-w-xs text-[13px]" />
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await skipDispatchAction(row.id, reason); if (r.ok) setState("skipped"); else setError(errorText(r)); })}>Confirmar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSkipping(false)}>Cancelar</Button>
          </>
        ) : (
          <button type="button" onClick={() => setSkipping(true)} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-muted hover:text-ink"><SkipForward size={14} /> Não enviar esta</button>
        )}
      </div>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    </li>
  );
}

export function RequeueButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await requeueDispatchAction(id); setError(r.ok ? null : errorText(r)); })} className="inline-flex items-center gap-1 text-[12.5px] font-semibold underline underline-offset-2">
        <ArrowCounterClockwise size={13} /> Voltar para a fila
      </button>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </span>
  );
}

