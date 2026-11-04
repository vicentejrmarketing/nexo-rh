import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowLeft, LockKey } from "@phosphor-icons/react/ssr";
import { Skeleton } from "@/components/ui";
import { ApplyForm } from "@/components/portal/apply-form";
import { PUBLIC_UFS, getPublicJob, issueFormToken } from "@/server/modules/portal/service";

export const metadata: Metadata = { title: "Candidatar-se", robots: { index: false, follow: false } };

export default function ApplyPage({ params }: PageProps<"/trabalhe-conosco/vagas/[slug]/candidatar">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-10"><Skeleton className="h-[600px]" /></div>}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/trabalhe-conosco/vagas/[slug]/candidatar">["params"] }) {
  await connection();
  const { slug } = await params;
  const data = await getPublicJob(slug);
  if (!data) notFound();
  const { job, accepting } = data;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href={`/trabalhe-conosco/vagas/${job.slug}`} className="mb-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-muted hover:text-ink"><ArrowLeft size={16} /> Voltar para a vaga</Link>
      <div className="rounded-[var(--radius-card)] border border-black/[0.06] bg-white p-6 shadow-[0_2px_14px_rgba(17,18,22,0.05)] sm:p-8">
        <p className="text-[13px] font-semibold tracking-wider text-muted uppercase">Candidatura</p>
        <h1 className="mt-1 text-[26px] leading-tight font-extrabold tracking-tight">{job.title}</h1>
        <p className="mt-1 text-[14.5px] text-muted">{job.store.name} · {job.city}/{job.state} · {job.contractLabel}</p>
        <div className="mt-6">
          {accepting ? (
            <ApplyForm slug={job.slug} token={issueFormToken()} ufs={PUBLIC_UFS} />
          ) : (
            <p className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[14px] text-warning">
              As inscrições para esta vaga estão encerradas. <Link href="/trabalhe-conosco/vagas" className="font-semibold underline">Ver outras vagas</Link>
            </p>
          )}
        </div>
      </div>
      <p className="mt-4 flex items-center justify-center gap-2 text-[12.5px] text-muted"><LockKey size={14} /> Seus dados e seu currículo ficam em ambiente protegido e só a equipe de recrutamento tem acesso.</p>
    </div>
  );
}
