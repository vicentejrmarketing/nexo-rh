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
  customPermissions: boolean;
  permissions: string[];
};
type Access = { catalog: { key: string; module: string; description: string }[]; roleDefaults: Record<string, string[]>; canManage: boolean; grantable: string[] };

// Ao marcar uma ação, a permissão de ver da mesma parte vem junto (mesma regra do servidor).
const DEPENDS: Record<string, string[]> = {
  "users.manage": ["users.view"], "permissions.manage": ["users.view"], "stores.manage": ["stores.view"],
  "jobs.create": ["jobs.view"], "jobs.update": ["jobs.view"], "jobs.delete": ["jobs.view"],
  "candidates.create": ["candidates.view"], "candidates.update": ["candidates.view"], "candidates.delete": ["candidates.view"], "resumes.view": ["candidates.view"],
  "pipeline.move": ["pipeline.view"], "interviews.manage": ["interviews.view"], "interviews.evaluate": ["interviews.view"],
  "messages.send": ["messages.view"], "templates.manage": ["messages.view"], "talentpool.manage": ["talentpool.view"],
  "reports.export": ["reports.view"], "admission.manage": ["admission.view"],
};
const dependents = (key: string) => Object.entries(DEPENDS).filter(([, deps]) => deps.includes(key)).map(([k]) => k);

function AccessPicker({ access, roleKey, roleName, initialCustom, initialSelected, errors }: {
  access: Access; roleKey: string; roleName: string; initialCustom: boolean; initialSelected: string[] | null; errors?: string[];
}) {
  const [custom, setCustom] = useState(initialCustom);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected ?? access.roleDefaults[roleKey] ?? []));
  const modules = [...new Set(access.catalog.map((p) => p.module))];
  if (roleKey === "ADMIN") {
    return <div className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px]">O perfil <strong>Administrador</strong> tem acesso total ao sistema. Para limitar o acesso, escolha outro perfil.</div>;
  }
  if (!access.canManage) {
    return (
      <div className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px]">
        {initialCustom ? "Este usuário tem acesso personalizado." : `Segue o padrão do perfil ${roleName}.`} Só o Administrador altera os acessos individuais.
        {initialCustom && <input type="hidden" name="access" value="custom" />}
      </div>
    );
  }
  const toggle = (key: string, on: boolean) => {
    const next = new Set(selected);
    if (on) { next.add(key); for (const d of DEPENDS[key] ?? []) next.add(d); }
    else { next.delete(key); for (const d of dependents(key)) next.delete(d); }
    setSelected(next);
  };
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-[13px] font-medium text-ink">O que este usuário pode acessar</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {[[false, "Usar o padrão do perfil", `Tudo o que o perfil ${roleName} permite em Configurações → Permissões.`], [true, "Personalizar", "Escolher parte por parte o que este usuário vê e faz."]].map(([val, label, hint]) => (
          <label key={String(val)} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3 text-[13.5px] has-[:checked]:border-ink has-[:checked]:bg-brand-soft">
            <input type="radio" name="access" value={val ? "custom" : "role"} checked={custom === val}
              onChange={() => { setCustom(val as boolean); if (val && !initialSelected) setSelected(new Set(access.roleDefaults[roleKey] ?? [])); }} className="mt-0.5 accent-[#111216]" />
            <span><span className="font-semibold">{label as string}</span><span className="block text-[12.5px] text-muted">{hint as string}</span></span>
          </label>
        ))}
      </div>
      {custom && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="text-muted">{selected.size} de {access.catalog.length} permissões marcadas.</span>
            <button type="button" className="font-medium underline underline-offset-4" onClick={() => setSelected(new Set(access.roleDefaults[roleKey] ?? []))}>Voltar ao padrão do perfil</button>
            <button type="button" className="font-medium underline underline-offset-4" onClick={() => setSelected(new Set())}>Desmarcar tudo</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {modules.map((m) => (
              <div key={m} className="rounded-lg border border-line p-3">
                <p className="mb-1.5 text-[13px] font-semibold">{m}</p>
                {access.catalog.filter((p) => p.module === m).map((p) => {
                  const allowed = access.grantable.includes(p.key);
                  return (
                    <label key={p.key} className={`flex items-start gap-2 py-1 text-[13px] ${allowed ? "cursor-pointer" : "opacity-50"}`} title={allowed ? undefined : "Você não tem esta permissão para conceder."}>
                      <input type="checkbox" name="permissions" value={p.key} checked={selected.has(p.key)} disabled={!allowed} onChange={(e) => toggle(p.key, e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#111216]" />
                      <span>{p.description}</span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          {selected.size === 0 && <p className="text-[12.5px] text-warning">Sem nenhuma permissão o usuário só consegue entrar e trocar a própria senha.</p>}
        </>
      )}
      {errors?.length ? <p className="text-[12.5px] text-danger">{errors.join(" ")}</p> : null}
    </fieldset>
  );
}

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
  roles, stores, existing, errors, values, access,
}: { roles: Role[]; stores: StoreOpt[]; existing?: Existing; errors: Record<string, string[]>; values?: UserFormValues; access: Access }) {
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
      <div className="sm:col-span-2">
        <AccessPicker key={roleKey} access={access} roleKey={roleKey} roleName={role?.name ?? ""} errors={errors.permissions}
          initialCustom={values ? values.customPermissions : existing?.customPermissions ?? false}
          initialSelected={values?.customPermissions ? values.permissions : existing?.customPermissions && existing.roleKey === roleKey ? existing.permissions : null} />
      </div>
    </div>
  );
}

const initialCreate: UserFormState<CreatedUser> = { ok: true };

export function CreateUserForm({ roles, stores, access }: { roles: Role[]; stores: StoreOpt[]; access: Access }) {
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
        <FormFields key={state.submission ?? 0} roles={roles} stores={stores} errors={errors} values={state.values} access={access} />
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <Link href="/configuracoes/usuarios" className={buttonClass("secondary")}>Cancelar</Link>
          <Button type="submit" disabled={pending}>{pending ? "Criando…" : "Criar usuário"}</Button>
        </div>
      </form>
    </Card>
  );
}

const initialUpdate: UserFormState = { ok: true };

export function EditUserForm({ roles, stores, existing, access }: { roles: Role[]; stores: StoreOpt[]; existing: Existing; access: Access }) {
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
        <FormFields key={state.submission ?? 0} roles={roles} stores={stores} existing={existing} errors={errors} values={state.values} access={access} />
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar alterações"}</Button>
        </div>
      </form>
    </Card>
  );
}
