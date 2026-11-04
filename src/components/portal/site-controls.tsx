"use client";

import { useState, useTransition } from "react";
import { ArrowSquareOut, Check, Copy, Eye, EyeSlash } from "@phosphor-icons/react";
import { Button, buttonClass, cn } from "@/components/ui";
import { errorText } from "@/lib/form";
import { setPublishedAction } from "@/app/(app)/site-de-vagas/actions";

/** Copia o link público da vaga (endereço completo do site atual). */
export function CopyJobLink({ slug, size = "sm", label = "Copiar link" }: { slug: string; size?: "sm" | "md"; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size={size}
      variant="secondary"
      onClick={async () => {
        const url = `${window.location.origin}/trabalhe-conosco/vagas/${slug}`;
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          window.prompt("Copie o link da vaga:", url);
        }
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? <Check size={15} weight="bold" /> : <Copy size={15} />} {done ? "Copiado" : label}
    </Button>
  );
}

export function ViewOnSite({ slug, size = "sm" }: { slug: string; size?: "sm" | "md" }) {
  return (
    <a href={`/trabalhe-conosco/vagas/${slug}`} target="_blank" rel="noopener" className={buttonClass("secondary", size)}>
      <ArrowSquareOut size={15} /> Ver no site
    </a>
  );
}

export function PublishToggle({ jobId, published, disabled }: { jobId: string; published: boolean; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={published}
        disabled={pending || disabled}
        onClick={() => start(async () => {
          setError(null);
          const r = await setPublishedAction(jobId, !published);
          if (!r.ok) setError(errorText(r));
        })}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition-colors disabled:opacity-50",
          published ? "bg-ink text-brand hover:bg-ink-2" : "border border-line bg-white text-muted hover:border-ink hover:text-ink",
        )}
      >
        {published ? <Eye size={15} weight="bold" /> : <EyeSlash size={15} weight="bold" />}
        {pending ? "Salvando…" : published ? "No site" : "Fora do site"}
      </button>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </span>
  );
}
