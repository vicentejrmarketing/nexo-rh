"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/errors";
import { createUser, deleteUser, resetUserPassword, setRolePermission, updateUser } from "@/server/modules/users/service";
import type { PermissionKey, RoleKey } from "@/server/authz/catalog";

function readUserForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    roleKey: String(formData.get("roleKey") ?? "") as RoleKey,
    storeIds: formData.getAll("storeIds").map(String),
    status: String(formData.get("status") ?? "ACTIVE") as "ACTIVE" | "INACTIVE",
  };
}

export type CreatedUser = { id: string; name: string; email: string; temporaryPassword: string };
export type UserFormValues = ReturnType<typeof readUserForm>;
/** Em caso de erro, devolve o que foi digitado para o formulário não perder os dados. */
export type UserFormState<T = undefined> = ActionResult<T> & { values?: UserFormValues; submission?: number };

export async function createUserAction(prev: UserFormState<CreatedUser>, formData: FormData): Promise<UserFormState<CreatedUser>> {
  const f = readUserForm(formData);
  const submission = (prev.submission ?? 0) + 1;
  try {
    const actor = await requireActor();
    const { ip } = await clientInfo();
    const { user, temporaryPassword } = await createUser(actor, f, ip);
    return { ok: true, data: { ...user, temporaryPassword }, submission };
  } catch (e) {
    return { ...toActionError(e), values: f, submission };
  }
}

export async function updateUserAction(userId: string, prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const f = readUserForm(formData);
  const submission = (prev.submission ?? 0) + 1;
  try {
    const actor = await requireActor();
    const { ip } = await clientInfo();
    await updateUser(actor, userId, f, ip);
    refresh();
    return { ok: true, message: "Alterações salvas.", values: f, submission };
  } catch (e) {
    return { ...toActionError(e), values: f, submission };
  }
}

export async function resetPasswordAction(userId: string, _prev: ActionResult<{ temporaryPassword: string }>): Promise<ActionResult<{ temporaryPassword: string }>> {
  try {
    const actor = await requireActor();
    const { ip } = await clientInfo();
    const { temporaryPassword } = await resetUserPassword(actor, userId, ip);
    return { ok: true, data: { temporaryPassword } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteUserAction(userId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    if (formData.get("confirm") !== "EXCLUIR") {
      return { ok: false, code: "VALIDATION", message: "Digite EXCLUIR para confirmar." };
    }
    const actor = await requireActor();
    const { ip } = await clientInfo();
    await deleteUser(actor, userId, ip);
  } catch (e) {
    return toActionError(e);
  }
  redirect("/configuracoes/usuarios?excluido=1");
}

export async function togglePermissionAction(roleKey: RoleKey, permissionKey: PermissionKey, enabled: boolean): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const { ip } = await clientInfo();
    await setRolePermission(actor, roleKey, permissionKey, enabled, ip);
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
