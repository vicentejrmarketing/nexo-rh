"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/errors";
import { finishReview, generateLink, reopenAdmission, reviewFile } from "@/server/modules/admission/service";

export async function generateLinkAction(processId: string): Promise<ActionResult<{ path: string }>> {
  try {
    const { ip } = await clientInfo();
    const r = await generateLink(await requireActor(), processId, ip);
    refresh();
    return { ok: true, data: r };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reviewFileAction(fileId: string, decision: "APPROVED" | "REJECTED", reason: string | null): Promise<ActionResult> {
  try {
    const { ip } = await clientInfo();
    await reviewFile(await requireActor(), fileId, decision, reason, ip);
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function finishReviewAction(processId: string, note: string | null): Promise<ActionResult<{ status: "COMPLETED" | "CHANGES_REQUESTED"; path: string | null }>> {
  try {
    const { ip } = await clientInfo();
    const r = await finishReview(await requireActor(), processId, note, ip);
    refresh();
    return { ok: true, data: r };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reopenAction(processId: string): Promise<ActionResult> {
  try {
    const { ip } = await clientInfo();
    await reopenAdmission(await requireActor(), processId, ip);
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
