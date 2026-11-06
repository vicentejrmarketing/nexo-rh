"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Brain, Check, CopySimple, MagnifyingGlass, WhatsappLogo, X } from "@phosphor-icons/react";
import { Alert, Button, Input, cn } from "@/components/ui";
import { createTestAction, findCandidatesAction, type TestCandidateHit } from "@/app/(app)/teste-comportamental/actions";

const digits = (v: string) => v.replace(/\D/g, "");

/** Link pronto: copiar ou enviar pelo WhatsApp (1 clique, sem custo). */
export function TestLinkBox({ url, firstName, jobTitle, phone, expiresAt, company }: { url: string; firstName: string; jobTitle: string | null; phone: string | null; expiresAt: string; company: string }) {
  const [copied, setCopied] = useState(false);
  const until = new Date(expiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const text = `Olá, ${firstName}! Faz parte do nosso processo seletivo${jobTitle ? ` para a vaga de ${jobTitle}` : ""} um teste comportamental rápido (cerca de 10 minutos). Não existem respostas certas ou erradas. Responda pelo link até ${until}: ${url}\n\n${company}`;
  return (
    <div className="flex flex-col gap-2.5">
      <input readOnly value={url} aria-label="Link do teste" onFocus={(e) => e.currentTarget.select()} className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[12.5px] outline-none" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={async () => {
          try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* o campo acima permite copiar manualmente */ }
        }}>{copied ? <Check size={16} /> : <CopySimple size={16} />} {copied ? "Copiado" : "Copiar link"}</Button>
        {phone && (
          <a href={`https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#25D366] px-3 text-[13.5px] font-semibold text-white hover:brightness-95">
            <WhatsappLogo size={17} weight="fill" /> Enviar pelo WhatsApp
          </a>
        )}
      </div>
      <p className="text-[12.5px] text-muted">Válido até {until}. O link só pode ser respondido uma vez.</p>
    </div>
  );
}

export function GenerateTestButton({ origin, company, preset, small }: { origin: string; company: string; preset?: TestCandidateHit; small?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size={small ? "sm" : "md"} variant={small ? "secondary" : "primary"} onClick={() => setOpen(true)} className={small ? undefined : "uppercase"}>
        <Brain size={small ? 16 : 18} weight="bold" /> {small ? "Gerar teste" : "Gerar teste"}
      </Button>
      {open && <GenerateDialog origin={origin} company={company} preset={preset} onClose={() => setOpen(false)} />}
    </>
  );
}

function GenerateDialog({ origin, company, preset, onClose }: { origin: string; company: string; preset?: TestCandidateHit; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<TestCandidateHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<TestCandidateHit | null>(preset ?? null);
  const [processId, setProcessId] = useState<string>(preset?.processes[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ path: string; expiresAt: string } | null>(null);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (picked) return;
    const n = ++seq.current;
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await findCandidatesAction(q);
      if (n === seq.current) { setHits(r); setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, picked]);

  function pick(c: TestCandidateHit) {
    setPicked(c);
    setProcessId(c.processes[0]?.id ?? "");
    setError(null);
  }

  const job = picked?.processes.find((p) => p.id === processId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="gen-title" className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="gen-title" className="text-[18px] font-bold">Gerar teste comportamental</h2>
            <p className="mt-0.5 text-[13.5px] text-muted">Mesmo questionário para todos: 25 perguntas, cerca de 10 minutos.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-md p-1 text-muted hover:bg-surface"><X size={18} /></button>
        </div>

        <div className="mt-4 min-h-0 overflow-y-auto">
          {link && picked ? (
            <div className="flex flex-col gap-3">
              <Alert tone="success" title="Teste gerado">Envie o link para {picked.fullName}. O teste já está no histórico do candidato.</Alert>
              <TestLinkBox url={`${origin}${link.path}`} firstName={picked.fullName.split(" ")[0]} jobTitle={job?.label.split(" · ")[0] ?? null} phone={picked.phone} expiresAt={link.expiresAt} company={company} />
            </div>
          ) : picked ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{picked.fullName}</p>
                  {picked.lastTest && <p className="text-[12.5px] text-muted">{picked.lastTest.status === "COMPLETED" ? "Já respondeu um teste" : "Tem um teste aguardando resposta"} (enviado em {new Date(picked.lastTest.sentAt).toLocaleDateString("pt-BR")})</p>}
                </div>
                {!preset && <button type="button" onClick={() => { setPicked(null); setHits([]); }} className="shrink-0 text-[13px] font-medium text-muted hover:text-ink">Trocar</button>}
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-[13px] font-medium">Vaga pretendida</legend>
                {picked.processes.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-[14px] has-[:checked]:border-ink has-[:checked]:bg-brand-soft">
                    <input type="radio" name="process" value={p.id} checked={processId === p.id} onChange={() => setProcessId(p.id)} className="accent-[#111216]" />
                    <span className="min-w-0 flex-1">{p.label}<span className="block text-[12px] text-muted">Etapa: {p.stage}</span></span>
                  </label>
                ))}
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-[14px] has-[:checked]:border-ink has-[:checked]:bg-brand-soft">
                  <input type="radio" name="process" value="" checked={processId === ""} onChange={() => setProcessId("")} className="accent-[#111216]" />
                  <span>Sem vaga específica</span>
                </label>
              </fieldset>
              {picked.lastTest?.status === "SENT" && <p className="text-[12.5px] text-muted">Gerar um novo teste para a mesma vaga substitui o link pendente. Testes respondidos continuam no histórico.</p>}
              {error && <Alert>{error}</Alert>}
              <Button type="button" disabled={pending} onClick={() => start(async () => {
                setError(null);
                const r = await createTestAction(picked.id, processId || null);
                if (!r.ok) setError(r.message);
                else if (r.data) setLink({ path: r.data.path, expiresAt: r.data.expiresAt });
              })}>{pending ? "Gerando…" : "Gerar link do teste"}</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <MagnifyingGlass size={17} className="pointer-events-none absolute top-3 left-3 text-muted" />
                <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, CPF ou telefone do candidato" aria-label="Buscar candidato" className="pl-9" />
              </div>
              {q.trim().length >= 2 && !searching && hits.length === 0 && <p className="py-4 text-center text-[13.5px] text-muted">Nenhum candidato encontrado.</p>}
              <ul className="flex flex-col gap-1.5">
                {hits.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => pick(c)} className={cn("flex w-full flex-col items-start rounded-lg border border-line px-3 py-2.5 text-left hover:border-ink")}>
                      <span className="font-semibold">{c.fullName}</span>
                      <span className="text-[12.5px] text-muted">{c.processes.length ? c.processes.map((p) => p.label).join(" · ") : "Sem vaga em andamento"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
