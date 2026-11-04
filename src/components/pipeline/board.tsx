"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowsLeftRight, CalendarPlus, CalendarDots, Clock, Warning, WhatsappLogo, X } from "@phosphor-icons/react";
import { Alert, Button, Textarea, cn } from "@/components/ui";
import { errorText } from "@/lib/form";
import { digitsOnly } from "@/lib/phone";
import { moveProcessAction } from "@/app/(app)/funil/actions";

export type BoardCard = {
  id: string; candidateId: string; candidateName: string; city: string | null; whatsapp: string | null; jobTitle: string; storeName: string;
  recruiter: string | null; idleDays: number; stalled: boolean; canMove: boolean; source: string; nextInterview: string | null; nextInterviewMode: string | null;
};
export type BoardColumn = { key: string; name: string; kind: string; total: number; cards: BoardCard[] };

const COLUMN_TONE: Record<string, string> = {
  OPEN: "bg-ink text-white",
  HIRED: "bg-success text-white",
  REJECTED: "bg-danger text-white",
  WITHDRAWN: "bg-muted text-white",
};

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

type Pending = { card: BoardCard; from: string; to: string };

export function PipelineBoard({ columns: initial, canSchedule }: { columns: BoardColumn[]; canSchedule: boolean }) {
  const [columns, setColumns] = useState(initial);
  const [dragging, setDragging] = useState<{ id: string; from: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  // Dados novos do servidor (após mover ou mudar filtros) substituem o estado local.
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setColumns(initial);
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const stageName = (key: string) => columns.find((c) => c.key === key)?.name ?? key;

  function applyLocal(cardId: string, from: string, to: string) {
    setColumns((cols) => {
      const card = cols.find((c) => c.key === from)?.cards.find((x) => x.id === cardId);
      if (!card) return cols;
      return cols.map((c) =>
        c.key === from ? { ...c, total: c.total - 1, cards: c.cards.filter((x) => x.id !== cardId) }
          : c.key === to ? { ...c, total: c.total + 1, cards: [{ ...card, idleDays: 0, stalled: false }, ...c.cards] }
          : c,
      );
    });
  }

  return (
    <>
      {toast && (
        <div className="fixed right-4 bottom-4 z-50 max-w-sm" role="status">
          <Alert tone={toast.tone}>{toast.text}</Alert>
        </div>
      )}
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex min-w-max gap-3">
          {columns.map((col) => (
            <section
              key={col.key}
              aria-label={`Etapa ${col.name}`}
              onDragOver={(e) => {
                if (!dragging || dragging.from === col.key) return;
                e.preventDefault();
                setOver(col.key);
              }}
              onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (!dragging || dragging.from === col.key) return;
                const card = columns.find((c) => c.key === dragging.from)?.cards.find((x) => x.id === dragging.id);
                if (card) setPending({ card, from: dragging.from, to: col.key });
                setDragging(null);
              }}
              className={cn(
                "flex w-[272px] shrink-0 flex-col rounded-[var(--radius-card)] bg-white/60 ring-1 ring-black/[0.05] transition",
                over === col.key && "bg-brand-soft ring-2 ring-brand",
              )}
            >
              <header className="flex items-center justify-between gap-2 p-3">
                <h2 className="truncate text-[14px] font-bold">{col.name}</h2>
                <span className={cn("tabular rounded-full px-2 py-0.5 text-[12px] font-bold", COLUMN_TONE[col.kind] ?? COLUMN_TONE.OPEN)}>{col.total}</span>
              </header>
              <ul className="flex max-h-[calc(100vh-290px)] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {col.cards.length === 0 && <li className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[12px] text-muted">Arraste um candidato para cá</li>}
                {col.cards.map((card) => (
                  <Card
                    key={card.id}
                    card={card}
                    stageKey={col.key}
                    columns={columns}
                    canSchedule={canSchedule && col.kind === "OPEN"}
                    onDragStart={() => setDragging({ id: card.id, from: col.key })}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                    onMove={(to) => setPending({ card, from: col.key, to })}
                  />
                ))}
                {col.total > col.cards.length && <li className="px-2 py-1 text-center text-[12px] text-muted">+{col.total - col.cards.length} — use os filtros para ver</li>}
              </ul>
            </section>
          ))}
        </div>
      </div>
      {pending && (
        <MoveDialog
          pending={pending}
          fromName={stageName(pending.from)}
          toName={stageName(pending.to)}
          toKind={columns.find((c) => c.key === pending.to)?.kind ?? "OPEN"}
          onClose={() => setPending(null)}
          onDone={(ok, text) => {
            if (ok) applyLocal(pending.card.id, pending.from, pending.to);
            setToast({ tone: ok ? "success" : "danger", text });
            setPending(null);
          }}
        />
      )}
    </>
  );
}

function Card({
  card, stageKey, columns, canSchedule, onDragStart, onDragEnd, onMove,
}: {
  card: BoardCard; stageKey: string; columns: BoardColumn[]; canSchedule: boolean; onDragStart: () => void; onDragEnd: () => void; onMove: (to: string) => void;
}) {
  return (
    <li
      draggable={card.canMove}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group rounded-xl border bg-white p-3 shadow-[0_1px_6px_rgba(17,18,22,0.05)]",
        card.stalled ? "border-warning/50" : "border-black/[0.06]",
        card.canMove && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/candidatos/${card.candidateId}`} className="min-w-0 text-[14px] leading-snug font-semibold hover:underline" draggable={false}>
          {card.candidateName}
        </Link>
        {card.whatsapp && (
          <a href={`https://wa.me/${digitsOnly(card.whatsapp)}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${card.candidateName}`} className="shrink-0 text-muted hover:text-success" draggable={false}>
            <WhatsappLogo size={17} weight="fill" />
          </a>
        )}
      </div>
      <p className="mt-0.5 truncate text-[12px] text-muted">{card.jobTitle} · {card.storeName}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
        {card.stalled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 font-semibold text-warning"><Warning size={12} weight="fill" /> Parado há {card.idleDays} d</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted"><Clock size={12} /> {card.idleDays === 0 ? "hoje" : `${card.idleDays} d na etapa`}</span>
        )}
        {card.source === "ONLINE_FORM" && <span className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold">Site</span>}
        {card.nextInterview && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5"><CalendarDots size={12} /> {fmt.format(new Date(card.nextInterview))}</span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
        <span className="truncate text-[11.5px] text-muted">{card.recruiter ?? "Sem recrutador"}</span>
        <span className="flex shrink-0 items-center gap-1">
          {canSchedule && !card.nextInterview && (
            <Link href={`/entrevistas/nova?processo=${card.id}`} title="Agendar entrevista" aria-label="Agendar entrevista" className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink" draggable={false}>
              <CalendarPlus size={16} />
            </Link>
          )}
          {card.canMove && (
            <label className="relative rounded-md p-1 text-muted hover:bg-surface hover:text-ink" title="Mover para outra etapa">
              <ArrowsLeftRight size={16} />
              <span className="sr-only">Mover {card.candidateName} para</span>
              <select
                value=""
                onChange={(e) => e.target.value && onMove(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                <option value="">Mover para…</option>
                {columns.filter((c) => c.key !== stageKey).map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              </select>
            </label>
          )}
        </span>
      </div>
    </li>
  );
}

function MoveDialog({ pending, fromName, toName, toKind, onClose, onDone }: { pending: Pending; fromName: string; toName: string; toKind: string; onClose: () => void; onDone: (ok: boolean, text: string) => void }) {
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const finalStage = toKind !== "OPEN";
  const submit = () =>
    start(async () => {
      const r = await moveProcessAction(pending.card.id, pending.to, note);
      if (r.ok) onDone(true, `${pending.card.candidateName} foi para ${toName}.`);
      else setError(errorText(r));
    });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="move-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="move-title" className="text-[17px] font-bold">Mover {pending.card.candidateName}</h2>
            <p className="mt-0.5 text-[13.5px] text-muted">{fromName} → <strong className="text-ink">{toName}</strong> · {pending.card.jobTitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-md p-1 text-muted hover:bg-surface"><X size={18} /></button>
        </div>
        {finalStage && (
          <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-[12.5px] text-muted">
            {toKind === "HIRED" ? "O processo será concluído como contratação." : toKind === "REJECTED" ? "O processo será encerrado como reprovação." : "O processo será encerrado como desistência."} Dá para reabrir movendo de volta.
          </p>
        )}
        <label className="mt-4 block text-[13px] font-medium" htmlFor="move-note">Observação da movimentação {finalStage ? "(recomendada)" : "(opcional)"}</label>
        <Textarea
          ref={ref}
          id="move-note"
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
          placeholder={toKind === "REJECTED" ? "Motivo da reprovação" : "Ex.: contato feito por WhatsApp, entrevista combinada"}
          className="mt-1.5 min-h-20"
        />
        {error && <div className="mt-3"><Alert>{error}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={busy}>{busy ? "Movendo…" : `Mover para ${toName}`}</Button>
        </div>
      </div>
    </div>
  );
}
