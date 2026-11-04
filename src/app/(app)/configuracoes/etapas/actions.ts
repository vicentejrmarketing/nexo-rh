"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/current-user";
import { toActionError } from "@/server/errors";
import { updateStage } from "@/server/modules/pipeline/service";
import { formValues, nextSubmission, str, type FormState } from "@/lib/form";

export async function updateStageAction(id: string, prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  try {
    await updateStage(await requireActor(), id, { name: str(values, "name"), stalledDays: str(values, "stalledDays") });
    refresh();
    return { ok: true, message: "Salvo.", submission: nextSubmission(prev) };
  } catch (e) {
    return { ...toActionError(e), values, submission: nextSubmission(prev) };
  }
}
