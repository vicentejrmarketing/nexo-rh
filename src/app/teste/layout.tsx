import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: { default: "Teste comportamental", template: "%s · Teste comportamental" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function TestLayout({ children }: LayoutProps<"/teste">) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-white/10 bg-ink">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-4 px-4">
          <Logo compact />
          <span className="rounded-full bg-brand px-3 py-1 text-[12px] font-bold text-ink uppercase">Processo seletivo</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">{children}</main>
      <footer className="py-6 text-center text-[12px] text-muted">Suas respostas são confidenciais e usadas só neste processo seletivo.</footer>
    </div>
  );
}
