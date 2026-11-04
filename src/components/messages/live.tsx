"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { inboxTickAction } from "@/app/(app)/mensagens/actions";

/** Mantém a central atualizada: a cada poucos segundos (com a aba visível) busca mensagens novas. */
export function InboxLive({ conversationId, every = 8000 }: { conversationId: string | null; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      await inboxTickAction(conversationId).catch(() => {});
      if (alive) router.refresh();
    };
    void inboxTickAction(conversationId).then(() => alive && router.refresh()).catch(() => {});
    const t = setInterval(tick, every);
    return () => { alive = false; clearInterval(t); };
  }, [conversationId, every, router]);
  return null;
}
