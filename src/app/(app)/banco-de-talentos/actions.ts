"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/errors";
import { runRetention } from "@/server/modules/candidates/service";

export async function runRetentionAction(): Promise<ActionResult> {
  try {
    const { ip } = await clientInfo();
    const n = await runRetention(await requireActor(), ip);
    refresh();
    return { ok: true, message: `${n} candidato(s) anonimizado(s).` };
  } catch (e) {
    return toActionError(e);
  }
}
