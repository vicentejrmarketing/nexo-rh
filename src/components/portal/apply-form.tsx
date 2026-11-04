"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { FileInput } from "@/components/ui/file-input";
import { pick, type FormState } from "@/lib/form";
import { applyAction } from "@/app/trabalhe-conosco/actions";

export function ApplyForm({ slug, token, ufs }: { slug: string; token: string; ufs: readonly string[] }) {
  const [state, action, pending] = useActionState(applyAction.bind(null, slug), { ok: true } as FormState);
  const e = !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {!state.ok && <Alert>{state.fieldErrors ? "Confira os campos destacados abaixo." : state.message}</Alert>}
      <input type="hidden" name="_t" value={token} />
      {/* Campo invisível: pessoas não veem; robôs costumam preencher. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Site<input name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      </div>
      <div key={state.submission ?? 0} className="grid gap-5 sm:grid-cols-6">
        <Field label="Nome completo *" htmlFor="fullName" errors={e.fullName} className="sm:col-span-6">
          <Input id="fullName" name="fullName" autoComplete="name" defaultValue={pick(state, "fullName")} maxLength={120} invalid={!!e.fullName} required />
        </Field>
        <Field label="Telefone / WhatsApp *" htmlFor="phone" errors={e.phone} className="sm:col-span-3">
          <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(47) 99999-0000" defaultValue={pick(state, "phone")} invalid={!!e.phone} required />
        </Field>
        <Field label="E-mail" htmlFor="email" errors={e.email} className="sm:col-span-3">
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={pick(state, "email")} invalid={!!e.email} />
        </Field>
        <Field label="Cidade onde mora *" htmlFor="city" errors={e.city} className="sm:col-span-4">
          <Input id="city" name="city" autoComplete="address-level2" defaultValue={pick(state, "city")} maxLength={80} invalid={!!e.city} required />
        </Field>
        <Field label="Estado *" htmlFor="state" errors={e.state} className="sm:col-span-2">
          <Select id="state" name="state" autoComplete="address-level1" defaultValue={pick(state, "state")} invalid={!!e.state} required>
            <option value="">UF</option>
            {ufs.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label="Pretensão salarial (R$) *" htmlFor="salaryExpectation" errors={e.salaryExpectation} className="sm:col-span-3">
          <Input id="salaryExpectation" name="salaryExpectation" inputMode="decimal" placeholder="2.000,00" defaultValue={pick(state, "salaryExpectation")} invalid={!!e.salaryExpectation} required />
        </Field>
        <fieldset className="flex flex-col gap-1.5 sm:col-span-3">
          <legend className="mb-1.5 text-[13px] font-medium text-ink">Está trabalhando atualmente? *</legend>
          <div className="flex gap-2">
            {[["sim", "Sim"], ["nao", "Não"]].map(([v, l]) => (
              <label key={v} className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-white text-[14px] font-medium has-[:checked]:border-ink has-[:checked]:bg-brand-soft">
                <input type="radio" name="currentlyEmployed" value={v} defaultChecked={pick(state, "currentlyEmployed") === v} className="accent-[#111216]" /> {l}
              </label>
            ))}
          </div>
          {e.currentlyEmployed && <p className="text-[12.5px] text-danger" role="alert">{e.currentlyEmployed[0]}</p>}
        </fieldset>
        <Field label="Currículo em PDF (até 4 MB) *" htmlFor="resume" errors={e.resume} className="sm:col-span-6" hint={state.values ? "Por segurança, selecione o arquivo de novo." : undefined}>
          <FileInput id="resume" name="resume" accept="application/pdf,.pdf" />
        </Field>
        <Field label="Experiência profissional" htmlFor="experience" errors={e.experience} className="sm:col-span-6">
          <Textarea id="experience" name="experience" defaultValue={pick(state, "experience")} placeholder="Últimos empregos, funções e tempo em cada um." maxLength={5000} />
        </Field>
        <Field label="Observações" htmlFor="message" errors={e.message} className="sm:col-span-6">
          <Textarea id="message" name="message" defaultValue={pick(state, "message")} placeholder="Disponibilidade de horário, algo que queira contar..." maxLength={2000} className="min-h-20" />
        </Field>
        <div className="flex flex-col gap-3 sm:col-span-6">
          <label className="flex items-start gap-3 text-[14px]">
            <input type="checkbox" name="consent" defaultChecked={state.values?.consent === "on"} className="mt-0.5 h-5 w-5 shrink-0 accent-[#F5B900]" />
            <span>
              Autorizo o uso dos meus dados para este processo seletivo, conforme a{" "}
              <Link href="/trabalhe-conosco/privacidade" target="_blank" className="font-semibold underline decoration-brand decoration-2 underline-offset-4">política de privacidade</Link>. *
            </span>
          </label>
          {e.consent && <p className="-mt-1 text-[12.5px] text-danger" role="alert">{e.consent[0]}</p>}
          <label className="flex items-start gap-3 text-[14px]">
            <input type="checkbox" name="talentPool" defaultChecked={state.values?.talentPool === "on"} className="mt-0.5 h-5 w-5 shrink-0 accent-[#F5B900]" />
            <span>Quero que meu currículo fique no banco de talentos para outras vagas. <span className="text-muted">(opcional)</span></span>
          </label>
        </div>
      </div>
      <button type="submit" disabled={pending} className="h-13 rounded-xl bg-brand text-[16px] font-extrabold text-ink uppercase hover:bg-brand-strong disabled:opacity-60">
        {pending ? "Enviando sua inscrição…" : "Enviar candidatura"}
      </button>
      <p className="text-center text-[12.5px] text-muted">Campos com * são obrigatórios.</p>
    </form>
  );
}
