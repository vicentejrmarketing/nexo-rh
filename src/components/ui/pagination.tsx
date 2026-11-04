import Link from "next/link";
import { buttonClass } from "@/components/ui";

/** Paginação simples por query string (preserva os demais filtros). */
export function Pagination({ page, pageCount, total, params, basePath, noun = "registro(s)" }: { page: number; pageCount: number; total: number; params: Record<string, string | undefined>; basePath: string; noun?: string }) {
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries({ ...params, pagina: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `${basePath}?${q}`;
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-muted">
      <span>{total.toLocaleString("pt-BR")} {noun}{pageCount > 1 ? ` · página ${page} de ${pageCount}` : ""}</span>
      {pageCount > 1 && (
        <span className="flex gap-2">
          {page > 1 && <Link className={buttonClass("secondary", "sm")} href={href(page - 1)}>Anterior</Link>}
          {page < pageCount && <Link className={buttonClass("secondary", "sm")} href={href(page + 1)}>Próxima</Link>}
        </span>
      )}
    </div>
  );
}
