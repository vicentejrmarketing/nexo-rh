"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/errors";
import {
  addReminder, recordOptOut, removeReminder, requeueDispatch, sendDispatch, setReminderOffset, setRuleEnabled, skipDispatch,
} from "@/server/modules/automations/service";
import { sendManualText } from "@/server/modules/messages/service";
import { saveTemplate } from "@/server/modules/messages/templates";
import { db } from "@/server/db/client";

async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/** Registra o envio e devolve o link do WhatsApp com o texto pronto. */
export async function sendDispatchAction(id: string): Promise<ActionResult<string>> {
  try {
    const r = await sendDispatch(await requireActor(), id);
    refresh();
    return { ok: true, data: r.url };
  } catch (e) {
    return toActionError(e);
  }
}

export async function sendManualAction(conversationId: string, body: string): Promise<ActionResult<string>> {
  try {
    const r = await sendManualText(await requireActor(), conversationId, body);
    refresh();
    return { ok: true, data: r.url };
  } catch (e) {
    return toActionError(e);
  }
}

export async function skipDispatchAction(id: string, reason: string) {
  return run(async () => skipDispatch(await requireActor(), id, reason));
}
export async function requeueDispatchAction(id: string) {
  return run(async () => requeueDispatch(await requireActor(), id));
}
export async function toggleRuleAction(id: string, enabled: boolean) {
  return run(async () => setRuleEnabled(await requireActor(), id, enabled));
}
export async function reminderOffsetAction(id: string, minutes: number) {
  return run(async () => setReminderOffset(await requireActor(), id, minutes));
}
export async function addReminderAction(minutes: number) {
  return run(async () => addReminder(await requireActor(), minutes));
}
export async function removeReminderAction(id: string) {
  return run(async () => removeReminder(await requireActor(), id));
}
export async function saveRuleTextAction(ruleId: string, text: string) {
  return run(async () => {
    const actor = await requireActor();
    const r = await db.automationRule.findUniqueOrThrow({ where: { id: ruleId }, include: { template: true } });
    const t = await saveTemplate(actor, r.templateId, { name: r.name, purpose: "Automação", category: (r.template?.category as "UTILITY") ?? "UTILITY", text });
    if (!r.templateId) await db.automationRule.update({ where: { id: ruleId }, data: { templateId: t.id } });
  });
}
export async function optOutAction(candidateId: string) {
  return run(async () => {
    const { ip } = await clientInfo();
    await recordOptOut(await requireActor(), candidateId, ip);
  });
}
