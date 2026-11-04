"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Warning } from "@phosphor-icons/react";
import { Alert, Button, Card, CardHeader, Checkbox, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { FileInput } from "@/components/ui/file-input";
import { pick, type FormState } from "@/lib/form";
import type { DuplicateHit } from "@/server/modules/candidates/service";
import { checkDuplicatesAction, saveCandidateAction } from "./actions";

type Opt = { id: string; name: string };
export type CandidateFormData = {
  id: string; fullName: string; phone: string; whatsapp: string; email: string | null; city: string | null; state: string | null; address: string | null;
  desiredPositionId: string | null; desiredStoreId: string | null; source: string; experience: string | null; introduction: string | null; ownerId: string | null;
};

export function CandidateForm({
  candidate, stores, positions, owners, jobs, sources, ufs, defaultJobId, defaultOwnerId, storageReady, ownerLocked,
}: {
  candidate?: CandidateFormData; stores: (Opt & { city: string })[]; positions: Opt[]; owners: Opt[]; jobs: (Opt & { store: string })[];
  sources: [string, string][]; ufs: readonly string[]; defaultJobId?: string; defaultOwnerId?: string; storageReady: boolean; ownerLocked: boolean;
}) {
  const [state, action, pending] = useActionState(saveCandidateAction.bind(null, candidate?.id ?? null), { ok: true } as FormState);
  const e = !state.ok ? state.fieldErrors ?? {} : {};
  const [dups, setDups] = useState<DuplicateHit[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const seq = useRef(0);

  async function checkDuplicates() {
    const f = formRef.current;
    if (!f) return;
    const get = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
    const n = ++seq.current;
    const hits = await checkDuplicatesAction({ phone: get("phone"), whatsapp: get("whatsapp"), email: get("email"), excludeId: candidate?.id });
    if (n === seq.current) setDups(hits);
  }
  // Ao voltar com erro, confere de novo o que foi digitado.
  useEffect(() => {
    if (state.submission) void checkDuplicates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.submission]);

  return (
    <form ref={formRef} action={action} noValidate className="flex flex-col gap-5">
      {!state.ok && <Alert>{state.fieldErrors ? "Revise os campos destacados." : state.message}</Alert>}
      {dups.length > 0 && (
        <Alert tone="warning" title="Possível cadastro duplicado">
          <ul className="mt-1 flex flex-col gap-1">
            {dups.map((d, i) => (
              <li key={d.id ?? i} className="flex items-center gap-2">
                <Warning size={15} weight="fill" />
                {d.visible && d.id ? (
                  <Link href={`/candidatos/${d.id}`} target="_blank" className="font-semibold underline decoration-brand decoration-2 underline-offset-4">{d.fullName}</Link>
                ) : (
                  <span>Já existe um candidato fora das suas lojas</span>
                )}
                <span className="text-muted">— mesmo {d.matchedBy.join(" e ")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12.5px]">Se for a mesma pessoa, abra o cadastro existente e vincule à vaga por lá.</p>
        </Alert>
      )}
      <div key={state.submission ?? 0} className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Dados pessoais e contato" />
          <div className="grid gap-5 p-5 sm:grid-cols-6">
            <Field label="Nome completo" htmlFor="fullName" errors={e.fullName} className="sm:col-span-6">
              <Input id="fullName" name="fullName" defaultValue={pick(state, "fullName", candidate?.fullName)} maxLength={120} autoFocus={!candidate} autoComplete="off" invalid={!!e.fullName} />
            </Field>
            <Field label="Telefone" htmlFor="phone" errors={e.phone} className="sm:col-span-2">
              <Input id="phone" name="phone" inputMode="tel" defaultValue={pick(state, "phone", candidate?.phone)} placeholder="(11) 98888-7777" onBlur={checkDuplicates} invalid={!!e.phone} />
            </Field>
            <Field label="WhatsApp" htmlFor="whatsapp" errors={e.whatsapp} className="sm:col-span-2" hint="Em branco: marque se é o mesmo número.">
              <Input id="whatsapp" name="whatsapp" inputMode="tel" defaultValue={pick(state, "whatsapp", candidate?.whatsapp)} onBlur={checkDuplicates} invalid={!!e.whatsapp} />
            </Field>
            <Field label="E-mail" htmlFor="email" errors={e.email} className="sm:col-span-2">
              <Input id="email" name="email" type="email" defaultValue={pick(state, "email", candidate?.email)} onBlur={checkDuplicates} invalid={!!e.email} />
            </Field>
            <div className="sm:col-span-6">
              <Checkbox name="sameWhatsapp" defaultChecked={state.values ? state.values.sameWhatsapp === "on" : !candidate || candidate.phone === candidate.whatsapp} label="O WhatsApp é o mesmo número do telefone" />
            </div>
            <Field label="Cidade" htmlFor="city" errors={e.city} className="sm:col-span-3">
              <Input id="city" name="city" defaultValue={pick(state, "city", candidate?.city)} maxLength={80} />
            </Field>
            <Field label="UF" htmlFor="state" errors={e.state} className="sm:col-span-1">
              <Select id="state" name="state" defaultValue={pick(state, "state", candidate?.state)}>
                <option value="">—</option>
                {ufs.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
            <Field label="Endereço / bairro" htmlFor="address" errors={e.address} className="sm:col-span-2">
              <Input id="address" name="address" defaultValue={pick(state, "address", candidate?.address)} maxLength={200} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Interesse e perfil" />
          <div className="grid gap-5 p-5 sm:grid-cols-6">
            <Field label="Cargo desejado" htmlFor="desiredPositionId" errors={e.desiredPositionId} className="sm:col-span-2">
              <Select id="desiredPositionId" name="desiredPositionId" defaultValue={pick(state, "desiredPositionId", candidate?.desiredPositionId)}>
                <option value="">Não informado</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Loja desejada" htmlFor="desiredStoreId" errors={e.desiredStoreId} className="sm:col-span-2">
              <Select id="desiredStoreId" name="desiredStoreId" defaultValue={pick(state, "desiredStoreId", candidate?.desiredStoreId)} invalid={!!e.desiredStoreId}>
                <option value="">Qualquer loja</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.city}</option>)}
              </Select>
            </Field>
            <Field label="Origem" htmlFor="source" errors={e.source} className="sm:col-span-2">
              <Select id="source" name="source" defaultValue={pick(state, "source", candidate?.source ?? "MANUAL")}>
                {sources.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Experiência" htmlFor="experience" errors={e.experience} className="sm:col-span-3">
              <Textarea id="experience" name="experience" defaultValue={pick(state, "experience", candidate?.experience)} placeholder="Onde trabalhou, quanto tempo, o que fazia..." />
            </Field>
            <Field label="Apresentação / observação do candidato" htmlFor="introduction" errors={e.introduction} className="sm:col-span-3">
              <Textarea id="introduction" name="introduction" defaultValue={pick(state, "introduction", candidate?.introduction)} />
            </Field>
            <Field label="Recrutador responsável" htmlFor="ownerId" errors={e.ownerId} className="sm:col-span-3" hint={ownerLocked ? "Você fica como responsável pelos candidatos que cadastra." : undefined}>
              <Select id="ownerId" name="ownerId" defaultValue={pick(state, "ownerId", candidate ? candidate.ownerId : defaultOwnerId)} disabled={ownerLocked}>
                <option value="">Sem responsável</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
            {!candidate && (
              <Field label="Já vincular à vaga" htmlFor="jobId" errors={e.jobId} className="sm:col-span-3" hint={jobs.length ? "Opcional. O candidato entra na etapa Inscrito." : "Nenhuma vaga aberta no momento."}>
                <Select id="jobId" name="jobId" defaultValue={pick(state, "jobId", defaultJobId)} disabled={!jobs.length}>
                  <option value="">Não vincular agora</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.name} · {j.store}</option>)}
                </Select>
              </Field>
            )}
          </div>
        </Card>

        {!candidate && (
          <Card>
            <CardHeader title="Currículo e autorização" />
            <div className="flex flex-col gap-5 p-5">
              <Field label="Currículo (PDF, até 4 MB)" htmlFor="resume" errors={e.resume} hint={storageReady ? (state.values ? "Por segurança, selecione o arquivo de novo." : undefined) : "O armazenamento de currículos ainda não foi configurado — dá para anexar depois."}>
                <FileInput id="resume" name="resume" accept="application/pdf,.pdf" disabled={!storageReady} />
              </Field>
              <div>
                <Checkbox name="consent" defaultChecked={state.values?.consent === "on"} label="O candidato autorizou o uso dos dados para este processo e para o banco de talentos" hint="Exigido pela LGPD. Fica registrado com a versão atual da política de privacidade." />
                {e.consent && <p className="mt-1.5 text-[12.5px] text-danger">{e.consent[0]}</p>}
              </div>
            </div>
          </Card>
        )}
      </div>
      {ownerLocked && <input type="hidden" name="ownerId" value={candidate?.ownerId ?? defaultOwnerId ?? ""} />}
      <div className="flex justify-end gap-2">
        <Link href={candidate ? `/candidatos/${candidate.id}` : "/candidatos"} className={buttonClass("secondary")}>Cancelar</Link>
        <Button type="submit" disabled={pending}>{pending ? "Salvando…" : candidate ? "Salvar alterações" : "Cadastrar candidato"}</Button>
      </div>
    </form>
  );
}
