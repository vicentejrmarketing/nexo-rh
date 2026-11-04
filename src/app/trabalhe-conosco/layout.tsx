import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Envelope, WhatsappLogo } from "@phosphor-icons/react/ssr";
import { Logo } from "@/components/brand/logo";
import { getPublicSite } from "@/server/modules/portal/service";
import { digitsOnly, formatPhoneBR } from "@/lib/phone";

export const metadata: Metadata = {
  title: { default: "Trabalhe conosco", template: "%s · Trabalhe conosco" },
  description: "Vagas abertas nas nossas lojas. Encontre uma oportunidade e candidate-se online.",
  robots: { index: true, follow: true },
};

export default function PortalLayout({ children }: LayoutProps<"/trabalhe-conosco">) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-ink">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/trabalhe-conosco" aria-label="Início do site de vagas" className="shrink-0 whitespace-nowrap"><Logo compact /></Link>
          <nav className="flex items-center gap-1 text-[14px] font-medium sm:gap-2">
            <Link href="/trabalhe-conosco/vagas" className="rounded-full px-3 py-2 text-white hover:bg-white/10">Vagas</Link>
            <Link href="/trabalhe-conosco/privacidade" className="rounded-full px-3 py-2 text-white/80 hover:bg-white/10 max-sm:hidden">Privacidade</Link>
            <Link href="/trabalhe-conosco/vagas" className="rounded-full bg-brand px-4 py-2 font-semibold whitespace-nowrap text-ink hover:bg-brand-strong max-sm:hidden">Ver vagas abertas</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <Suspense fallback={<footer className="h-32 bg-ink" />}>
        <Footer />
      </Suspense>
    </div>
  );
}

async function Footer() {
  await connection(); // dados sempre atuais (vagas e textos mudam a qualquer momento)
  const site = await getPublicSite();
  return (
    <footer className="bg-ink text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
        <div>
          <Logo compact />
          <p className="mt-3 text-[13.5px] text-white/70">{site.companyName}</p>
        </div>
        <div className="text-[14px]">
          <p className="mb-2 font-semibold text-brand">Contato</p>
          {site.contactEmail && <a href={`mailto:${site.contactEmail}`} className="flex items-center gap-2 py-1 text-white/80 hover:text-white"><Envelope size={16} /> {site.contactEmail}</a>}
          {site.contactWhatsapp && (
            <a href={`https://wa.me/${digitsOnly(site.contactWhatsapp)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-1 text-white/80 hover:text-white">
              <WhatsappLogo size={16} /> {formatPhoneBR(site.contactWhatsapp) || site.contactWhatsapp}
            </a>
          )}
          {!site.contactEmail && !site.contactWhatsapp && <p className="text-white/60">Fale com a loja mais próxima.</p>}
        </div>
        <div className="text-[14px]">
          <p className="mb-2 font-semibold text-brand">Seus dados</p>
          <Link href="/trabalhe-conosco/privacidade" className="block py-1 text-white/80 hover:text-white">Política de privacidade</Link>
          <Link href="/trabalhe-conosco/privacidade#pedido" className="block py-1 text-white/80 hover:text-white">Pedir exclusão dos meus dados</Link>
        </div>
      </div>
      <p className="border-t border-white/10 py-4 text-center text-[12px] text-white/50">Recrutamento com NEXO RH</p>
    </footer>
  );
}
