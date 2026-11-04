import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle } from "@phosphor-icons/react/ssr";
import { getPublicJob } from "@/server/modules/portal/service";

export const metadata: Metadata = { title: "Inscrição enviada", robots: { index: false, follow: false } };

export default function SentPage({ searchParams }: PageProps<"/trabalhe-conosco/inscricao-enviada">) {
  return (
    <div className="mx-auto max-w-xl px-4 py-14 text-center sm:py-20">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success"><CheckCircle size={40} weight="fill" /></span>
      <h1 className="mt-5 text-[28px] font-extrabold tracking-tight">Inscrição enviada!</h1>
      <Suspense fallback={<p className="mt-2 h-6" />}>
        <JobLine searchParams={searchParams} />
      </Suspense>
      <p className="mt-4 text-[15px] text-muted">Nossa equipe vai analisar seu currículo. Se o seu perfil combinar com a vaga, entraremos em contato pelo telefone ou WhatsApp informado.</p>
      <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
        <Link href="/trabalhe-conosco/vagas" className="flex h-12 items-center justify-center rounded-xl bg-ink px-6 text-[15px] font-semibold text-white hover:bg-ink-2">Ver outras vagas</Link>
        <Link href="/trabalhe-conosco" className="flex h-12 items-center justify-center rounded-xl border border-line bg-white px-6 text-[15px] font-semibold hover:border-ink">Página inicial</Link>
      </div>
    </div>
  );
}

async function JobLine({ searchParams }: { searchParams: PageProps<"/trabalhe-conosco/inscricao-enviada">["searchParams"] }) {
  const { vaga } = await searchParams;
  const data = typeof vaga === "string" ? await getPublicJob(vaga) : null;
  return data ? <p className="mt-2 text-[16px]">Vaga: <strong>{data.job.title}</strong> · {data.job.store.name}</p> : null;
}
