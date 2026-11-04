import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert, Breadcrumb, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { APPROVAL_LABEL, PURPOSES, VARIABLES, listTemplates } from "@/server/modules/messages/templates";
import { integrationStatus } from "@/server/whatsapp/settings";
import { TemplatesManager } from "./editor";

export const metadata: Metadata = { title: "Modelos de mensagens" };

export default function TemplatesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "templates.manage")) return <NoPermission />;
  const [templates, status] = await Promise.all([listTemplates(), integrationStatus()]);
  const connected = status.status === "CONNECTED";
  const purposesTaken = new Set(templates.map((t) => t.purpose));
  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ href: "/configuracoes", label: "Configurações" }, { label: "Modelos de mensagens" }]} />
      <PageHeader title="Modelos de mensagens" description="Textos prontos de convocação, lembrete, aprovação e reprovação, com variáveis preenchidas automaticamente." />
      <div className="mb-5">
        <Alert tone="brand" title="Regra da Meta">
          Quando o candidato escreveu nas últimas 24 horas, qualquer mensagem pode ser enviada. Fora dessa janela, só modelos <strong>aprovados pela Meta</strong>.
          {!connected && <> Para enviar modelos à aprovação, <Link href="/configuracoes/whatsapp" className="font-semibold underline">conecte o WhatsApp</Link>.</>}
        </Alert>
      </div>
      <TemplatesManager
        templates={templates.map((t) => ({ id: t.id, name: t.name, purpose: t.purpose, category: t.category, text: t.text, approval: t.approval, approvalLabel: APPROVAL_LABEL[t.approval], rejectionReason: t.rejectionReason, active: t.active, metaName: t.metaName }))}
        purposes={PURPOSES}
        vars={Object.entries(VARIABLES).map(([key, v]) => ({ key, label: v.label, example: v.example }))}
        connected={connected}
        canSeed={PURPOSES.slice(0, 6).some((p) => !purposesTaken.has(p))}
      />
    </div>
  );
}
