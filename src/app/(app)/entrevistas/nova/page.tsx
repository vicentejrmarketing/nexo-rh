import type { Metadata } from "next";
import { Suspense } from "react";
import { Alert, Breadcrumb, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { InterviewForm } from "@/components/interviews/interview-form";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { interviewFormOptions, processForInterview } from "@/server/modules/interviews/service";
import { parseDateSP } from "@/lib/period";

export const metadata: Metadata = { title: "Agendar entrevista" };

export default function NewInterviewPage({ searchParams }: PageProps<"/entrevistas/nova">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/entrevistas/nova">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "interviews.manage")) return <NoPermission />;
  const sp = await searchParams;
  const processo = typeof sp.processo === "string" ? sp.processo : undefined;
  const data = typeof sp.data === "string" && parseDateSP(sp.data) ? sp.data : undefined;
  const [opts, proc] = await Promise.all([interviewFormOptions(actor), processo ? processForInterview(actor, processo) : Promise.resolve(null)]);
  return (
    <div className="max-w-3xl">
      <Breadcrumb items={[{ href: "/entrevistas", label: "Entrevistas" }, { label: "Agendar" }]} />
      <PageHeader title="Agendar entrevista" description="O sistema avisa se o entrevistador ou o candidato já tiver outra entrevista no horário." />
      {proc && !proc.active && <div className="mb-5"><Alert tone="warning">Este processo está encerrado. Reabra no funil para agendar.</Alert></div>}
      <InterviewForm
        mode="new"
        process={proc && proc.active ? proc : null}
        stores={opts.stores}
        interviewers={opts.interviewers.map((u) => ({ id: u.id, name: u.name, role: u.role.name }))}
        initial={{ date: data, time: undefined, interviewerId: actor.permissions.has("interviews.evaluate") ? actor.id : null }}
        cancelHref={proc ? `/funil` : "/entrevistas"}
      />
    </div>
  );
}
