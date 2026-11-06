import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: { default: "Documentos de admissão", template: "%s · Admissão" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function AdmissionLayout({ children }: LayoutProps<"/admissao">) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-white/10 bg-ink">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4">
          <Logo compact />
          <span className="rounded-full bg-brand px-3 py-1 text-[12.5px] font-bold text-ink uppercase">Admissão</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">{children}</main>
      <footer className="py-6 text-center text-[12px] text-muted">Seus dados são usados só para a sua admissão e folha de pagamento.</footer>
    </div>
  );
}
