import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ShieldCheck } from "@phosphor-icons/react/ssr";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { NoPermission } from "@/components/layout/states";
import { CandidateList } from "@/components/recruitment/candidate-list";
import { Panel } from "@/components/dashboard/widgets";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { retentionDue } from "@/server/modules/candidates/service";
import { getCompanySettings } from "@/server/modules/settings/service";
import { runRetentionAction } from "./actions";

export const metadata: Metadata = { title: "Banco de Talentos" };

export default function TalentPoolPage({ searchParams }: PageProps<"/banco-de-talentos">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/banco-de-talentos">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "talentpool.view")) return <NoPermission />;
  const sp = await searchParams;
  const privacy = can(actor, "privacy.manage");
  const [due, settings] = privacy ? await Promise.all([retentionDue(actor), getCompanySettings()]) : [0, null];

  return (
    <>
      <PageHeader title="Banco de Talentos" description="Candidatos que autorizaram ficar no banco. Filtre por cidade, cargo, experiência ou etiqueta e vincule a uma vaga aberta pelo perfil." />
      {privacy && due > 0 && (
        <Panel title="Retenção de dados (LGPD)" icon={ShieldCheck} className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13.5px]">
              <strong>{due}</strong> candidato(s) passaram do prazo de {settings ? Math.round(settings.retentionDays / 30) : "—"} meses sem processo ativo.{" "}
              <Link href="/configuracoes/empresa" className="text-muted underline underline-offset-4">Ajustar prazo</Link>
            </p>
            <ConfirmAction label="Anonimizar vencidos" size="sm" question={`Anonimizar ${due} candidato(s) com prazo de retenção vencido? Não dá para desfazer.`} confirmLabel="Anonimizar" action={runRetentionAction} />
          </div>
        </Panel>
      )}
      <CandidateList actor={actor} sp={sp} basePath="/banco-de-talentos" talentPool />
    </>
  );
}
