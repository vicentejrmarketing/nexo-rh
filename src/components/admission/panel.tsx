"use client";

import { useState, useTransition } from "react";
import { ArrowSquareOut, Check, CopySimple, LinkSimple, WhatsappLogo, X } from "@phosphor-icons/react";
import { Alert, Badge, Button, Textarea, cn } from "@/components/ui";
import type { ActionResult } from "@/server/errors";
import { finishReviewAction, generateLinkAction, reopenAction, reviewFileAction } from "@/app/(app)/contratados/actions";

function errorText(r: Extract<ActionResult, { ok: false }>) {
  const fields = r.fieldErrors ? Object.values(r.fieldErrors).flat() : [];
  return fields.length ? fields.join(" ") : r.message;
}

const waUrl = (phoneDigits: string, text: string) => `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;

type LinkProps = {
  processId: string;
  origin: string;
  path: string | null;
  expiresAt: string | null;
  status: string | null;
  canManage: boolean;
  phoneDigits: string | null;
  firstName: string;
  jobTitle: string;
  storeName: string;
  companyName: string;
};

/** Gera, copia e envia pelo WhatsApp (1 clique, sem custo) o link de documentos. */
export function AdmissionLink(p: LinkProps) {
  const [path, setPath] = useState(p.path);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const url = path ? `${p.origin}${path}` : null;
  const expired = p.expiresAt ? new Date(p.expiresAt) < new Date() : false;
  const completed = p.status === "COMPLETED";
  const until = p.expiresAt ? new Date(p.expiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;
  const message = url
    ? p.status === "CHANGES_REQUESTED"
      ? `Olá, ${p.firstName}! Conferimos seus documentos de admissão e precisamos de alguns ajustes. Acesse o mesmo link, veja o que falta e envie de novo: ${url}`
      : `Olá, ${p.firstName}! Parabéns pela contratação na vaga de ${p.jobTitle} (${p.storeName}). Para finalizar sua admissão, envie seus documentos por este link${until ? ` (válido até ${until})` : ""}: ${url}\n\n${p.companyName}`
    : "";

  function generate() {
    setError(null);
    start(async () => {
      const r = await generateLinkAction(p.processId);
      if (!r.ok) setError(errorText(r));
      else if (r.data) setPath(r.data.path);
    });
  }
  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }

  if (completed) return <Alert tone="success" title="Admissão concluída">Todos os documentos foram conferidos e aprovados. O link foi desativado.</Alert>;

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert>{error}</Alert>}
      {url ? (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-2.5">
            <LinkSimple size={18} className="shrink-0 text-muted" />
            <input readOnly value={url} aria-label="Link de documentos" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] outline-none" />
            {expired ? <Badge tone="danger">Vencido</Badge> : until && <Badge>Válido até {until}</Badge>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={copy}>{copied ? <Check size={16} /> : <CopySimple size={16} />} {copied ? "Copiado" : "Copiar link"}</Button>
            {p.phoneDigits ? (
              <a href={waUrl(p.phoneDigits, message)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#25D366] px-3 text-[13.5px] font-semibold text-white hover:brightness-95">
                <WhatsappLogo size={17} weight="fill" /> Enviar pelo WhatsApp
              </a>
            ) : (
              <span className="self-center text-[12.5px] text-muted">Sem telefone no cadastro para enviar pelo WhatsApp.</span>
            )}
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 px-2 text-[13px] text-muted hover:text-ink"><ArrowSquareOut size={15} /> Abrir página</a>
            {p.canManage && <Button type="button" variant="ghost" size="sm" onClick={generate} disabled={pending}>{pending ? "Gerando…" : "Gerar novo link"}</Button>}
          </div>
          <p className="text-[12.5px] text-muted">Gerar um novo link desativa o anterior. Para abrir, o contratado confirma o próprio CPF.</p>
        </>
      ) : p.canManage ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-lg text-[13.5px] text-muted">Gere o link e envie ao contratado. Ele preenche e anexa os documentos pelo celular; você confere aqui.</p>
          <Button type="button" onClick={generate} disabled={pending}><LinkSimple size={17} weight="bold" /> {pending ? "Gerando…" : "Gerar link de documentos"}</Button>
        </div>
      ) : (
        <p className="text-[13.5px] text-muted">O link de documentos ainda não foi gerado.</p>
      )}
    </div>
  );
}

type FileRow = { id: string; status: "PENDING" | "APPROVED" | "REJECTED"; rejectionReason: string | null; fileName: string; mimeType: string; reviewedBy: string | null };

/** Aprovar ou devolver um documento (com motivo). */
export function FileReview({ file, canReview }: { file: FileRow; canReview: boolean }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (decision: "APPROVED" | "REJECTED") =>
    start(async () => {
      setError(null);
      const r = await reviewFileAction(file.id, decision, decision === "REJECTED" ? reason : null);
      if (!r.ok) setError(errorText(r));
      else setRejecting(false);
    });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/api/admissao/arquivo/${file.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium underline-offset-4 hover:underline">
          <ArrowSquareOut size={15} /> {file.mimeType === "application/pdf" ? "Abrir PDF" : "Ver imagem"}
        </a>
        <span className="truncate text-[12px] text-muted">{file.fileName}</span>
        {file.status === "APPROVED" && <Badge tone="success"><Check size={12} weight="bold" /> Aprovado</Badge>}
        {file.status === "REJECTED" && <Badge tone="danger">Devolvido</Badge>}
        {file.status === "PENDING" && <Badge tone="brand">A conferir</Badge>}
        {canReview && file.status !== "APPROVED" && !rejecting && (
          <span className="ml-auto flex gap-1.5">
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => act("APPROVED")}><Check size={15} /> Aprovar</Button>
            {file.status !== "REJECTED" && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setRejecting(true)}><X size={15} /> Devolver</Button>}
          </span>
        )}
        {canReview && file.status === "APPROVED" && (
          <Button type="button" size="sm" variant="ghost" className="ml-auto" disabled={pending} onClick={() => setRejecting(true)}>Devolver</Button>
        )}
      </div>
      {file.status === "REJECTED" && file.rejectionReason && <p className="text-[12.5px] text-danger">Motivo: {file.rejectionReason}</p>}
      {rejecting && (
        <div className="flex flex-wrap items-start gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="O que precisa corrigir? Ex.: foto escura, falta o verso" aria-label="Motivo da devolução"
            className="h-9 min-w-[220px] flex-1 rounded-lg border border-line bg-white px-3 text-[13.5px] focus:border-ink focus:outline-none" />
          <Button type="button" size="sm" variant="danger" disabled={pending} onClick={() => act("REJECTED")}>Devolver</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancelar</Button>
        </div>
      )}
      {error && <p className="text-[12.5px] text-danger" role="alert">{error}</p>}
    </div>
  );
}

/** Fecha a conferência: conclui ou devolve para correção. */
export function FinishReview({ processId, hasRejected, pendingCount }: { processId: string; hasRejected: boolean; pendingCount: number }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const willReturn = hasRejected || note.trim().length > 0;
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border p-4", willReturn ? "border-danger/30 bg-danger-soft/30" : "border-line bg-surface")}>
      <p className="text-[13.5px] font-semibold">Concluir conferência</p>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className="min-h-16"
        placeholder="Recado para o contratado (opcional). Ex.: o PIS informado não confere, envie o número correto." aria-label="Recado para o contratado" />
      {error && <Alert>{error}</Alert>}
      {done && <Alert tone="success">{done}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant={willReturn ? "danger" : "primary"} disabled={pending || (!willReturn && pendingCount > 0)}
          onClick={() => start(async () => {
            setError(null);
            const r = await finishReviewAction(processId, note || null);
            if (!r.ok) setError(errorText(r));
            else setDone(r.data?.status === "COMPLETED" ? "Admissão concluída." : "Devolvido. Envie o link de novo ao contratado pelo WhatsApp.");
          })}>
          {pending ? "Salvando…" : willReturn ? "Devolver para correção" : "Aprovar e concluir admissão"}
        </Button>
        {!willReturn && pendingCount > 0 && <span className="text-[12.5px] text-muted">Confira os {pendingCount} documento(s) que faltam.</span>}
      </div>
    </div>
  );
}

export function ReopenButton({ processId }: { processId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => {
        const r = await reopenAction(processId);
        if (!r.ok) setError(errorText(r));
      })}>Reabrir conferência</Button>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </span>
  );
}
