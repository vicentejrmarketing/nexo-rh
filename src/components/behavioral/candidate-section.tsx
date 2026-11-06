import Link from "next/link";
import { headers } from "next/headers";
import { Brain } from "@phosphor-icons/react/ssr";
import { Panel } from "@/components/dashboard/widgets";
import { buttonClass } from "@/components/ui";
import { can, type Actor } from "@/server/authz/authorize";
import { testsForCandidate } from "@/server/modules/behavioral/service";
import { getCompanySettings } from "@/server/modules/settings/service";
import { formatDate, formatDateTime } from "@/lib/format";
import { GenerateTestButton } from "./generate-dialog";
import { ScoreBadge, TestStatusBadge } from "./badges";
import { CopyLink } from "./copy-link";

type C = {
  id: string; fullName: string; cpf: string | null; phoneE164: string | null; whatsappE164: string | null;
  processes: { id: string; status: string; job: { title: string; store: { name: string } }; stage: { name: string } }[];
};

/** Seção "Avaliação Comportamental" na ficha do candidato. */
export async function BehavioralSection({ actor, candidate: c }: { actor: Actor; candidate: C }) {
  const tests = await testsForCandidate(actor, c.id);
  if (!tests) return null;
  const canSend = can(actor, "behavioral.send");
  const canView = can(actor, "behavioral.view");
  const [settings, h] = await Promise.all([getCompanySettings(), headers()]);
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
  const preset = {
    id: c.id, fullName: c.fullName, hasCpf: !!c.cpf, phone: c.whatsappE164 ?? c.phoneE164,
    processes: c.processes.filter((p) => p.status === "ACTIVE" || p.status === "HIRED").map((p) => ({ id: p.id, label: `${p.job.title} · ${p.job.store.name}`, stage: p.stage.name })),
    lastTest: tests[0] && (tests[0].state === "SENT" || tests[0].state === "COMPLETED") ? { status: tests[0].state === "SENT" ? ("SENT" as const) : ("COMPLETED" as const), sentAt: tests[0].sentAt } : null,
  };
  return (
    <Panel title="Avaliação Comportamental" icon={Brain} action={canSend ? <GenerateTestButton origin={origin} company={settings.companyName} preset={preset} small /> : undefined}>
      {tests.length === 0 ? (
        <p className="py-3 text-center text-[13px] text-muted">Nenhum teste enviado.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tests.map((t) => (
            <li key={t.id} className="rounded-lg border border-line p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px] font-medium">{t.jobTitle ?? "Sem vaga específica"}</span>
                <TestStatusBadge state={t.state} />
              </div>
              <p className="mt-1 text-[12.5px] text-muted">
                Enviado em {formatDate(t.sentAt)}{t.createdBy ? ` por ${t.createdBy}` : ""}
                {t.completedAt ? ` · concluído em ${formatDateTime(t.completedAt)}` : t.state === "SENT" ? ` · vence em ${formatDate(t.expiresAt)}` : ""}
              </p>
              {t.path && <div className="mt-2"><CopyLink url={`${origin}${t.path}`} /></div>}
              {t.state === "COMPLETED" && (
                canView && t.overall !== null ? (
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2 text-[13px]"><ScoreBadge score={t.overall} /> {t.profile}</span>
                    <Link href={`/teste-comportamental/${t.id}`} className={buttonClass("secondary", "sm")}>Relatório completo</Link>
                  </div>
                ) : <p className="mt-2 text-[12.5px] text-muted">Resultado visível só para o RH.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
