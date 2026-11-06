"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { runAnalysis } from "@/server/modules/behavioral/ai";
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
    const { testId } = await submitTest(token, answers, { ip, userAgent: ua });
    // A análise da IA roda depois da resposta ao candidato (ele não espera por ela).
    after(() => runAnalysis(testId).then(() => undefined, (e) => console.error("[ia-comportamental]", e)));
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
