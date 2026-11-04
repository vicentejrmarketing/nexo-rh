"use client";

import { useActionState, useState, useTransition } from "react";
import { PencilSimple, Plus } from "@phosphor-icons/react";
import { Alert, Badge, Button, Card, Input, cn } from "@/components/ui";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { pick, type FormState } from "@/lib/form";
import { deletePositionAction, savePositionAction, togglePositionAction } from "./actions";

type Position = { id: string; name: string; description: string | null; active: boolean; uses: number };

function PositionForm({ position, onDone }: { position?: Position; onDone?: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await savePositionAction(position?.id ?? null, prev, fd);
    if (res.ok) onDone?.();
    return res;
  }, { ok: true } as FormState);
  const e = !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={action} className="flex flex-wrap items-start gap-2" noValidate>
      <div key={state.submission ?? 0} className="flex min-w-[220px] flex-1 flex-col gap-1">
        <Input name="name" aria-label="Nome do cargo" placeholder="Ex.: Vendedor(a) de Loja" defaultValue={state.ok && !position ? "" : pick(state, "name", position?.name)} invalid={!!e.name} maxLength={80} required />
        {e.name && <span className="text-[12.5px] text-danger">{e.name.join(" ")}</span>}
        {!state.ok && !state.fieldErrors && <Alert>{state.message}</Alert>}
      </div>
      <Button type="submit" disabled={pending}>
        {position ? "Salvar" : <><Plus size={16} weight="bold" /> Adicionar cargo</>}
      </Button>
      {position && <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>}
    </form>
  );
}

function Row({ p }: { p: Position }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (editing) return <li className="px-5 py-3"><PositionForm position={p} onDone={() => setEditing(false)} /></li>;
  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-5 py-3", !p.active && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{p.name} {!p.active && <Badge>Inativo</Badge>}</p>
        <p className="text-[12.5px] text-muted">{p.uses ? `Usado em ${p.uses} vaga(s) ou candidato(s)` : "Ainda não usado"}</p>
        {error && <p className="text-[12.5px] text-danger">{error}</p>}
      </div>
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><PencilSimple size={15} /> Renomear</Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => start(async () => { const r = await togglePositionAction(p.id, !p.active); setError(r.ok ? null : r.message); })}
      >
        {p.active ? "Desativar" : "Reativar"}
      </Button>
      {p.uses === 0 && <ConfirmAction size="sm" label="Excluir" question={`Excluir o cargo "${p.name}"?`} confirmLabel="Excluir" action={() => deletePositionAction(p.id)} />}
    </li>
  );
}

export function PositionsManager({ positions }: { positions: Position[] }) {
  return (
    <Card>
      <div className="border-b border-line p-5">
        <PositionForm />
      </div>
      {positions.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-muted">Nenhum cargo cadastrado. Os cargos aparecem nas vagas e no cadastro de candidatos.</p>
      ) : (
        <ul className="divide-y divide-line">{positions.map((p) => <Row key={p.id} p={p} />)}</ul>
      )}
    </Card>
  );
}
