"use server";

import { headers } from "next/headers";
import { clientInfo } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/errors";
import { startTest, submitTest } from "@/server/modules/behavioral/service";

export async function startTestAction(token: string): Promise<void> {
  await startTest(token).catch(() => {});
}

export async function submitTestAction(token: string, answers: number[]): Promise<ActionResult> {
  try {
    const { ip } = await clientInfo();
    const ua = (await headers()).get("user-agent");
    await submitTest(token, answers, { ip, userAgent: ua });
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
