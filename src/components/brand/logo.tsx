import { cn } from "@/components/ui";

/** Marca NEXO RH: "N" amarelo, "NEXO RH" e o complemento "e Recrutamento". */
export function Logo({ onDark = true, compact = false, className }: { onDark?: boolean; compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)} aria-label="NEXO RH e Recrutamento">
      <svg width={compact ? 30 : 46} height={compact ? 30 : 46} viewBox="0 0 48 48" aria-hidden="true">
        <path d="M4 4h12.5L32 27.5V4h12v40H31.5L16 20.5V44H4z" fill="#F5B900" />
        <path d="M16 20.5 31.5 44H44L28.4 20.9z" fill="#C99700" opacity=".55" />
      </svg>
      <span className="flex flex-col leading-none whitespace-nowrap">
        <span className={cn("font-extrabold tracking-[0.02em]", compact ? "text-[17px]" : "text-[23px]", onDark ? "text-white" : "text-ink")}>
          NEXO RH
        </span>
        {!compact && <span className={cn("mt-1 text-[14px] font-medium", onDark ? "text-white/85" : "text-muted")}>e Recrutamento</span>}
      </span>
    </span>
  );
}
