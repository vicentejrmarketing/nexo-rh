"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Alert, Button, Card, Field, Input, Select, buttonClass } from "@/components/ui";
import { createUserAction, updateUserAction, type CreatedUser, type UserFormState, type UserFormValues } from "./actions";

type Role = { key: string; name: string; description: string | null; allStores: boolean };
type StoreOpt = { id: string; name: string; city: string; state: string };
type Existing = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roleKey: string;
  status: "ACTIVE" | "INACTIVE";
  storeIds: string[];
  isSelf: boolean;
};

export function CopyablePassword({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex items-center gap-2">
      <code className="rounded-lg border border-ink/15 bg-white px-3 py-2 font-mono text-base tracking-wider text-ink">{value}</code>
      <button
        type="button"
        className={buttonClass("secondary", "sm")}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? "Copiada" : "Copiar"}
      </button>
    </div>
  );
}

function StoresPicker({ stores, selected, errors }: { stores: StoreOpt[]; selected: string[]; errors?: string[] }) {
  if (stores.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surface px-4 py-3 text-[13px] text-muted">
        Nenhuma loja cadastrada ainda. O cadastro de lojas chega na Etapa 2; depois disso, volte aqui para vincular o usuário.
      </div>
    );
  }
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium text-ink">Lojas autorizadas</legend>
      <div className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
        {stores.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface">
            <input type="checkbox" name="storeIds" value={s.id} defaultChecked={selected.includes(s.id)} className="h-4 w-4 accent-[#111216]" />
            <span>
              {s.name} <span className="text-muted">· {s.city}/{s.state}</span>
            </span>
          </label>
        ))}
      </div>
      {errors?.length ? <p className="mt-1 text-[12.5px] text-danger">{errors.join(" ")}</p> : null}
    </fieldset>
  );
}

function FormFields({
  roles, stores, existing, errors, values,
}: { roles: Role[]; stores: StoreOpt[]; existing?: Existing; errors: Record<string, string[]>; values?: UserFormValues }) {
  const v = {
    name: values?.name ?? existing?.name ?? "",
    email: values?.email ?? existing?.email ?? "",
    phone: values?.phone ?? existing?.phone ?? "",
    roleKey: values?.roleKey ?? existing?.roleKey ?? "RECRUITER",
    status: values?.status ?? existing?.status ?? "ACTIVE",
    storeIds: values?.storeIds ?? existing?.storeIds ?? [],
  };
  const [roleKey, setRoleKey] = useState(v.roleKey);
  const role = roles.find((r) => r.key === roleKey);
  return (
    <div className="grid gap-5 p-5 sm:grid-cols-2">
      <Field label="Nome completo" htmlFor="name" errors={errors.name}>
        <Input id="name" name="name" defaultValue={v.name} required maxLength={120} invalid={!!errors.name} />
      </Field>
      <Field label="E-mail de acesso" htmlFor="email" errors={errors.email} hint={existing ? "O e-mail não pode ser alterado." : undefined}>
        <Input id="email" name="email" type="email" defaultValue={v.email} readOnly={!!existing} required={!existing} invalid={!!errors.email} className={existing ? "bg-surface text-muted" : undefined} />
      </Field>
      <Field label="Telefone (opcional)" htmlFor="phone" errors={errors.phone}>
        <Input id="phone" name="phone" type="tel" defaultValue={v.phone} maxLength={30} placeholder="(11) 99999-0000" />
      </Field>
      <Field label="Perfil" htmlFor="roleKey" errors={errors.roleKey} hint={role?.description ?? undefined}>
        <Select id="roleKey" name="roleKey" defaultValue={v.roleKey} onChange={(e) => setRoleKey(e.target.value)} disabled={existing?.isSelf && existing.roleKey === "ADMIN"}>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </Select>
        {existing?.isSelf && existing.roleKey === "ADMIN" && <input type="hidden" name="roleKey" value="ADMIN" />}
      </Field>
      {existing && (
        <Field label="Situação" htmlFor="status" hint={existing.isSelf ? "Você não pode desativar o próprio usuário." : "Usuário inativo não consegue entrar."}>
          <Select id="status" name="status" defaultValue={v.status} disabled={existing.isSelf}>
            <option value="ACTIVE">Ativo</option>
            <option value="INACTIVE">Inativo</option>
          </Select>
          {existing.isSelf && <input type="hidden" name="status" value={existing.status} />}
        </Field>
      )}
      <div className="sm:col-span-2">
        {role?.allStores ? (
          <div className="rounded-lg border border-brand/50 bg-brand-soft px-4 py-3 text-[13px] text-ink">
            O perfil {role.name} acessa todas as lojas automaticamente.
          </div>
        ) : (
          <StoresPicker stores={stores} selected={v.storeIds} errors={errors.storeIds} />
        )}
      </div>
    </div>
  );
}

const initialCreate: UserFormState<CreatedUser> = { ok: true };

export function CreateUserForm({ roles, stores }: { roles: Role[]; stores: StoreOpt[] }) {
  const [state, action, pending] = useActionState(createUserAction, initialCreate);
  const errors = !state.ok ? state.fieldErrors ?? {} : {};

  if (state.ok && state.data) {
    return (
      <Card className="p-6">
        <Alert tone="success" title="Usuário criado">
          {state.data.name} ({state.data.email}) já pode entrar com a senha temporária abaixo. Ela aparece só esta vez; envie por um canal seguro.
        </Alert>
        <CopyablePassword value={state.data.temporaryPassword} />
        <p className="mt-3 text-[13px] text-muted">No primeiro acesso, o sistema vai pedir a criação de uma senha própria.</p>
        <div className="mt-6 flex gap-2">
          <Link href="/configuracoes/usuarios" className={buttonClass("primary")}>Voltar para usuários</Link>
          <Link href={`/configuracoes/usuarios/${state.data.id}`} className={buttonClass("secondary")}>Ver usuário</Link>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form action={action} noValidate>
        {!state.ok && (
          <div className="px-5 pt-5">
            <Alert>{state.message}</Alert>
          </div>
        )}
        {/* key: remonta os campos com o que foi digitado após cada envio */}
        <FormFields key={state.submission ?? 0} roles={roles} stores={stores} errors={errors} values={state.values} />
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <Link href="/configuracoes/usuarios" className={buttonClass("secondary")}>Cancelar</Link>
          <Button type="submit" disabled={pending}>{pending ? "Criando…" : "Criar usuário"}</Button>
        </div>
      </form>
    </Card>
  );
}

const initialUpdate: UserFormState = { ok: true };

export function EditUserForm({ roles, stores, existing }: { roles: Role[]; stores: StoreOpt[]; existing: Existing }) {
  const [state, action, pending] = useActionState(updateUserAction.bind(null, existing.id), initialUpdate);
  const errors = !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <Card>
      <form action={action} noValidate>
        {(state.message || !state.ok) && (
          <div className="px-5 pt-5">
            {state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert>{state.message}</Alert>}
          </div>
        )}
        <FormFields key={state.submission ?? 0} roles={roles} stores={stores} existing={existing} errors={errors} values={state.values} />
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar alterações"}</Button>
        </div>
      </form>
    </Card>
  );
}
