"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/current-user";
import { toActionError, type ActionResult } from "@/server/errors";
import { createSuggestedTemplates, saveTemplate, setTemplateActive, submitTemplate, syncTemplates } from "@/server/modules/messages/templates";
import { formValues, nextSubmission, str, type FormState } from "@/lib/form";

export async function saveTemplateAction(id: string | null, prev: FormState, fd: FormData): Promise<FormState> {
  const v = formValues(fd);
  try {
    await saveTemplate(await requireActor(), id, { name: str(v, "name"), purpose: str(v, "purpose"), category: str(v, "category") as "UTILITY", text: str(v, "text") });
    refresh();
    return { ok: true, message: id ? "Modelo salvo." : "Modelo criado.", submission: nextSubmission(prev) };
  } catch (e) {
    return { ...toActionError(e), values: v, submission: nextSubmission(prev) };
  }
}

async function run(fn: () => Promise<unknown>, message?: (r: unknown) => string): Promise<ActionResult> {
  try {
    const r = await fn();
    refresh();
    return { ok: true, message: message?.(r) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function suggestedAction() {
  return run(async () => createSuggestedTemplates(await requireActor()), (n) => `${n} modelo(s) criado(s).`);
}
export async function submitAction(id: string) {
  return run(async () => submitTemplate(await requireActor(), id), (a) => (a === "APPROVED" ? "Aprovado pela Meta." : "Enviado: a Meta costuma analisar em minutos ou poucas horas."));
}
export async function syncAction() {
  return run(async () => syncTemplates(await requireActor()), (r) => {
    const x = r as { updated: number; imported: number };
    return `Status atualizado (${x.updated})${x.imported ? `; ${x.imported} modelo(s) aprovado(s) importado(s) da Meta` : ""}.`;
  });
}
export async function toggleAction(id: string, active: boolean) {
  return run(async () => setTemplateActive(await requireActor(), id, active));
}
