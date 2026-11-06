"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/errors";
import { authorize } from "@/server/authz/authorize";
import { createTest, findCandidatesForTest, getReport, saveJobProfile, saveReview } from "@/server/modules/behavioral/service";
import { runAnalysis } from "@/server/modules/behavioral/ai";
import { COMPETENCIES } from "@/server/modules/behavioral/questionnaire";
import { formValues, nextSubmission, str, type FormState } from "@/lib/form";

export type TestCandidateHit = Awaited<ReturnType<typeof findCandidatesForTest>>[number];

export async function findCandidatesAction(q: string): Promise<TestCandidateHit[]> {
  try {
    return await findCandidatesForTest(await requireActor(), q);
  } catch {
    return [];
  }
}

export async function createTestAction(candidateId: string, candidateJobId: string | null): Promise<ActionResult<{ id: string; path: string; expiresAt: string }>> {
  try {
    const { ip } = await clientInfo();
    const r = await createTest(await requireActor(), candidateId, candidateJobId, ip);
    refresh();
    return { ok: true, data: { id: r.id, path: r.path, expiresAt: r.expiresAt.toISOString() } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function runAnalysisAction(testId: string): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    authorize(actor, "behavioral.view");
    await getReport(actor, testId); // confere acesso ao candidato
    const r = await runAnalysis(testId, { force: true, requestedById: actor.id });
    if (!r) return { ok: false, code: "VALIDATION", message: "A IA não está configurada ou o teste não usa a matriz atual." };
    refresh();
    return r.status === "FAILED" ? { ok: false, code: "INTERNAL", message: r.error ?? "A análise falhou." } : { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveReviewAction(testId: string, note: string, items: Record<string, string>): Promise<ActionResult> {
  try {
    const { ip } = await clientInfo();
    await saveReview(await requireActor(), testId, { note, items }, ip);
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveJobProfileAction(jobId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  try {
    const { ip } = await clientInfo();
    const weights: Record<string, string> = {};
    const essentials: { key: string; min: string }[] = [];
    for (const c of COMPETENCIES) {
      weights[c.key] = str(values, `w_${c.key}`);
      if (str(values, `e_${c.key}`) === "on") essentials.push({ key: c.key, min: str(values, `min_${c.key}`) || "70" });
    }
    await saveJobProfile(await requireActor(), jobId, { template: str(values, "template"), weights, essentials }, ip);
  } catch (e) {
    return { ...toActionError(e), values, submission: nextSubmission(prev) };
  }
  refresh();
  return { ok: true, message: "Pesos salvos. Valem para os próximos testes desta vaga.", values, submission: nextSubmission(prev) };
}
