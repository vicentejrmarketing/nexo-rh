"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Button, Card, Field, Input, Select, buttonClass } from "@/components/ui";
import { pick, type FormState } from "@/lib/form";
import { saveStoreAction } from "./actions";

type Store = { id: string; name: string; city: string; state: string; address: string | null; managerId: string | null; employeeCount: number; status: string };

export function StoreForm({ store, managers, ufs }: { store?: Store; managers: { id: string; name: string }[]; ufs: readonly string[] }) {
  const [state, action, pending] = useActionState(saveStoreAction.bind(null, store?.id ?? null), { ok: true } as FormState);
  const e = !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <Card>
      <form action={action} noValidate>
        {!state.ok && !state.fieldErrors && (
          <div className="px-5 pt-5">
            <Alert>{state.message}</Alert>
          </div>
        )}
        <div key={state.submission ?? 0} className="grid gap-5 p-5 sm:grid-cols-6">
          <Field label="Nome da loja" htmlFor="name" errors={e.name} className="sm:col-span-3">
            <Input id="name" name="name" defaultValue={pick(state, "name", store?.name)} required maxLength={80} autoFocus={!store} invalid={!!e.name} />
          </Field>
          <Field label="Cidade" htmlFor="city" errors={e.city} className="sm:col-span-2">
            <Input id="city" name="city" defaultValue={pick(state, "city", store?.city)} required maxLength={80} invalid={!!e.city} />
          </Field>
          <Field label="Estado" htmlFor="state" errors={e.state} className="sm:col-span-1">
            <Select id="state" name="state" defaultValue={pick(state, "state", store?.state ?? "SC")} invalid={!!e.state}>
              {ufs.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
          <Field label="Endereço (opcional)" htmlFor="address" errors={e.address} className="sm:col-span-6">
            <Input id="address" name="address" defaultValue={pick(state, "address", store?.address)} maxLength={200} placeholder="Rua, número, bairro" />
          </Field>
          <Field label="Responsável" htmlFor="managerId" errors={e.managerId} className="sm:col-span-3" hint="Pessoa da equipe responsável pela loja.">
            <Select id="managerId" name="managerId" defaultValue={pick(state, "managerId", store?.managerId)}>
              <option value="">Sem responsável definido</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="Funcionários" htmlFor="employeeCount" errors={e.employeeCount} className="sm:col-span-1">
            <Input id="employeeCount" name="employeeCount" type="number" min={0} defaultValue={pick(state, "employeeCount", store?.employeeCount ?? 0)} invalid={!!e.employeeCount} />
          </Field>
          <Field label="Situação" htmlFor="status" className="sm:col-span-2">
            <Select id="status" name="status" defaultValue={pick(state, "status", store?.status ?? "ACTIVE")}>
              <option value="ACTIVE">Ativa</option>
              <option value="INACTIVE">Inativa</option>
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <Link href={store ? `/lojas/${store.id}` : "/lojas"} className={buttonClass("secondary")}>Cancelar</Link>
          <Button type="submit" disabled={pending}>{pending ? "Salvando…" : store ? "Salvar alterações" : "Cadastrar loja"}</Button>
        </div>
      </form>
    </Card>
  );
}
