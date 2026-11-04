"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/errors";
import {
  cancelInterview, evaluateInterview, rescheduleInterview, scheduleInterview, searchProcessesForInterview, setInterviewOutcome,
  type EvaluationInput, type SlotInput,
} from "@/server/modules/interviews/service";
import { formValues, nextSubmission, str, type FormState, type FormValues } from "@/lib/form";

const slot = (v: FormValues): SlotInput => ({
  date: str(v, "date"), time: str(v, "time"), durationMinutes: str(v, "durationMinutes") || "30", mode: str(v, "mode") as SlotInput["mode"],
  interviewerId: str(v, "interviewerId"), meetingUrl: str(v, "meetingUrl"), location: str(v, "location"), storeId: str(v, "storeId"), notes: str(v, "notes"),
});

export async function scheduleAction(prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  let id: string;
  try {
    const { ip } = await clientInfo();
    id = (await scheduleInterview(await requireActor(), str(values, "processId"), { ...slot(values), moveStage: str(values, "moveStage") }, ip)).id;
  } catch (e) {
    return { ...toActionError(e), values, submission: nextSubmission(prev) };
  }
  redirect(`/entrevistas/${id}?agendada=1`);
}

export async function rescheduleAction(interviewId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  let id: string;
  try {
    const { ip } = await clientInfo();
    id = (await rescheduleInterview(await requireActor(), interviewId, { ...slot(values), reason: str(values, "reason") }, ip)).id;
  } catch (e) {
    return { ...toActionError(e), values, submission: nextSubmission(prev) };
  }
  redirect(`/entrevistas/${id}?reagendada=1`);
}

export async function cancelAction(interviewId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  try {
    const { ip } = await clientInfo();
    await cancelInterview(await requireActor(), interviewId, str(values, "reason"), ip);
    refresh();
    return { ok: true, message: "Entrevista cancelada.", submission: nextSubmission(prev) };
  } catch (e) {
    return { ...toActionError(e), values, submission: nextSubmission(prev) };
  }
}

export async function outcomeAction(interviewId: string, outcome: "COMPLETED" | "NO_SHOW"): Promise<ActionResult> {
  try {
    const { ip } = await clientInfo();
    await setInterviewOutcome(await requireActor(), interviewId, outcome, ip);
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function evaluateAction(interviewId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  try {
    const { ip } = await clientInfo();
    const input: EvaluationInput = {
      communication: str(values, "communication"), experience: str(values, "experience"), attitude: str(values, "attitude"), availability: str(values, "availability"),
      overall: str(values, "overall"), recommendation: str(values, "recommendation") as EvaluationInput["recommendation"], comments: str(values, "comments"),
    };
    await evaluateInterview(await requireActor(), interviewId, input, ip);
    refresh();
    return { ok: true, message: "Avaliação registrada.", submission: nextSubmission(prev) };
  } catch (e) {
    return { ...toActionError(e), values, submission: nextSubmission(prev) };
  }
}

export async function searchProcessesAction(q: string) {
  return searchProcessesForInterview(await requireActor(), q);
}
