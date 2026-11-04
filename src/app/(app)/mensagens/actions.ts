"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ConversationStatus } from "@/generated/prisma/client";
import { requireActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/errors";
import {
  assignConversation, ensureConversation, linkConversationCandidate, markConversationRead, processRetryQueue, reactivateMessaging, retryMessage,
  sendTemplateMessage, sendTextMessage, setConversationStatus,
} from "@/server/modules/messages/service";
import { searchCandidates } from "@/server/modules/candidates/service";
import { reprocessPendingEvents } from "@/server/whatsapp/webhook";

async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function sendTextAction(conversationId: string, body: string) {
  return run(async () => sendTextMessage(await requireActor(), conversationId, body));
}

export async function sendTemplateAction(conversationId: string, templateId: string, values: Record<string, string>) {
  return run(async () => sendTemplateMessage(await requireActor(), conversationId, templateId, values));
}

export async function retryAction(messageId: string) {
  return run(async () => retryMessage(await requireActor(), messageId));
}
export async function assignAction(conversationId: string, userId: string | null) {
  return run(async () => assignConversation(await requireActor(), conversationId, userId));
}
export async function statusAction(conversationId: string, status: ConversationStatus) {
  return run(async () => setConversationStatus(await requireActor(), conversationId, status));
}
export async function linkCandidateAction(conversationId: string, candidateId: string) {
  return run(async () => linkConversationCandidate(await requireActor(), conversationId, candidateId));
}
export async function reactivateAction(candidateId: string) {
  return run(async () => {
    const { ip } = await clientInfo();
    await reactivateMessaging(await requireActor(), candidateId, ip);
  });
}

/** Chamado pela tela aberta: marca como lida, reenvia a fila e reprocessa eventos pendentes. */
export async function inboxTickAction(conversationId: string | null) {
  const actor = await requireActor();
  if (conversationId) await markConversationRead(actor, conversationId).catch(() => {});
  await Promise.allSettled([processRetryQueue(10), reprocessPendingEvents(10)]);
}

export async function findCandidatesAction(q: string) {
  const actor = await requireActor();
  if (q.trim().length < 2) return [];
  const r = await searchCandidates(actor, { q });
  return r.items.slice(0, 8).map((c) => ({ id: c.id, name: c.fullName, detail: [c.city, c.processes[0]?.job.title].filter(Boolean).join(" · ") }));
}

/** Abre a conversa com o candidato (cria se ainda não existir) e leva para a central. */
export async function openConversationAction(candidateId: string, extra: string = "") {
  let id: string;
  try {
    id = (await ensureConversation(await requireActor(), candidateId)).id;
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/mensagens?c=${id}${extra}`);
}
