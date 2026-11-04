import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumb, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { getCompanySettings, PRIVACY_TEMPLATE } from "@/server/modules/settings/service";
import { CompanyForm } from "./company-form";

export const metadata: Metadata = { title: "Dados da empresa" };

export default function CompanyPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "settings.manage")) return <NoPermission />;
  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ href: "/configuracoes", label: "Configurações" }, { label: "Dados da empresa" }]} />
      <PageHeader title="Dados da empresa e LGPD" />
      <CompanyForm settings={await getCompanySettings()} template={PRIVACY_TEMPLATE} />
    </div>
  );
}
