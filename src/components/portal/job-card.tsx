import Link from "next/link";
import { Briefcase, CurrencyCircleDollar, MapPin, Storefront } from "@phosphor-icons/react/ssr";
import type { PublicJobView } from "@/server/modules/portal/service";
import { formatDate } from "@/lib/format";

export function PublicJobCard({ job }: { job: PublicJobView }) {
  return (
    <Link
      href={`/trabalhe-conosco/vagas/${job.slug}`}
      className="group flex h-full flex-col rounded-[var(--radius-card)] border border-black/[0.06] bg-white p-5 shadow-[0_2px_14px_rgba(17,18,22,0.05)] transition hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_8px_24px_rgba(17,18,22,0.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[17px] leading-snug font-bold text-ink group-hover:underline group-hover:decoration-brand group-hover:decoration-2 group-hover:underline-offset-4">{job.title}</h3>
        <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-0.5 text-[12px] font-semibold text-ink">{job.contractLabel}</span>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 text-[13.5px] text-muted">
        <li className="flex items-center gap-2"><Storefront size={16} className="text-ink" /> {job.store.name}</li>
        <li className="flex items-center gap-2"><MapPin size={16} className="text-ink" /> {job.city}/{job.state}</li>
        {job.position && <li className="flex items-center gap-2"><Briefcase size={16} className="text-ink" /> {job.position.name}{job.position.area ? ` · ${job.position.area}` : ""}</li>}
        {job.salaryLabel && <li className="flex items-center gap-2"><CurrencyCircleDollar size={16} className="text-ink" /> {job.salaryLabel}</li>}
      </ul>
      <div className="mt-auto flex items-center justify-between pt-4 text-[12.5px]">
        <span className="text-muted">Publicada em {formatDate(job.publishedOn)}</span>
        <span className="font-semibold text-ink">Ver vaga →</span>
      </div>
    </Link>
  );
}
