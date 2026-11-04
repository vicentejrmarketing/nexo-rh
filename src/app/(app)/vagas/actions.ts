"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { JobStatus } from "@/generated/prisma/client";
import { requireActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/errors";
import { createJob, deleteJob, duplicateJob, setJobStatus, updateJob, type JobInput } from "@/server/modules/jobs/service";
import { linkToJob, searchCandidates } from "@/server/modules/candidates/service";
import { formValues, nextSubmission, str, type FormState, type FormValues } from "@/lib/form";

function jobInput(v: FormValues): JobInput {
  return {
    title: str(v, "title"), description: str(v, "description"), requirements: str(v, "requirements"),
    salaryMin: str(v, "salaryMin"), salaryMax: str(v, "salaryMax"), salaryText: str(v, "salaryText"), benefits: str(v, "benefits"),
    openings: str(v, "openings") || "1", storeId: str(v, "storeId"), positionId: str(v, "positionId"), city: str(v, "city"),
    recruiterId: str(v, "recruiterId"), priority: (str(v, "priority") || "MEDIUM") as JobInput["priority"],
    expectedCloseAt: str(v, "expectedCloseAt"), publishedOnline: str(v, "publishedOnline"),
    status: (str(v, "status") || undefined) as JobInput["status"],
  };
}

export async function saveJobAction(id: string | null, prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  let jobId: string;
  try {
    const actor = await requireActor();
    const { ip } = await clientInfo();
    const job = id ? await updateJob(actor, id, jobInput(values), ip) : await createJob(actor, jobInput(values), ip);
    jobId = job.id;
  } catch (e) {
    return { ...toActionError(e), values, submission: nextSubmission(prev) };
  }
  redirect(`/vagas/${jobId}?salvo=1`);
}

export async function jobStatusAction(id: string, status: JobStatus): Promise<ActionResult> {
  try {
    const { ip } = await clientInfo();
    await setJobStatus(await requireActor(), id, status, ip);
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function duplicateJobAction(id: string): Promise<ActionResult> {
  let newId: string;
  try {
    const { ip } = await clientInfo();
    newId = (await duplicateJob(await requireActor(), id, ip)).id;
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/vagas/${newId}/editar?duplicada=1`);
}

export async function deleteJobAction(id: string): Promise<ActionResult> {
  try {
    const { ip } = await clientInfo();
    await deleteJob(await requireActor(), id, ip);
  } catch (e) {
    return toActionError(e);
  }
  redirect("/vagas?excluida=1");
}

export type LinkCandidateHit = { id: string; fullName: string; detail: string; alreadyLinked: boolean };

/** Busca rápida de candidatos para vincular à vaga (nome, telefone ou e-mail). */
export async function findCandidatesForJobAction(jobId: string, q: string): Promise<LinkCandidateHit[]> {
  const actor = await requireActor();
  if (q.trim().length < 2) return [];
  const { items } = await searchCandidates(actor, { q });
  return items.slice(0, 8).map((c) => ({
    id: c.id,
    fullName: c.fullName,
    detail: [c.city, c.desiredPosition?.name, c.processes.length ? `${c.processes.length} processo(s)` : null].filter(Boolean).join(" · "),
    alreadyLinked: c.processes.some((p) => p.job.id === jobId),
  }));
}

export async function linkCandidateAction(jobId: string, candidateId: string): Promise<ActionResult> {
  try {
    const { ip } = await clientInfo();
    await linkToJob(await requireActor(), candidateId, jobId, ip);
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
