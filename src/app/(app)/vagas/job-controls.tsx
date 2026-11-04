"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Copy, MagnifyingGlass, Pause, Play, Stop, UserPlus, ArrowCounterClockwise, Check } from "@phosphor-icons/react";
import { Alert, Button, Input, cn } from "@/components/ui";
import type { JobStatus } from "@/generated/prisma/browser";
import { duplicateJobAction, findCandidatesForJobAction, jobStatusAction, linkCandidateAction, type LinkCandidateHit } from "./actions";

const NEXT: Record<JobStatus, { to: JobStatus; label: string; icon: typeof Play; variant: "primary" | "secondary" | "danger" }[]> = {
  DRAFT: [{ to: "OPEN", label: "Publicar", icon: Play, variant: "primary" }],
  OPEN: [
    { to: "PAUSED", label: "Pausar", icon: Pause, variant: "secondary" },
    { to: "CLOSED", label: "Encerrar", icon: Stop, variant: "secondary" },
  ],
  PAUSED: [
    { to: "OPEN", label: "Retomar", icon: Play, variant: "primary" },
    { to: "CLOSED", label: "Encerrar", icon: Stop, variant: "secondary" },
  ],
  CLOSED: [{ to: "OPEN", label: "Reabrir", icon: ArrowCounterClockwise, variant: "secondary" }],
  CANCELED: [{ to: "DRAFT", label: "Voltar para rascunho", icon: ArrowCounterClockwise, variant: "secondary" }],
};

/** Botões de mudança de status (só as transições válidas para o status atual). */
export function JobStatusButtons({ id, status, size = "md" }: { id: string; status: JobStatus; size?: "sm" | "md" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {NEXT[status].map((n) => {
          const Ico = n.icon;
          return (
            <Button
              key={n.to}
              type="button"
              size={size}
              variant={n.variant}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await jobStatusAction(id, n.to);
                  if (!r.ok) setError(r.message);
                })
              }
            >
              <Ico size={16} weight="bold" /> {n.label}
            </Button>
          );
        })}
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

export function DuplicateJobButton({ id, size = "md" }: { id: string; size?: "sm" | "md" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button type="button" variant="secondary" size={size} disabled={pending} onClick={() => start(async () => {
        const r = await duplicateJobAction(id);
        if (r && !r.ok) setError(r.message);
      })}>
        <Copy size={16} /> {pending ? "Duplicando…" : "Duplicar"}
      </Button>
      {error && <Alert>{error}</Alert>}
    </>
  );
}

/** Busca e vincula candidatos já cadastrados a esta vaga. */
export function LinkCandidateBox({ jobId, canCreate }: { jobId: string; canCreate: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<LinkCandidateHit[] | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const seq = useRef(0);
  const router = useRouter();

  useEffect(() => {
    const term = q.trim();
    const n = ++seq.current;
    const t = setTimeout(async () => {
      if (term.length < 2) return void (n === seq.current && setHits(null));
      const r = await findCandidatesForJobAction(jobId, term);
      if (n === seq.current) setHits(r);
    }, 250);
    return () => clearTimeout(t);
  }, [q, jobId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <MagnifyingGlass size={17} className="pointer-events-none absolute top-3 left-3 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar candidato por nome, telefone ou e-mail" aria-label="Buscar candidato para vincular" className="pl-9" />
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {hits && (
        hits.length === 0 ? (
          <p className="text-[13px] text-muted">
            Nenhum candidato encontrado.{" "}
            {canCreate && <Link href={`/candidatos/novo?vaga=${jobId}`} className="font-semibold text-ink underline decoration-brand decoration-2 underline-offset-4">Cadastrar novo candidato</Link>}
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {hits.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-3 py-2">
                <Link href={`/candidatos/${h.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{h.fullName}</p>
                  {h.detail && <p className="truncate text-[12px] text-muted">{h.detail}</p>}
                </Link>
                {h.alreadyLinked ? (
                  <span className="inline-flex items-center gap-1 text-[12px] text-muted"><Check size={14} /> Já vinculado</span>
                ) : (
                  <Button type="button" size="sm" disabled={pending} onClick={() => start(async () => {
                    const r = await linkCandidateAction(jobId, h.id);
                    if (r.ok) {
                      setMsg({ tone: "success", text: `${h.fullName} entrou na etapa Inscrito desta vaga.` });
                      setHits((cur) => cur?.map((x) => (x.id === h.id ? { ...x, alreadyLinked: true } : x)) ?? null);
                      router.refresh();
                    } else setMsg({ tone: "danger", text: r.message });
                  })}>
                    <UserPlus size={15} weight="bold" /> Vincular
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )
      )}
      {canCreate && !hits && (
        <Link href={`/candidatos/novo?vaga=${jobId}`} className={cn("text-[13px] font-semibold text-ink underline decoration-brand decoration-2 underline-offset-4 w-fit")}>
          Ou cadastrar um candidato novo já nesta vaga
        </Link>
      )}
    </div>
  );
}
