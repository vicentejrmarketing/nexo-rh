"use client";

import { useState } from "react";
import { FilePdf, UploadSimple } from "@phosphor-icons/react";
import { cn } from "@/components/ui";

/** Campo de arquivo com textos em português (o padrão do navegador segue o idioma do sistema). */
export function FileInput({ id, name, accept, disabled, label = "Escolher PDF", className }: { id: string; name: string; accept?: string; disabled?: boolean; label?: string; className?: string }) {
  const [file, setFile] = useState<string | null>(null);
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-white px-3 py-2 text-[14px] transition-colors hover:border-ink/40 focus-within:ring-2 focus-within:ring-brand",
        disabled && "cursor-not-allowed opacity-60 hover:border-line",
        className,
      )}
    >
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-ink px-3 py-1 text-[13px] font-semibold text-white">
        <UploadSimple size={14} weight="bold" /> {label}
      </span>
      <span className={cn("min-w-0 truncate", file ? "text-ink" : "text-muted")}>
        {file ? <><FilePdf size={15} weight="fill" className="mr-1 inline text-danger" />{file}</> : "Nenhum arquivo selecionado"}
      </span>
      <input id={id} name={name} type="file" accept={accept} disabled={disabled} className="sr-only" onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)} />
    </label>
  );
}
