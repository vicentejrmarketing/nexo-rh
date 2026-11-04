import { cn } from "@/components/ui";

/** Marca NEXO RH: símbolo amarelo + "NEXO" branco (ou preto) + "RH" amarelo. */
export function Logo({ onDark = true, className }: { onDark?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} aria-label="NEXO RH">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#F5B900" />
        <path d="M9 23V9h2.6l7.6 9.7V9H22v14h-2.6l-7.6-9.7V23H9Z" fill="#111216" />
      </svg>
      <span className="text-[17px] font-bold tracking-[0.08em]">
        <span className={onDark ? "text-white" : "text-ink"}>NEXO</span>
        <span className="ml-1 text-brand">RH</span>
      </span>
    </span>
  );
}
