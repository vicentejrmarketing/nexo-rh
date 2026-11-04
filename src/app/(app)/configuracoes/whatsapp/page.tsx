import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { Alert, Badge, Breadcrumb, Card, CardHeader, PageHeader, PageSkeleton } from "@/components/ui";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { integrationStatus } from "@/server/whatsapp/settings";
import { formatDateTime } from "@/lib/format";
import { disconnectAction } from "./actions";
import { CopyText, CredentialsForm, TestButton, VerifyTokenBox } from "./controls";

export const metadata: Metadata = { title: "Integração WhatsApp" };

const STEPS = [
  ["Portfólio empresarial verificado", "No Gerenciador de Negócios da Meta (business.facebook.com), conclua a verificação da empresa."],
  ["Número dedicado", "Um número que não esteja em uso no aplicativo WhatsApp comum nem no WhatsApp Business do celular."],
  ["App na Meta for Developers", "Crie um app do tipo Empresa e adicione o produto WhatsApp. Anote o App ID e o App Secret (Configurações → Básico)."],
  ["IDs da conta", "Em WhatsApp → Configuração da API, copie o WhatsApp Business Account ID e o Phone Number ID."],
  ["Token permanente", "Usuários do sistema → crie um Administrador, atribua o app e a conta do WhatsApp e gere o token com whatsapp_business_messaging e whatsapp_business_management."],
  ["Cadastre aqui", "Preencha o formulário ao lado e clique em Salvar e testar."],
  ["Webhook", "Na Meta, em WhatsApp → Configuração → Webhook, cole a URL de retorno e o Verify Token gerados aqui; depois assine o campo messages."],
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
  const s = await integrationStatus();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const webhookUrl = `${host.startsWith("localhost") ? "http" : "https"}://${host}/api/webhooks/whatsapp`;
  const badge = s.status === "CONNECTED" ? <Badge tone="success">Conectado</Badge> : s.status === "ERROR" ? <Badge tone="danger">Erro</Badge> : <Badge tone="warning">Não conectado</Badge>;

  return (
    <div className="max-w-5xl">
      <Breadcrumb items={[{ href: "/configuracoes", label: "Configurações" }, { label: "Integração WhatsApp" }]} />
      <PageHeader title="Integração WhatsApp" description="API oficial WhatsApp Business Platform (Meta Cloud API). Tokens ficam cifrados no servidor e nunca aparecem por inteiro." />
      {!s.encryptionReady && <div className="mb-5"><Alert title="Chave de criptografia ausente">O servidor ainda não tem a variável ENCRYPTION_KEY. Sem ela não é possível guardar o token com segurança.</Alert></div>}
      {s.status === "ERROR" && s.lastError && <div className="mb-5"><Alert title="A Meta recusou a conexão">{s.lastError}</Alert></div>}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Status da conexão" action={badge} />
            <dl className="divide-y divide-line text-sm">
              {[
                ["Número", s.displayPhone ? `${s.displayPhone}${s.verifiedName ? ` · ${s.verifiedName}` : ""}` : null],
                ["Qualidade do número", s.qualityRating ? ({ GREEN: "Alta", YELLOW: "Média", RED: "Baixa" } as Record<string, string>)[s.qualityRating] ?? s.qualityRating : null],
                ["Access Token", s.accessTokenLast4 ? `•••• ${s.accessTokenLast4}` : null],
                ["App Secret", s.hasAppSecret ? "Configurado" : null],
                ["Verify Token", s.hasVerifyToken ? "Configurado" : null],
                ["Último evento do webhook", s.lastWebhookAt ? formatDateTime(s.lastWebhookAt) : null],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-5 py-3">
                  <dt className="text-muted">{label}</dt>
                  <dd className={value ? "text-right font-medium" : "text-muted"}>{value || "Não configurado"}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap items-start justify-between gap-3 border-t border-line px-5 py-3">
              <p className="text-[12.5px] text-muted">{s.lastCheckedAt ? `Última verificação: ${formatDateTime(s.lastCheckedAt)}` : "Nenhuma verificação feita ainda."}</p>
              {s.accessTokenLast4 && <TestButton />}
            </div>
          </Card>

          <Card>
            <CardHeader title="Credenciais da Meta" />
            <div className="p-5">
              <CredentialsForm current={{ appId: s.appId, wabaId: s.wabaId, phoneNumberId: s.phoneNumberId, tokenLast4: s.accessTokenLast4, hasAppSecret: s.hasAppSecret }} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Webhook" description="Para receber mensagens e confirmações de entrega." />
            <div className="flex flex-col gap-5 p-5">
              <div>
                <p className="mb-1.5 text-[13px] font-medium">URL de retorno de chamada</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2 font-mono text-[13px]">{webhookUrl}</code>
                  <CopyText value={webhookUrl} />
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[13px] font-medium">Verify Token</p>
                <VerifyTokenBox has={s.hasVerifyToken} />
              </div>
              <p className="text-[12.5px] text-muted">Depois de verificar, assine o campo <strong>messages</strong>. Os eventos são aceitos só com a assinatura da Meta (App Secret).</p>
            </div>
          </Card>

          {(s.accessTokenLast4 || s.hasAppSecret) && (
            <Card>
              <CardHeader title="Desconectar" description="Apaga o token, o App Secret e o Verify Token. As conversas ficam guardadas." />
              <div className="p-5">
                <ConfirmAction label="Desconectar WhatsApp" size="sm" question="Apagar as credenciais? O envio e o recebimento de mensagens param até conectar de novo." confirmLabel="Desconectar" action={disconnectAction} />
              </div>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader title="Como conectar" description="Passo a passo na sua conta da Meta." />
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
          <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">
            Depois de conectar, revise os <Link href="/configuracoes/modelos" className="font-semibold underline underline-offset-4">modelos de mensagens</Link> e envie para aprovação da Meta: fora da janela de 24 horas só modelos aprovados podem ser enviados.
          </p>
        </Card>
      </div>
    </div>
  );
}
