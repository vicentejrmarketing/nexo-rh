import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, CardHeader, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { db } from "@/server/db/client";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Integração WhatsApp" };

const STEPS = [
  ["Portfólio empresarial verificado", "No Gerenciador de Negócios da Meta, conclua a verificação da empresa."],
  ["Número dedicado", "Um número que não esteja em uso no aplicativo WhatsApp comum."],
  ["App na Meta for Developers", "Crie um app do tipo Business e adicione o produto WhatsApp. Anote o App ID e o App Secret."],
  ["IDs da conta", "Em WhatsApp → Configuração da API, copie o WhatsApp Business Account ID e o Phone Number ID."],
  ["Token permanente", "Crie um Usuário do sistema com as permissões whatsapp_business_messaging e whatsapp_business_management e gere o token."],
  ["Webhook", "Com o sistema publicado, cadastre a URL /api/webhooks/whatsapp e o Verify Token, assinando o campo messages."],
];

export default function WhatsAppPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  if (!can(actor, "integrations.manage")) return <NoPermission />;
  const integration = await db.whatsAppIntegration.findUnique({
    where: { id: "default" },
    select: { status: true, appId: true, wabaId: true, phoneNumberId: true, displayPhone: true, accessTokenLast4: true, lastCheckedAt: true, lastError: true },
  });
  const status = integration?.status ?? "NOT_CONNECTED";
  const rows: [string, string | null | undefined][] = [
    ["Meta App ID", integration?.appId],
    ["WhatsApp Business Account ID", integration?.wabaId],
    ["Phone Number ID", integration?.phoneNumberId],
    ["Access Token", integration?.accessTokenLast4 ? `•••• ${integration.accessTokenLast4}` : null],
    ["Verify Token", null],
  ];

  return (
    <div className="max-w-4xl">
      <nav className="mb-2 text-[13px] text-muted">
        <Link href="/configuracoes" className="hover:text-ink">Configurações</Link> / Integração WhatsApp
      </nav>
      <PageHeader title="Integração WhatsApp" description="API oficial WhatsApp Business Platform (Meta Cloud API)." />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader
            title="Status da conexão"
            action={
              status === "CONNECTED" ? <Badge tone="success">Conectado</Badge> : status === "ERROR" ? <Badge tone="danger">Erro</Badge> : <Badge tone="warning">Não conectado</Badge>
            }
          />
          <dl className="divide-y divide-line text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 px-5 py-3">
                <dt className="text-muted">{label}</dt>
                <dd className={value ? "font-mono text-[13px]" : "text-muted"}>{value || "Não configurado"}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">
            {integration?.lastCheckedAt ? `Última verificação: ${formatDateTime(integration.lastCheckedAt)}` : "Nenhuma verificação feita ainda."}
            {" "}O cadastro das credenciais, o webhook e o envio de mensagens chegam na Etapa 4. Os tokens ficam cifrados no servidor e nunca são exibidos por inteiro.
          </p>
        </Card>

        <Card>
          <CardHeader title="Como preparar a conexão" description="Itens que dependem da sua conta na Meta." />
          <ol className="divide-y divide-line">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="flex gap-3 px-5 py-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-[12px] font-semibold text-ink">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-ink">{title}</p>
                  <p className="text-[13px] text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
