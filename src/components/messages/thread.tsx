"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowClockwise, Check, Checks, Clock, File, Image as ImageIcon, Microphone, PaperPlaneRight, Warning, VideoCamera } from "@phosphor-icons/react";
import { Alert, Button, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { errorText } from "@/lib/form";
import { retryAction, sendTemplateAction, sendTextAction } from "@/app/(app)/mensagens/actions";

export type ThreadMessage = {
  id: string; direction: "INBOUND" | "OUTBOUND"; body: string | null; status: string; mediaType: string | null; hasMedia: boolean; errorMessage: string | null;
  createdAt: string; sender: string | null; template: string | null; retrying: boolean;
};
export type TemplateOpt = { id: string; name: string; purpose: string; approved: boolean; metaBody: string; vars: { key: string; label: string }[] };

const hm = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

function StatusIcon({ m }: { m: ThreadMessage }) {
  if (m.status === "FAILED") return <Warning size={14} weight="fill" className="text-danger" aria-label="Falhou" />;
  if (m.status === "QUEUED") return <Clock size={13} className="text-muted" aria-label="Na fila" />;
  if (m.status === "READ") return <Checks size={14} weight="bold" className="text-[#1d9bf0]" aria-label="Lida" />;
  if (m.status === "DELIVERED") return <Checks size={14} weight="bold" className="text-muted" aria-label="Entregue" />;
  return <Check size={14} weight="bold" className="text-muted" aria-label="Enviada" />;
}

const MEDIA: Record<string, { icon: typeof File; label: string }> = {
  image: { icon: ImageIcon, label: "Imagem" }, document: { icon: File, label: "Documento" }, audio: { icon: Microphone, label: "Áudio" },
  video: { icon: VideoCamera, label: "Vídeo" }, sticker: { icon: ImageIcon, label: "Figurinha" },
};

function Bubble({ m }: { m: ThreadMessage }) {
  const out = m.direction === "OUTBOUND";
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const media = m.mediaType ? MEDIA[m.mediaType] : null;
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[78%] rounded-2xl px-3.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.08)]", out ? "rounded-br-md bg-[#fff3c4]" : "rounded-bl-md bg-white")}>
        {m.template && <p className="mb-0.5 text-[11px] font-semibold text-ink/50">Modelo: {m.template}</p>}
        {media && (
          m.hasMedia ? (
            <a href={`/api/whatsapp/media/${m.id}`} target="_blank" rel="noopener" className="mb-1 inline-flex items-center gap-1.5 rounded-lg bg-black/5 px-2.5 py-1.5 text-[13px] font-medium hover:bg-black/10">
              <media.icon size={16} /> Abrir {media.label.toLowerCase()}
            </a>
          ) : <p className="mb-1 inline-flex items-center gap-1.5 text-[13px] text-muted"><media.icon size={16} /> {media.label}</p>
        )}
        {m.body && <p className="text-[14px] leading-snug break-words whitespace-pre-wrap">{m.body}</p>}
        <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-ink/50">
          {out && m.sender && <span className="mr-1">{m.sender} ·</span>}
          {hm.format(new Date(m.createdAt))}
          {out && <StatusIcon m={m} />}
        </p>
        {out && (m.status === "FAILED" || m.retrying) && (
          <div className="mt-1.5 border-t border-black/10 pt-1.5 text-[12px]">
            <p className="text-danger">{m.retrying ? `Nova tentativa automática em instantes. ${m.errorMessage ?? ""}` : m.errorMessage ?? "Não enviada."}</p>
            {m.status === "FAILED" && (
              <button type="button" disabled={pending} onClick={() => start(async () => { const r = await retryAction(m.id); setErr(r.ok ? null : errorText(r)); })} className="mt-1 inline-flex items-center gap-1 font-semibold underline">
                <ArrowClockwise size={12} /> {pending ? "Tentando…" : "Tentar de novo"}
              </button>
            )}
            {err && <p className="text-danger">{err}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export function Thread({ messages }: { messages: ThreadMessage[] }) {
  const end = useRef<HTMLDivElement>(null);
  const last = messages.at(-1)?.id;
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [last]);
  const days = messages.map((m) => dayOf(m.createdAt));
  return (
    <div className="flex flex-col gap-2 px-4 py-4">
      {messages.length === 0 && <p className="py-10 text-center text-[13px] text-muted">Nenhuma mensagem ainda.</p>}
      {messages.map((m, i) => {
        const sep = i === 0 || days[i] !== days[i - 1];
        return (
          <div key={m.id}>
            {sep && <p className="my-2 text-center"><span className="rounded-full bg-white/80 px-3 py-1 text-[11.5px] font-medium text-muted capitalize shadow-sm">{dayFmt.format(new Date(m.createdAt))}</span></p>}
            <Bubble m={m} />
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

export function Composer({
  conversationId, windowOpen, windowEndsAt, templates, context, optedOut, connected, canSend, initialTemplate,
}: {
  conversationId: string; windowOpen: boolean; windowEndsAt: string | null; templates: TemplateOpt[]; context: Record<string, string>;
  optedOut: boolean; connected: boolean; canSend: boolean; initialTemplate?: string;
}) {
  const [tab, setTab] = useState<"texto" | "modelo">(windowOpen && !initialTemplate ? "texto" : "modelo");
  const [text, setText] = useState("");
  const usable = useMemo(() => templates.filter((t) => windowOpen || t.approved), [templates, windowOpen]);
  const [tplId, setTplId] = useState(() => usable.find((t) => t.id === initialTemplate || t.purpose === initialTemplate)?.id ?? usable[0]?.id ?? "");
  const tpl = usable.find((t) => t.id === tplId);
  const [vals, setVals] = useState<Record<string, string>>(context);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canSend) return <p className="border-t border-line bg-white px-4 py-3 text-[13px] text-muted">Seu perfil pode ver as conversas, mas não enviar mensagens.</p>;
  if (!connected) return <p className="border-t border-line bg-white px-4 py-3 text-[13px] text-muted">O WhatsApp não está conectado. Um administrador precisa configurar em Configurações → Integração WhatsApp.</p>;
  if (optedOut) return <p className="border-t border-line bg-warning-soft px-4 py-3 text-[13px] text-warning">O candidato pediu para não receber mensagens. Só registre a volta da autorização se ele pedir.</p>;

  const preview = tpl ? tpl.metaBody.replace(/\{\{(\d+)\}\}/g, (_, n: string) => vals[tpl.vars[Number(n) - 1]?.key] || `[${tpl.vars[Number(n) - 1]?.label ?? n}]`) : "";
  const send = () =>
    start(async () => {
      setError(null);
      const r = tab === "texto" ? await sendTextAction(conversationId, text) : await sendTemplateAction(conversationId, tplId, vals);
      if (r.ok) setText("");
      else setError(errorText(r));
    });

  return (
    <div className="border-t border-line bg-white">
      <div className="flex items-center gap-1 px-3 pt-2">
        {(["texto", "modelo"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={cn("rounded-md px-3 py-1 text-[12.5px] font-semibold", tab === t ? "bg-ink text-white" : "text-muted hover:text-ink")}>
            {t === "texto" ? "Mensagem" : "Modelo"}
          </button>
        ))}
        <span className={cn("ml-auto text-[11.5px]", windowOpen ? "text-success" : "text-muted")}>
          {windowOpen ? `Janela de 24 h aberta até ${windowEndsAt ? hm.format(new Date(windowEndsAt)) : ""}` : "Janela de 24 h fechada: só modelos aprovados"}
        </span>
      </div>
      {error && <div className="px-3 pt-2"><Alert>{error}</Alert></div>}
      {tab === "texto" ? (
        <div className="flex items-end gap-2 p-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && windowOpen && text.trim()) { e.preventDefault(); send(); } }}
            disabled={!windowOpen || pending}
            placeholder={windowOpen ? "Escreva uma mensagem (Enter envia, Shift+Enter quebra linha)" : "O candidato não escreveu nas últimas 24 h. Use a aba Modelo."}
            className="max-h-40 min-h-11 flex-1 resize-none"
            maxLength={4096}
            aria-label="Mensagem"
          />
          <Button type="button" onClick={send} disabled={!windowOpen || !text.trim() || pending} aria-label="Enviar"><PaperPlaneRight size={18} weight="fill" /></Button>
        </div>
      ) : usable.length === 0 ? (
        <p className="p-3 text-[13px] text-muted">{windowOpen ? "Nenhum modelo ativo." : "Nenhum modelo aprovado pela Meta ainda. Envie para aprovação em Configurações → Modelos de mensagens."}</p>
      ) : (
        <div className="flex flex-col gap-3 p-3">
          <Select value={tplId} onChange={(e) => setTplId(e.target.value)} aria-label="Modelo">
            {usable.map((t) => <option key={t.id} value={t.id}>{t.name}{t.approved ? "" : " (só dentro da janela)"}</option>)}
          </Select>
          {tpl && tpl.vars.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {tpl.vars.map((v) => (
                <Field key={v.key} label={v.label} htmlFor={`v-${v.key}`}>
                  <Input id={`v-${v.key}`} value={vals[v.key] ?? ""} onChange={(e) => setVals({ ...vals, [v.key]: e.target.value })} maxLength={500} />
                </Field>
              ))}
            </div>
          )}
          {tpl && <p className="rounded-lg bg-[#fff3c4] px-3 py-2 text-[13.5px] whitespace-pre-line">{preview}</p>}
          <div className="flex justify-end"><Button type="button" onClick={send} disabled={!tpl || pending}><PaperPlaneRight size={16} weight="fill" /> {pending ? "Enviando…" : "Enviar modelo"}</Button></div>
        </div>
      )}
    </div>
  );
}
