"use client";

import { useRef, type ReactNode } from "react";

/** Formulário GET que pesquisa ao trocar um filtro (o botão continua funcionando sem JavaScript). */
export function AutoSubmitForm({ action, children, className }: { action: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={action}
      role="search"
      className={className}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === "radio")) ref.current?.requestSubmit();
      }}
      onSubmit={() => {
        // Não envia campos vazios: a URL fica limpa e compartilhável.
        for (const el of Array.from(ref.current?.elements ?? [])) {
          if ((el instanceof HTMLInputElement || el instanceof HTMLSelectElement) && !el.value) el.disabled = true;
        }
        setTimeout(() => Array.from(ref.current?.elements ?? []).forEach((el) => ((el as HTMLInputElement).disabled = false)), 0);
      }}
    >
      {children}
    </form>
  );
}
