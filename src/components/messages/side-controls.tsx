"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Alert, Button, Input, Select } from "@/components/ui";
import { errorText } from "@/lib/form";
import type { ConversationStatus } from "@/generated/prisma/browser";
import { assignAction, findCandidatesAction, linkCandidateAction, reactivateAction, statusAction } from "@/app/(app)/mensagens/actions";

function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean }>) => start(async () => { const r = await fn(); setError(r.ok ? null : errorText(r as never)); });
  return { pending, error, run };
}

export function AssignSelect({ id, value, users, selfId, selfOnly }: { id: string; value: string | null; users: { id: string; name: string }[]; selfId: string; selfOnly: boolean }) {
  const { pending, error, run } = useRun();
  if (selfOnly) {
    return value === selfId ? <p className="text-[13px]">Você</p> : (
      <div className="flex flex-col gap-1">
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => assignAction(id, selfId))}>Assumir conversa</Button>
        {error && <Alert>{error}</Alert>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Select aria-label="Responsável" defaultValue={value ?? ""} disabled={pending} onChange={(e) => run(() => assignAction(id, e.target.value || null))}>
        <option value="">Sem responsável</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </Select>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

export function StatusSelect({ id, value, labels }: { id: string; value: ConversationStatus; labels: Record<string, string> }) {
  const { pending, error, run } = useRun();
  return (
    <div className="flex flex-col gap-1">
      <Select aria-label="Situação da conversa" defaultValue={value} disabled={pending} onChange={(e) => run(() => statusAction(id, e.target.value as ConversationStatus))}>
        {Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

export function LinkCandidate({ id }: { id: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; detail: string }[]>([]);
  const seq = useRef(0);
  const { pending, error, run } = useRun();
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(async () => { const r = q.trim().length >= 2 ? await findCandidatesAction(q) : []; if (n === seq.current) setHits(r); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <MagnifyingGlass size={16} className="pointer-events-none absolute top-3 left-3 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar candidato pelo nome" className="pl-9" aria-label="Buscar candidato" />
      </div>
      {hits.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {hits.map((h) => (
            <li key={h.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{h.name}</span><span className="block truncate text-[12px] text-muted">{h.detail}</span></span>
              <Button type="button" size="sm" disabled={pending} onClick={() => run(() => linkCandidateAction(id, h.id))}>Vincular</Button>
            </li>
          ))}
        </ul>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

export function ReactivateButton({ candidateId }: { candidateId: string }) {
  const { pending, error, run } = useRun();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) return <Button type="button" size="sm" variant="secondary" onClick={() => setConfirm(true)}>Candidato voltou a autorizar</Button>;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-2.5">
      <p className="text-[12.5px]">Confirme só se o próprio candidato pediu para voltar a receber mensagens. Fica registrado.</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => run(() => reactivateAction(candidateId))}>Confirmar</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(false)}>Cancelar</Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
