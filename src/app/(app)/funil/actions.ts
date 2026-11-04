"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/errors";
import { moveProcess } from "@/server/modules/pipeline/service";

export async function moveProcessAction(processId: string, toStageKey: string, note: string): Promise<ActionResult> {
  try {
    const { ip } = await clientInfo();
    await moveProcess(await requireActor(), processId, toStageKey, note, ip);
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
