import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CheckCircle, FileArrowUp, MagnifyingGlass, MapPin, Storefront, UserFocus } from "@phosphor-icons/react/ssr";
import { Skeleton } from "@/components/ui";
import { PublicJobCard } from "@/components/portal/job-card";
import { getPublicSite, publicHomeData } from "@/server/modules/portal/service";

export default function PortalHome() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Home />
    </Suspense>
  );
}

function HomeSkeleton() {
  return (
    <>
      <div className="h-[340px] bg-ink" />
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:grid-cols-3 sm:px-6">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}</div>
    </>
  );
}

async function Home() {
  await connection(); // dados sempre atuais (vagas e textos mudam a qualquer momento)
  const [site, data] = await Promise.all([getPublicSite(), publicHomeData()]);
  return (
    <>
      <section className="relative overflow-hidden bg-ink text-white">
        <div aria-hidden className="absolute -right-24 -bottom-24 h-80 w-80 rotate-12 rounded-[48px] bg-brand/90" />
        <div aria-hidden className="absolute right-40 -bottom-10 h-40 w-40 rotate-12 rounded-[32px] border-4 border-brand/50" />
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[13px] font-medium text-brand">
            <span className="h-2 w-2 rounded-full bg-brand" /> {data.openCount === 1 ? "1 vaga aberta agora" : `${data.openCount} vagas abertas agora`}
          </p>
          <h1 className="max-w-2xl text-[34px] leading-[1.1] font-extrabold tracking-tight sm:text-[48px]">{site.title}</h1>
          <p className="mt-4 max-w-xl text-[16px] text-white/80 sm:text-[17px]">{site.intro}</p>
          <form action="/trabalhe-conosco/vagas" className="mt-8 flex max-w-2xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-xl sm:flex-row" role="search">
            <label className="flex flex-1 items-center gap-2 px-3">
              <MagnifyingGlass size={20} className="shrink-0 text-muted" />
              <input name="q" placeholder="Cargo ou palavra-chave (ex.: vendedor)" aria-label="Cargo ou palavra-chave" className="h-11 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-muted" />
            </label>
            <button className="h-12 rounded-xl bg-brand px-6 text-[15px] font-bold text-ink hover:bg-brand-strong">Buscar vagas</button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[24px] font-bold tracking-tight">Vagas mais recentes</h2>
            <p className="text-[14.5px] text-muted">Oportunidades publicadas pelas nossas lojas.</p>
          </div>
          {data.openCount > 0 && <Link href="/trabalhe-conosco/vagas" className="text-[14px] font-semibold underline decoration-brand decoration-2 underline-offset-4">Ver todas as {data.openCount} vagas</Link>}
        </div>
        {data.recent.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-white px-6 py-12 text-center">
            <p className="text-[17px] font-semibold">Nenhuma vaga aberta no momento</p>
            <p className="mt-1 text-[14px] text-muted">Volte em breve: novas vagas aparecem aqui assim que forem publicadas.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.recent.map((j) => <PublicJobCard key={j.id} job={j} />)}</div>
        )}
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-3 sm:px-6">
          {[
            { icon: UserFocus, title: "Escolha a vaga", text: "Filtre por cargo, cidade, loja ou tipo de contratação." },
            { icon: FileArrowUp, title: "Envie seu currículo", text: "Preencha um formulário rápido e anexe o currículo em PDF." },
            { icon: CheckCircle, title: "Acompanhe o contato", text: "Nossa equipe analisa e fala com você pelo WhatsApp ou telefone." },
          ].map((s, i) => (
            <div key={s.title} className="flex gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink text-brand"><s.icon size={24} weight="fill" /></span>
              <div>
                <p className="text-[12px] font-bold tracking-wider text-muted uppercase">Passo {i + 1}</p>
                <p className="text-[16px] font-bold">{s.title}</p>
                <p className="mt-0.5 text-[14px] text-muted">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {data.stores.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="mb-5 text-[24px] font-bold tracking-tight">Lojas com vagas</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.stores.map((s) => (
              <Link key={s.id} href={`/trabalhe-conosco/vagas?loja=${s.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 hover:border-brand">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand text-ink"><Storefront size={20} weight="fill" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-semibold">{s.name}</span>
                  <span className="flex items-center gap-1 text-[12.5px] text-muted"><MapPin size={13} /> {s.city}/{s.state} · {s._count.jobs} vaga(s)</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
