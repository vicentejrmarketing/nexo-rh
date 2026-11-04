"use client";

import { useState, useTransition } from "react";
import { Alert, Button, cn } from "@/components/ui";
import type { ActionResult } from "@/server/errors";

/**
 * Botão de ação com confirmação em dois passos (excluir, anonimizar, encerrar...).
 * A ação roda no servidor, que confere a permissão de novo.
 */
export function ConfirmAction({
  label, confirmLabel, question, action, variant = "danger", size = "md", icon, onDone,
}: {
  label: string;
  confirmLabel?: string;
  question: string;
  action: () => Promise<ActionResult | void>;
  variant?: "danger" | "secondary" | "primary" | "dark";
  size?: "sm" | "md";
  icon?: React.ReactNode;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <Button type="button" variant={variant} size={size} onClick={() => { setError(null); setOpen(true); }}>
        {icon}
        {label}
      </Button>
    );
  }
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border p-3", variant === "danger" ? "border-danger/30 bg-danger-soft/40" : "border-line bg-surface")}>
      <p className="text-[13.5px] text-ink">{question}</p>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={variant === "danger" ? "danger" : "primary"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await action();
              if (res && !res.ok) setError(res.message);
              else {
                setOpen(false);
                onDone?.();
              }
            })
          }
        >
          {pending ? "Aguarde…" : confirmLabel ?? "Confirmar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </div>
  );
}
