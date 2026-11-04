import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Briefcase, CalendarBlank, CurrencyCircleDollar, MapPin, Storefront, UsersThree, Warning } from "@phosphor-icons/react/ssr";
import { Skeleton } from "@/components/ui";
import { getPublicJob } from "@/server/modules/portal/service";
import { formatDate } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/trabalhe-conosco/vagas/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicJob(slug);
  if (!data) return { title: "Vaga não encontrada", robots: { index: false } };
  const j = data.job;
  return {
    title: `${j.title} – ${j.store.name}`,
    description: `${j.title} em ${j.city}/${j.state}. ${j.contractLabel}.${j.salaryLabel ? ` ${j.salaryLabel}.` : ""} Candidate-se online.`,
    robots: data.accepting ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default function PublicJobPage({ params }: PageProps<"/trabalhe-conosco/vagas/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-4xl px-4 py-10"><Skeleton className="h-[480px]" /></div>}>
      <Content params={params} />
    </Suspense>
  );
}

function Section({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <section>
      <h2 className="mb-2 text-[18px] font-bold">{title}</h2>
      <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink/85">{text}</p>
    </section>
  );
}

async function Content({ params }: { params: PageProps<"/trabalhe-conosco/vagas/[slug]">["params"] }) {
  const { slug } = await params;
  const data = await getPublicJob(slug);
  if (!data) notFound();
  const { job: j, accepting } = data;
  const applyHref = `/trabalhe-conosco/vagas/${j.slug}/candidatar`;
  // Dados estruturados para o Google for Jobs (só vagas abertas).
  const jsonLd = accepting
    ? {
        "@context": "https://schema.org", "@type": "JobPosting", title: j.title, description: [j.description, j.responsibilities, j.requirements].filter(Boolean).join("\n\n"),
        datePosted: j.publishedOn.toISOString(), employmentType: { CLT: "FULL_TIME", PART_TIME: "PART_TIME", TEMPORARY: "TEMPORARY", INTERNSHIP: "INTERN", APPRENTICE: "INTERN", PJ: "CONTRACTOR" }[j.contractType],
        hiringOrganization: { "@type": "Organization", name: j.store.name },
        jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: j.city, addressRegion: j.state, addressCountry: "BR" } },
        ...(j.salaryMin || j.salaryMax ? { baseSalary: { "@type": "MonetaryAmount", currency: "BRL", value: { "@type": "QuantitativeValue", minValue: j.salaryMin ?? undefined, maxValue: j.salaryMax ?? undefined, unitText: "MONTH" } } } : {}),
      }
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-28 sm:px-6 sm:pt-10 lg:pb-10">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      <Link href="/trabalhe-conosco/vagas" className="mb-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-muted hover:text-ink"><ArrowLeft size={16} /> Todas as vagas</Link>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <article className="rounded-[var(--radius-card)] border border-black/[0.06] bg-white p-6 shadow-[0_2px_14px_rgba(17,18,22,0.05)] sm:p-8">
          <span className="rounded-full bg-brand-soft px-3 py-1 text-[12.5px] font-semibold">{j.contractLabel}</span>
          <h1 className="mt-3 text-[28px] leading-tight font-extrabold tracking-tight sm:text-[34px]">{j.title}</h1>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-muted">
            <li className="flex items-center gap-1.5"><Storefront size={17} className="text-ink" /> {j.store.name}</li>
            <li className="flex items-center gap-1.5"><MapPin size={17} className="text-ink" /> {j.city}/{j.state}</li>
            <li className="flex items-center gap-1.5"><CalendarBlank size={17} className="text-ink" /> Publicada em {formatDate(j.publishedOn)}</li>
          </ul>
          {!accepting && (
            <p className="mt-5 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[14px] font-medium text-warning">
              <Warning size={18} weight="fill" /> As inscrições para esta vaga estão encerradas.
            </p>
          )}
          <div className="mt-7 flex flex-col gap-7">
            <Section title="Sobre a vaga" text={j.description} />
            <Section title="Responsabilidades" text={j.responsibilities} />
            <Section title="Requisitos" text={j.requirements} />
            <Section title="Benefícios" text={j.benefits} />
          </div>
        </article>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <div className="rounded-[var(--radius-card)] bg-ink p-6 text-white">
            <ul className="flex flex-col gap-3 text-[14px]">
              <li className="flex items-start gap-2.5"><CurrencyCircleDollar size={20} className="shrink-0 text-brand" /><span><span className="block text-white/60">Salário</span>{j.salaryLabel ?? "A combinar"}</span></li>
              <li className="flex items-start gap-2.5"><Briefcase size={20} className="shrink-0 text-brand" /><span><span className="block text-white/60">Contratação</span>{j.contractLabel}</span></li>
              {j.position && <li className="flex items-start gap-2.5"><UsersThree size={20} className="shrink-0 text-brand" /><span><span className="block text-white/60">Cargo</span>{j.position.name}{j.position.area ? ` · ${j.position.area}` : ""}</span></li>}
              <li className="flex items-start gap-2.5"><UsersThree size={20} className="shrink-0 text-brand" /><span><span className="block text-white/60">Vagas</span>{j.openings}</span></li>
            </ul>
            {accepting ? (
              <Link href={applyHref} className="mt-6 flex h-13 items-center justify-center rounded-xl bg-brand text-[16px] font-extrabold tracking-wide text-ink uppercase hover:bg-brand-strong">
                Quero me candidatar
              </Link>
            ) : (
              <Link href="/trabalhe-conosco/vagas" className="mt-6 flex h-12 items-center justify-center rounded-xl bg-white/10 text-[15px] font-semibold hover:bg-white/20">Ver outras vagas</Link>
            )}
          </div>
        </aside>
      </div>

      {accepting && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 p-3 backdrop-blur lg:hidden">
          <Link href={applyHref} className="flex h-12 items-center justify-center rounded-xl bg-brand text-[15px] font-extrabold text-ink uppercase">Quero me candidatar</Link>
        </div>
      )}
    </div>
  );
}
