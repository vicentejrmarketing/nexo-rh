import Link from "next/link";
import { cn } from "@/components/ui";

export function MessagesTabs({ active, pending }: { active: "conversas" | "enviar"; pending?: number }) {
  return (
    <nav className="mb-4 flex gap-1 rounded-xl bg-white p-1 shadow-[0_2px_14px_rgba(17,18,22,0.05)] sm:w-fit" aria-label="Seções de mensagens">
      {[
        { key: "enviar", href: "/mensagens/enviar", label: "Para enviar", badge: pending },
        { key: "conversas", href: "/mensagens", label: "Conversas" },
      ].map((t) => (
        <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined} className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-[14px] font-semibold sm:flex-none", active === t.key ? "bg-ink text-white" : "text-muted hover:text-ink")}>
          {t.label}
          {t.badge ? <span className={cn("rounded-full px-1.5 text-[11.5px] font-bold", active === t.key ? "bg-brand text-ink" : "bg-brand text-ink")}>{t.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
