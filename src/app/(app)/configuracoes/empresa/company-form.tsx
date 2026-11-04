"use client";

import { useActionState, useRef } from "react";
import { Alert, Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { pick, type FormState } from "@/lib/form";
import { saveCompanyAction } from "./actions";

type Settings = {
  companyName: string; legalName: string | null; taxId: string | null; contactEmail: string | null; contactPhone: string | null;
  privacyPolicy: string | null; privacyVersion: string | null; retentionDays: number; stalledDays: number;
  siteTitle: string | null; siteIntro: string | null; siteContactEmail: string | null; siteContactWhatsapp: string | null;
};

export function CompanyForm({ settings, template }: { settings: Settings; template: string }) {
  const [state, action, pending] = useActionState(saveCompanyAction, { ok: true } as FormState);
  const e = !state.ok ? state.fieldErrors ?? {} : {};
  const policyRef = useRef<HTMLTextAreaElement>(null);
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.message && (state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert>{state.message}</Alert>)}
      <div key={state.submission ?? 0} className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Dados da empresa" description="Aparecem na política de privacidade e no site de vagas." />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Field label="Nome fantasia" htmlFor="companyName" errors={e.companyName}>
              <Input id="companyName" name="companyName" defaultValue={pick(state, "companyName", settings.companyName)} maxLength={120} />
            </Field>
            <Field label="Razão social" htmlFor="legalName" errors={e.legalName}>
              <Input id="legalName" name="legalName" defaultValue={pick(state, "legalName", settings.legalName)} maxLength={160} />
            </Field>
            <Field label="CNPJ" htmlFor="taxId" errors={e.taxId}>
              <Input id="taxId" name="taxId" defaultValue={pick(state, "taxId", settings.taxId)} maxLength={20} placeholder="00.000.000/0000-00" />
            </Field>
            <Field label="E-mail de contato (LGPD)" htmlFor="contactEmail" errors={e.contactEmail} hint="Canal para o candidato exercer os direitos dele.">
              <Input id="contactEmail" name="contactEmail" type="email" defaultValue={pick(state, "contactEmail", settings.contactEmail)} invalid={!!e.contactEmail} />
            </Field>
            <Field label="Telefone de contato" htmlFor="contactPhone">
              <Input id="contactPhone" name="contactPhone" defaultValue={pick(state, "contactPhone", settings.contactPhone)} maxLength={30} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Retenção e alertas" />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Field label="Prazo de retenção do banco de talentos (meses)" htmlFor="retentionMonths" errors={e.retentionMonths} hint="Sem atividade nesse prazo, o cadastro é anonimizado. Sugestão: 24.">
              <Input id="retentionMonths" name="retentionMonths" type="number" min={6} max={60} defaultValue={pick(state, "retentionMonths", Math.round(settings.retentionDays / 30))} invalid={!!e.retentionMonths} />
            </Field>
            <Field label="Alerta de candidato parado (dias)" htmlFor="stalledDays" errors={e.stalledDays} hint="Padrão para as etapas do funil (Etapa 3).">
              <Input id="stalledDays" name="stalledDays" type="number" min={1} max={60} defaultValue={pick(state, "stalledDays", settings.stalledDays)} invalid={!!e.stalledDays} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Site de vagas" description="Textos e contatos exibidos em Trabalhe conosco. Em branco, o site usa textos padrão." />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Field label="Título da página inicial" htmlFor="siteTitle" errors={e.siteTitle} className="sm:col-span-2">
              <Input id="siteTitle" name="siteTitle" defaultValue={pick(state, "siteTitle", settings.siteTitle)} maxLength={90} placeholder={`Trabalhe na ${settings.companyName || "nossa empresa"}`} />
            </Field>
            <Field label="Texto de apresentação" htmlFor="siteIntro" errors={e.siteIntro} className="sm:col-span-2">
              <Textarea id="siteIntro" name="siteIntro" defaultValue={pick(state, "siteIntro", settings.siteIntro)} maxLength={400} className="min-h-20" placeholder="Confira as vagas abertas nas nossas lojas e candidate-se em poucos minutos." />
            </Field>
            <Field label="E-mail de contato no site" htmlFor="siteContactEmail" errors={e.siteContactEmail} hint="Em branco, usa o e-mail da empresa.">
              <Input id="siteContactEmail" name="siteContactEmail" type="email" defaultValue={pick(state, "siteContactEmail", settings.siteContactEmail)} invalid={!!e.siteContactEmail} />
            </Field>
            <Field label="WhatsApp de contato no site" htmlFor="siteContactWhatsapp" errors={e.siteContactWhatsapp}>
              <Input id="siteContactWhatsapp" name="siteContactWhatsapp" inputMode="tel" defaultValue={pick(state, "siteContactWhatsapp", settings.siteContactWhatsapp)} invalid={!!e.siteContactWhatsapp} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Política de privacidade"
            description={settings.privacyVersion ? `Versão publicada: ${settings.privacyVersion}. Cada consentimento registra a versão aceita.` : "Ainda não publicada."}
            action={
              <Button type="button" variant="secondary" size="sm" onClick={() => { if (policyRef.current) policyRef.current.value = template; }}>
                Usar modelo
              </Button>
            }
          />
          <div className="p-5">
            {!settings.privacyPolicy && (
              <div className="mb-3">
                <Alert tone="warning">O modelo é um ponto de partida e precisa ser revisado pelo jurídico antes do portal de vagas (Etapa 5) entrar no ar.</Alert>
              </div>
            )}
            <Field label="Texto da política" htmlFor="privacyPolicy" errors={e.privacyPolicy}>
              <Textarea ref={policyRef} id="privacyPolicy" name="privacyPolicy" defaultValue={pick(state, "privacyPolicy", settings.privacyPolicy)} className="min-h-72 font-mono text-[13px]" />
            </Field>
          </div>
        </Card>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
      </div>
    </form>
  );
}
