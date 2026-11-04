"use client";

import { useEffect, useState, useTransition } from "react";
import { Trash } from "@phosphor-icons/react";
import { Alert, Button } from "@/components/ui";
import { errorText } from "@/lib/form";
import { deleteCandidatesAction } from "@/app/(app)/candidatos/actions";

/** Marca/desmarca todos os candidatos da página. */
export function SelectAll({ formId }: { formId: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Selecionar todos desta página"
      className="h-4 w-4 accent-[#F5B900]"
      onChange={(e) => {
        const boxes = document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="ids"]`);
        boxes.forEach((c) => (c.checked = e.target.checked));
        boxes[0]?.dispatchEvent(new Event("change", { bubbles: true }));
      }}
    />
  );
}

/** Barra de exclusão em lote: lê os candidatos marcados e pede confirmação. */
export function BulkDeleteBar({ formId }: { formId: string }) {
  const [count, setCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const selected = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="ids"]:checked`)).map((c) => c.value);
  // As caixas ficam na tabela (fora deste formulário); escuta as mudanças no documento.
  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement && t.getAttribute("form") === formId) {
        setCount(selected().length);
        setConfirming(false);
        setMsg(null);
      }
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]);
  return (
    <>
      <form id={formId} onSubmit={(e) => e.preventDefault()} hidden />
      {(count > 0 || msg) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-danger-soft/40 px-4 py-3 text-[13.5px]">
          {count > 0 && <span><strong>{count}</strong> candidato(s) selecionado(s)</span>}
          {count > 0 && !confirming && <Button type="button" size="sm" variant="danger" onClick={() => setConfirming(true)}><Trash size={15} /> Excluir selecionados</Button>}
          {confirming && (
            <>
              <span className="text-danger">Excluir de vez {count} candidato(s), com candidaturas, entrevistas, mensagens e currículos? Não dá para desfazer.</span>
              <Button type="button" size="sm" variant="danger" disabled={pending} onClick={() => start(async () => {
                const r = await deleteCandidatesAction(selected());
                setConfirming(false);
                if (r.ok) { setCount(0); setMsg({ ok: true, text: `${r.data} candidato(s) excluído(s).` }); }
                else setMsg({ ok: false, text: errorText(r) });
              })}>{pending ? "Excluindo…" : "Confirmar exclusão"}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancelar</Button>
            </>
          )}
          {msg && <div className="w-full"><Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert></div>}
        </div>
      )}
    </>
  );
}
