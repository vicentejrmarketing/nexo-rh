"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/errors";
import { setJobPublished } from "@/server/modules/jobs/service";
import { resolvePrivacyRequest } from "@/server/modules/portal/admin";

export async function setPublishedAction(jobId: string, published: boolean): Promise<ActionResult> {
  try {
    const { ip } = await clientInfo();
    await setJobPublished(await requireActor(), jobId, published, ip);
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resolvePrivacyAction(id: string, action: "anonymize" | "done" | "reject"): Promise<ActionResult> {
  try {
    const { ip } = await clientInfo();
    await resolvePrivacyRequest(await requireActor(), id, action, ip);
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
