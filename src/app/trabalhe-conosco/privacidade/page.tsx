import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { PrivacyRequestForm } from "@/components/portal/privacy-form";
import { getPublicSite, issueFormToken } from "@/server/modules/portal/service";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-[28px] font-extrabold tracking-tight sm:text-[34px]">Política de privacidade</h1>
      <Suspense fallback={<Skeleton className="mt-6 h-96" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  await connection();
  const site = await getPublicSite();
  return (
    <>
      <p className="mt-1 text-[14px] text-muted">{site.privacyVersion ? `Versão de ${site.privacyVersion}` : "Versão em elaboração"}</p>
      <article className="mt-6 rounded-[var(--radius-card)] border border-black/[0.06] bg-white p-6 text-[15px] leading-relaxed whitespace-pre-line shadow-[0_2px_14px_rgba(17,18,22,0.05)] sm:p-8">
        {site.privacyPolicy || `Usamos os dados enviados nas candidaturas somente para recrutamento e seleção. Os dados ficam guardados por até ${site.retentionMonths} meses após o último contato e depois são anonimizados. Você pode pedir a exclusão a qualquer momento pelo formulário abaixo.`}
      </article>
      <section id="pedido" className="mt-8 scroll-mt-24 rounded-[var(--radius-card)] border border-black/[0.06] bg-white p-6 shadow-[0_2px_14px_rgba(17,18,22,0.05)] sm:p-8">
        <h2 className="text-[20px] font-bold">Pedir exclusão dos meus dados</h2>
        <p className="mt-1 mb-5 text-[14px] text-muted">Informe os mesmos dados usados na inscrição para localizarmos seu cadastro. A equipe confere e remove nome, contatos e currículo.</p>
        <PrivacyRequestForm token={issueFormToken()} />
      </section>
    </>
  );
}
