"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, Button, Card, CardHeader, Checkbox, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { formatMoneyBR, pick, type FormState } from "@/lib/form";
import { saveJobAction } from "./actions";

type Opt = { id: string; name: string };
type Job = {
  id: string; title: string; description: string; requirements: string | null; salaryMin: string | null; salaryMax: string | null;
  salaryText: string | null; benefits: string | null; openings: number; storeId: string; positionId: string | null; city: string;
  recruiterId: string | null; priority: string; expectedCloseAt: string | null; publishedOnline: boolean; status: string;
};

export function JobForm({
  job, stores, positions, recruiters, defaultStoreId,
}: { job?: Job; stores: (Opt & { city: string })[]; positions: Opt[]; recruiters: (Opt & { role: string })[]; defaultStoreId?: string }) {
  const [state, action, pending] = useActionState(saveJobAction.bind(null, job?.id ?? null), { ok: true } as FormState);
  const e = !state.ok ? state.fieldErrors ?? {} : {};
  // Select não controlado (o React 19 reinicia o formulário após a ação); o estado só alimenta a dica de cidade.
  const initialStore = pick(state, "storeId", job?.storeId ?? defaultStoreId ?? (stores.length === 1 ? stores[0].id : ""));
  const [storeId, setStoreId] = useState(initialStore);
  const storeCity = stores.find((s) => s.id === storeId)?.city ?? "";

  if (stores.length === 0) {
    return <Alert tone="warning" title="Nenhuma loja disponível">Cadastre uma loja (ou peça para ser vinculado a uma) antes de criar vagas.</Alert>;
  }

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {!state.ok && <Alert>{state.fieldErrors ? "Revise os campos destacados." : state.message}</Alert>}
      <div key={state.submission ?? 0} className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Vaga" />
          <div className="grid gap-5 p-5 sm:grid-cols-6">
            <Field label="Nome da vaga" htmlFor="title" errors={e.title} className="sm:col-span-4">
              <Input id="title" name="title" defaultValue={pick(state, "title", job?.title)} placeholder="Ex.: Vendedor(a) de Loja" maxLength={120} autoFocus={!job} invalid={!!e.title} />
            </Field>
            <Field label="Cargo" htmlFor="positionId" errors={e.positionId} className="sm:col-span-2" hint={positions.length ? undefined : "Cadastre cargos em Configurações."}>
              <Select id="positionId" name="positionId" defaultValue={pick(state, "positionId", job?.positionId)}>
                <option value="">Sem cargo definido</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Loja" htmlFor="storeId" errors={e.storeId} className="sm:col-span-2">
              <Select id="storeId" name="storeId" defaultValue={initialStore} onChange={(ev) => setStoreId(ev.target.value)} invalid={!!e.storeId}>
                <option value="">Selecione</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.city}</option>)}
              </Select>
            </Field>
            <Field label="Cidade" htmlFor="city" className="sm:col-span-2" hint="Em branco, usa a cidade da loja.">
              <Input id="city" name="city" defaultValue={pick(state, "city", job?.city)} placeholder={storeCity} maxLength={80} />
            </Field>
            <Field label="Quantidade de vagas" htmlFor="openings" errors={e.openings} className="sm:col-span-2">
              <Input id="openings" name="openings" type="number" min={1} defaultValue={pick(state, "openings", job?.openings ?? 1)} invalid={!!e.openings} />
            </Field>
            <Field label="Descrição" htmlFor="description" errors={e.description} className="sm:col-span-6">
              <Textarea id="description" name="description" defaultValue={pick(state, "description", job?.description)} placeholder="Atividades, jornada, local de trabalho..." invalid={!!e.description} className="min-h-32" />
            </Field>
            <Field label="Requisitos" htmlFor="requirements" errors={e.requirements} className="sm:col-span-3">
              <Textarea id="requirements" name="requirements" defaultValue={pick(state, "requirements", job?.requirements)} placeholder="Escolaridade, experiência, disponibilidade..." />
            </Field>
            <Field label="Benefícios" htmlFor="benefits" errors={e.benefits} className="sm:col-span-3">
              <Textarea id="benefits" name="benefits" defaultValue={pick(state, "benefits", job?.benefits)} placeholder="Vale-transporte, comissão, plano de saúde..." />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Salário, responsável e prazos" />
          <div className="grid gap-5 p-5 sm:grid-cols-6">
            <Field label="Salário mínimo (R$)" htmlFor="salaryMin" errors={e.salaryMin} className="sm:col-span-2">
              <Input id="salaryMin" name="salaryMin" inputMode="decimal" defaultValue={pick(state, "salaryMin", formatMoneyBR(job?.salaryMin))} placeholder="1.800,00" invalid={!!e.salaryMin} />
            </Field>
            <Field label="Salário máximo (R$)" htmlFor="salaryMax" errors={e.salaryMax} className="sm:col-span-2">
              <Input id="salaryMax" name="salaryMax" inputMode="decimal" defaultValue={pick(state, "salaryMax", formatMoneyBR(job?.salaryMax))} placeholder="2.200,00" invalid={!!e.salaryMax} />
            </Field>
            <Field label="Ou texto do salário" htmlFor="salaryText" className="sm:col-span-2" hint='Ex.: "A combinar" ou "Fixo + comissão".'>
              <Input id="salaryText" name="salaryText" defaultValue={pick(state, "salaryText", job?.salaryText)} maxLength={80} />
            </Field>
            <Field label="Responsável pelo recrutamento" htmlFor="recruiterId" errors={e.recruiterId} className="sm:col-span-2">
              <Select id="recruiterId" name="recruiterId" defaultValue={pick(state, "recruiterId", job?.recruiterId)}>
                <option value="">Sem responsável</option>
                {recruiters.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.role}</option>)}
              </Select>
            </Field>
            <Field label="Prioridade" htmlFor="priority" className="sm:col-span-2">
              <Select id="priority" name="priority" defaultValue={pick(state, "priority", job?.priority ?? "MEDIUM")}>
                <option value="LOW">Baixa</option>
                <option value="MEDIUM">Média</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </Select>
            </Field>
            <Field label="Encerramento previsto" htmlFor="expectedCloseAt" errors={e.expectedCloseAt} className="sm:col-span-2">
              <Input id="expectedCloseAt" name="expectedCloseAt" type="date" defaultValue={pick(state, "expectedCloseAt", job?.expectedCloseAt)} />
            </Field>
            <div className="flex flex-col gap-3 sm:col-span-6">
              <Checkbox name="publishedOnline" defaultChecked={state.values ? state.values.publishedOnline === "on" : job?.publishedOnline ?? true} label="Publicar no portal de vagas" hint="O portal público de inscrição chega na Etapa 5." />
              {!job && (
                <Checkbox name="status" value="DRAFT" defaultChecked={state.values?.status === "DRAFT"} label="Salvar como rascunho" hint="A vaga só abre para candidatos quando você publicar." />
              )}
            </div>
          </div>
        </Card>
      </div>
      <div className="flex justify-end gap-2">
        <Link href={job ? `/vagas/${job.id}` : "/vagas"} className={buttonClass("secondary")}>Cancelar</Link>
        <Button type="submit" disabled={pending}>{pending ? "Salvando…" : job ? "Salvar alterações" : "Criar vaga"}</Button>
      </div>
    </form>
  );
}
