"use client";

import { useState } from "react";
import { Check, CopySimple } from "@phosphor-icons/react";

export function CopyLink({ url }: { url: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5">
      <input readOnly value={url} aria-label="Link do teste" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent font-mono text-[12px] outline-none" />
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 2000); } catch { /* copiar manualmente */ } }}
        className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold hover:underline">
        {ok ? <Check size={14} /> : <CopySimple size={14} />} {ok ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
