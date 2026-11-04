"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/current-user";
import { toActionError, type ActionResult } from "@/server/errors";
import { deletePosition, savePosition, setPositionActive } from "@/server/modules/settings/service";
import { formValues, nextSubmission, str, type FormState } from "@/lib/form";

export async function savePositionAction(id: string | null, prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  try {
    await savePosition(await requireActor(), id, { name: str(values, "name"), description: str(values, "description"), area: str(values, "area") });
    refresh();
    return { ok: true, message: id ? "Cargo atualizado." : "Cargo criado.", submission: nextSubmission(prev) };
  } catch (e) {
    return { ...toActionError(e), values, submission: nextSubmission(prev) };
  }
}

export async function togglePositionAction(id: string, active: boolean): Promise<ActionResult> {
  try {
    await setPositionActive(await requireActor(), id, active);
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deletePositionAction(id: string): Promise<ActionResult> {
  try {
    await deletePosition(await requireActor(), id);
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
