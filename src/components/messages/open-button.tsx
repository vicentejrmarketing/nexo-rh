"use client";

import { useState, useTransition } from "react";
import { ChatCircleText } from "@phosphor-icons/react";
import { Alert, Button } from "@/components/ui";
import { errorText } from "@/lib/form";
import { openConversationAction } from "@/app/(app)/mensagens/actions";

/** Abre a conversa do candidato na central (cria se for a primeira vez). */
export function OpenConversationButton({ candidateId, label = "Mensagem", extra = "", variant = "secondary", size = "md" }: { candidateId: string; label?: string; extra?: string; variant?: "primary" | "secondary"; size?: "sm" | "md" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant={variant} size={size} disabled={pending} onClick={() => start(async () => { const r = await openConversationAction(candidateId, extra); if (r && !r.ok) setError(errorText(r)); })}>
        <ChatCircleText size={17} weight="fill" /> {pending ? "Abrindo…" : label}
      </Button>
      {error && <Alert>{error}</Alert>}
    </span>
  );
}
