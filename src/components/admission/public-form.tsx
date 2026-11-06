"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Camera, CheckCircle, FilePdf, Image as ImageIcon, Plus, Trash, UploadSimple, WarningCircle } from "@phosphor-icons/react";
import { Alert, Field, Input, cn } from "@/components/ui";
import { maskCpf } from "@/lib/cpf";
import { pick, type FormState } from "@/lib/form";
import { removeFileAction, saveAction, uploadAction, verifyAction, type UploadedFile } from "@/app/admissao/actions";

// ───────── Confirmação do CPF ─────────

export function IdentityGate({ token }: { token: string }) {
  const [state, action, pending] = useActionState(verifyAction.bind(null, token), { ok: true } as FormState);
  const e = !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={action} noValidate className="mt-5 flex flex-col gap-4">
      {!state.ok && !state.fieldErrors && <Alert>{state.message}</Alert>}
      <Field label="Seu CPF" htmlFor="cpf" errors={e.cpf}>
        <Input key={state.submission ?? 0} id="cpf" name="cpf" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" maxLength={14}
          defaultValue={pick(state, "cpf")} onInput={maskCpf} invalid={!!e.cpf} className="h-12 text-[17px]" autoFocus />
      </Field>
      <button type="submit" disabled={pending} className="h-12 rounded-xl bg-brand text-[16px] font-extrabold text-ink uppercase hover:bg-brand-strong disabled:opacity-60">
        {pending ? "Conferindo…" : "Continuar"}
      </button>
    </form>
  );
}

// ───────── Envio de arquivos ─────────

const MAX_BYTES = 4 * 1024 * 1024;

/** Fotos grandes do celular são reduzidas antes do envio (mantém a leitura do documento). */
async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

type Doc = { kind: string; label: string; hint: string; required: boolean; imageOnly?: boolean };

function DocUpload({ token, doc, files, setFiles, error }: { token: string; doc: Doc; files: UploadedFile[]; setFiles: (fn: (f: UploadedFile[]) => UploadedFile[]) => void; error?: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const mine = files.filter((f) => f.kind === doc.kind);
  const ok = mine.some((f) => f.status !== "REJECTED");
  const rejected = mine.filter((f) => f.status === "REJECTED");

  async function onPick(list: FileList | null) {
    if (!list?.length) return;
    setErr(null);
    for (const original of Array.from(list)) {
      setBusy(`Enviando ${original.name}…`);
      const file = await shrinkImage(original);
      if (file.size > MAX_BYTES) {
        setErr(`"${original.name}" passa de 4 MB. Tire uma foto com menos resolução ou envie um PDF menor.`);
        continue;
      }
      const fd = new FormData();
      fd.set("file", file);
      const r = await uploadAction(token, doc.kind, fd);
      if (!r.ok) setErr(r.fieldErrors?.file?.[0] ?? r.message);
      else if (r.data) setFiles((f) => [...f, r.data!]);
    }
    setBusy(null);
    if (input.current) input.current.value = "";
  }

  function remove(id: string) {
    start(async () => {
      const r = await removeFileAction(token, id);
      if (!r.ok) setErr(r.message);
      else setFiles((f) => f.filter((x) => x.id !== id));
    });
  }

  return (
    <li id={`doc_${doc.kind}`} className={cn("flex flex-col gap-2.5 p-4", (error || err) && "bg-danger-soft/30")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold">{doc.label}{doc.required ? " *" : ""}</p>
          <p className="text-[13px] text-muted">{doc.hint}</p>
        </div>
        {ok && <CheckCircle size={22} weight="fill" className="shrink-0 text-success" aria-label="Enviado" />}
      </div>
      {rejected.map((f) => (
        <p key={f.id} className="flex items-start gap-1.5 rounded-lg bg-danger-soft/60 p-2.5 text-[13px] text-danger">
          <WarningCircle size={17} weight="fill" className="mt-px shrink-0" /> O RH pediu para enviar de novo{f.rejectionReason ? `: ${f.rejectionReason}` : "."}
        </p>
      ))}
      {mine.filter((f) => f.status !== "REJECTED").map((f) => (
        <div key={f.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px]">
          {f.fileName.endsWith(".pdf") ? <FilePdf size={17} className="shrink-0 text-danger" /> : <ImageIcon size={17} className="shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
          {f.status === "APPROVED" ? (
            <span className="text-[12px] font-semibold text-success">Aprovado</span>
          ) : (
            <button type="button" onClick={() => remove(f.id)} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-danger" aria-label={`Remover ${f.fileName}`}>
              <Trash size={15} /> Remover
            </button>
          )}
        </div>
      ))}
      <label className={cn("flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed text-[14px] font-semibold", busy ? "border-line text-muted" : "border-ink/25 hover:border-ink")}>
        {doc.imageOnly ? <Camera size={18} weight="bold" /> : <UploadSimple size={18} weight="bold" />}
        {busy ?? (mine.length ? "Adicionar outro arquivo" : doc.imageOnly ? "Tirar ou escolher foto" : "Enviar foto ou PDF")}
        <input ref={input} type="file" className="sr-only" disabled={!!busy} multiple={!doc.imageOnly}
          accept={doc.imageOnly ? "image/*" : "image/*,application/pdf"} {...(doc.imageOnly ? { capture: "user" as const } : {})}
          onChange={(e) => void onPick(e.target.files)} />
      </label>
      {(err || error) && <p className="text-[13px] text-danger" role="alert">{err ?? error}</p>}
    </li>
  );
}

// ───────── Formulário ─────────

type Saved = Record<
  "email" | "race" | "uniformSize" | "education" | "pisNis" | "maritalStatus" | "spouseName" | "spouseCpf" | "spouseBirthDate" | "needsTransport" | "busesPerDay" | "transportDailyCost" | "bankAccount" | "bankBranch" | "pixKey",
  string
>;
type Child = { name: string; cpf: string; birthDate: string };

function Section({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/[0.05] bg-white p-5 shadow-[0_2px_14px_rgba(17,18,22,0.05)] sm:p-6">
      <h2 className="text-[18px] font-extrabold">{title}</h2>
      {hint && <p className="mt-0.5 text-[13.5px] text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const fmtCpf = (v: string) => (/^\d{11}$/.test(v) ? v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : v);

export function AdmissionForm({
  token, status, reviewNote, expiresAt, docs, files: initialFiles, saved, savedChildren,
}: {
  token: string; status: string; reviewNote: string | null; expiresAt: string; docs: Doc[]; files: UploadedFile[]; saved: Saved; savedChildren: Child[];
}) {
  const [files, setFiles] = useState(initialFiles);
  const [state, action, pending] = useActionState(saveAction.bind(null, token), { ok: true } as FormState<{ submitted: boolean }>);
  const e = !state.ok ? state.fieldErrors ?? {} : {};
  const v = (k: keyof Saved) => pick(state, k, saved[k]);
  // Filhos: linhas na tela; ao voltar com erro, recria a partir do que foi digitado.
  const initialRows = state.values
    ? Object.keys(state.values).filter((k) => k.startsWith("child_name_")).map((k) => Number(k.slice(11)))
    : savedChildren.map((_, i) => i);
  const [rows, setRows] = useState<number[]>(initialRows);
  const [transport, setTransport] = useState(v("needsTransport"));
  const until = new Date(expiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const missingDocs = docs.filter((d) => e[`doc_${d.kind}`]).length;

  return (
    <div className="flex flex-col gap-5">
      {status === "CHANGES_REQUESTED" && (
        <Alert tone="warning" title="O RH pediu alguns ajustes">
          {reviewNote ? <span className="whitespace-pre-line">{reviewNote}</span> : "Veja abaixo os documentos marcados em vermelho, envie de novo e clique em Enviar documentos."}
        </Alert>
      )}
      <p className="text-[13.5px] text-muted">Preencha com calma: você pode salvar e continuar depois pelo mesmo link, até {until}. Campos com * são obrigatórios.</p>

      <Section title="1. Documentos" hint="Fotos nítidas, com boa luz e o documento inteiro aparecendo. Pode enviar mais de um arquivo (frente e verso).">
        <ul className="-mx-1 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {docs.map((d) => <DocUpload key={d.kind} token={token} doc={d} files={files} setFiles={setFiles} error={e[`doc_${d.kind}`]?.[0]} />)}
        </ul>
      </Section>

      <form action={action} noValidate className="flex flex-col gap-5">
        <div key={state.submission ?? 0} className="flex flex-col gap-5">
          <Section title="2. Seus dados">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="E-mail *" htmlFor="email" errors={e.email} className="sm:col-span-2">
                <Input id="email" name="email" type="email" autoComplete="email" defaultValue={v("email")} invalid={!!e.email} />
              </Field>
              <Field label="Raça/cor *" htmlFor="race" errors={e.race}>
                <Input id="race" name="race" list="race-options" defaultValue={v("race")} maxLength={60} invalid={!!e.race} />
              </Field>
              <Field label="Tamanho do uniforme *" htmlFor="uniformSize" errors={e.uniformSize} hint="Ex.: P, M, G, GG ou 40, 42">
                <Input id="uniformSize" name="uniformSize" defaultValue={v("uniformSize")} maxLength={30} invalid={!!e.uniformSize} />
              </Field>
              <Field label="Grau de escolaridade *" htmlFor="education" errors={e.education}>
                <Input id="education" name="education" list="education-options" defaultValue={v("education")} maxLength={120} invalid={!!e.education} />
              </Field>
              <Field label="PIS/NIS *" htmlFor="pisNis" errors={e.pisNis} hint="11 números. Aparece na carteira de trabalho digital.">
                <Input id="pisNis" name="pisNis" inputMode="numeric" defaultValue={v("pisNis")} maxLength={14} invalid={!!e.pisNis} />
              </Field>
              <Field label="Estado civil *" htmlFor="maritalStatus" errors={e.maritalStatus}>
                <Input id="maritalStatus" name="maritalStatus" list="marital-options" defaultValue={v("maritalStatus")} maxLength={40} invalid={!!e.maritalStatus} />
              </Field>
            </div>
            <datalist id="race-options">{["Branca", "Preta", "Parda", "Amarela", "Indígena"].map((o) => <option key={o} value={o} />)}</datalist>
            <datalist id="education-options">
              {["Ensino fundamental incompleto", "Ensino fundamental completo", "Ensino médio incompleto", "Ensino médio completo", "Ensino superior incompleto", "Ensino superior completo", "Pós-graduação"].map((o) => <option key={o} value={o} />)}
            </datalist>
            <datalist id="marital-options">{["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)"].map((o) => <option key={o} value={o} />)}</datalist>
          </Section>

          <Section title="3. Família" hint="Preencha só se tiver filhos ou for casado(a).">
            <p className="mb-2 text-[14px] font-semibold">Filhos</p>
            <div className="flex flex-col gap-3">
              {rows.map((i, idx) => {
                const c = savedChildren[i];
                return (
                  <div key={i} className="rounded-xl border border-line p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-muted">Filho(a) {idx + 1}</span>
                      <button type="button" onClick={() => setRows((r) => r.filter((x) => x !== i))} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-danger"><Trash size={14} /> Remover</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                      <Field label="Nome" htmlFor={`child_name_${i}`}><Input id={`child_name_${i}`} name={`child_name_${i}`} defaultValue={pick(state, `child_name_${i}`, c?.name)} maxLength={120} /></Field>
                      <Field label="CPF" htmlFor={`child_cpf_${i}`}><Input id={`child_cpf_${i}`} name={`child_cpf_${i}`} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" onInput={maskCpf} defaultValue={pick(state, `child_cpf_${i}`, c ? fmtCpf(c.cpf) : "")} /></Field>
                      <Field label="Data de nascimento" htmlFor={`child_birth_${i}`}><Input id={`child_birth_${i}`} name={`child_birth_${i}`} type="date" defaultValue={pick(state, `child_birth_${i}`, c?.birthDate)} /></Field>
                    </div>
                    {e[`child_${i}`] && <p className="mt-2 text-[12.5px] text-danger" role="alert">{e[`child_${i}`][0]}</p>}
                  </div>
                );
              })}
              {rows.length < 15 && (
                <button type="button" onClick={() => setRows((r) => [...r, (r.length ? Math.max(...r) : -1) + 1 + savedChildren.length])}
                  className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg border border-line px-4 text-[14px] font-semibold hover:border-ink">
                  <Plus size={16} weight="bold" /> Adicionar filho(a)
                </button>
              )}
            </div>
            <p className="mt-6 mb-2 text-[14px] font-semibold">Cônjuge (se for casado/a)</p>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
              <Field label="Nome" htmlFor="spouseName" errors={e.spouseName}><Input id="spouseName" name="spouseName" defaultValue={v("spouseName")} maxLength={120} invalid={!!e.spouseName} /></Field>
              <Field label="CPF" htmlFor="spouseCpf" errors={e.spouseCpf}><Input id="spouseCpf" name="spouseCpf" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" onInput={maskCpf} defaultValue={fmtCpf(v("spouseCpf"))} invalid={!!e.spouseCpf} /></Field>
              <Field label="Data de nascimento" htmlFor="spouseBirthDate" errors={e.spouseBirthDate}><Input id="spouseBirthDate" name="spouseBirthDate" type="date" defaultValue={v("spouseBirthDate")} invalid={!!e.spouseBirthDate} /></Field>
            </div>
          </Section>

          <Section title="4. Vale-transporte">
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-[13px] font-medium">Vai precisar de vale-transporte? *</legend>
              <div className="flex gap-2">
                {[["sim", "Sim"], ["nao", "Não"]].map(([val, l]) => (
                  <label key={val} className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-white text-[14px] font-medium has-[:checked]:border-ink has-[:checked]:bg-brand-soft">
                    <input type="radio" name="needsTransport" value={val} defaultChecked={v("needsTransport") === val} onChange={() => setTransport(val)} className="accent-[#111216]" /> {l}
                  </label>
                ))}
              </div>
              {e.needsTransport && <p className="text-[12.5px] text-danger" role="alert">{e.needsTransport[0]}</p>}
            </fieldset>
            {transport === "sim" && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Quantos ônibus por dia? *" htmlFor="busesPerDay" errors={e.busesPerDay} hint="Somando ida e volta.">
                  <Input id="busesPerDay" name="busesPerDay" type="number" inputMode="numeric" min={1} max={12} defaultValue={v("busesPerDay")} invalid={!!e.busesPerDay} />
                </Field>
                <Field label="Valor total gasto por dia (R$) *" htmlFor="transportDailyCost" errors={e.transportDailyCost}>
                  <Input id="transportDailyCost" name="transportDailyCost" inputMode="decimal" placeholder="11,00" defaultValue={v("transportDailyCost")} invalid={!!e.transportDailyCost} />
                </Field>
              </div>
            )}
          </Section>

          <Section title="5. Conta Santander" hint="Abra uma conta no Santander para receber o salário todo mês e informe os dados abaixo.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Agência *" htmlFor="bankBranch" errors={e.bankBranch}><Input id="bankBranch" name="bankBranch" inputMode="numeric" maxLength={10} defaultValue={v("bankBranch")} invalid={!!e.bankBranch} /></Field>
              <Field label="Conta *" htmlFor="bankAccount" errors={e.bankAccount}><Input id="bankAccount" name="bankAccount" maxLength={30} placeholder="00000000-0" defaultValue={v("bankAccount")} invalid={!!e.bankAccount} /></Field>
              <Field label="Chave Pix *" htmlFor="pixKey" errors={e.pixKey}><Input id="pixKey" name="pixKey" maxLength={120} defaultValue={v("pixKey")} invalid={!!e.pixKey} /></Field>
            </div>
          </Section>

          <label className="flex items-start gap-3 rounded-2xl bg-white p-5 text-[14px] shadow-[0_2px_14px_rgba(17,18,22,0.05)]">
            <input type="checkbox" name="privacy" defaultChecked={state.values?.privacy === "on"} className="mt-0.5 h-5 w-5 shrink-0 accent-[#F5B900]" />
            <span>
              Autorizo o uso destes dados e documentos para a minha admissão, registro e folha de pagamento. Eles ficam guardados com acesso restrito à equipe de RH. *
              {e.privacy && <span className="mt-1 block text-[12.5px] text-danger" role="alert">{e.privacy[0]}</span>}
            </span>
          </label>
        </div>

        {!state.ok && <Alert>{missingDocs ? `Falta enviar ${missingDocs} documento(s) obrigatório(s). ` : ""}{state.fieldErrors ? "Confira os campos marcados em vermelho." : state.message}</Alert>}
        {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <button type="submit" name="_intent" value="submit" disabled={pending} className="h-13 flex-1 rounded-xl bg-brand text-[16px] font-extrabold text-ink uppercase hover:bg-brand-strong disabled:opacity-60">
            {pending ? "Enviando…" : "Enviar documentos"}
          </button>
          <button type="submit" name="_intent" value="draft" disabled={pending} className="h-13 rounded-xl border border-ink/20 bg-white px-5 text-[15px] font-semibold hover:border-ink disabled:opacity-60">
            Salvar e continuar depois
          </button>
        </div>
      </form>
    </div>
  );
}
