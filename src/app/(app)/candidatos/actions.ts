"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { toActionError, ValidationError, type ActionResult } from "@/server/errors";
import {
  addNote, addTag, anonymizeCandidate, createCandidate, deleteCandidates, findDuplicates, linkToJob, removeTag, setOwner, setTalentPool, updateCandidate, uploadResume,
  type CandidateInput, type DuplicateHit, type ResumeFile,
} from "@/server/modules/candidates/service";
import { MAX_RESUME_BYTES } from "@/server/storage";
import { formValues, nextSubmission, str, type FormState, type FormValues } from "@/lib/form";

function candidateInput(v: FormValues): CandidateInput {
  return {
    fullName: str(v, "fullName"), phone: str(v, "phone"), whatsapp: str(v, "whatsapp"), sameWhatsapp: str(v, "sameWhatsapp"), email: str(v, "email"),
    city: str(v, "city"), state: str(v, "state"), address: str(v, "address"), desiredPositionId: str(v, "desiredPositionId"),
    desiredStoreId: str(v, "desiredStoreId"), source: (str(v, "source") || "MANUAL") as CandidateInput["source"], experience: str(v, "experience"),
    introduction: str(v, "introduction"), ownerId: str(v, "ownerId"), consent: str(v, "consent"),
  };
}

async function resumeFrom(fd: FormData): Promise<ResumeFile | null> {
  const f = fd.get("resume");
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > MAX_RESUME_BYTES) throw new ValidationError({ resume: ["O currículo deve ter no máximo 4 MB."] });
  return { name: f.name, type: f.type, data: Buffer.from(await f.arrayBuffer()) };
}

export async function saveCandidateAction(id: string | null, prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  delete values.resume;
  let candidateId: string;
  try {
    const actor = await requireActor();
    const { ip } = await clientInfo();
    if (id) {
      candidateId = (await updateCandidate(actor, id, candidateInput(values), ip)).id;
    } else {
      if (str(values, "consent") !== "on") throw new ValidationError({ consent: ["Confirme que o candidato autorizou o uso dos dados."] });
      const resume = await resumeFrom(fd);
      candidateId = (await createCandidate(actor, candidateInput(values), { resume, jobId: str(values, "jobId") || null, ip })).id;
    }
  } catch (e) {
    return { ...toActionError(e), values, submission: nextSubmission(prev) };
  }
  redirect(`/candidatos/${candidateId}?salvo=1`);
}

/** Verificação de duplicidade enquanto o recrutador digita. */
export async function checkDuplicatesAction(input: { phone?: string; whatsapp?: string; email?: string; excludeId?: string }): Promise<DuplicateHit[]> {
  const actor = await requireActor();
  return findDuplicates(actor, input);
}

async function run(fn: (actor: Awaited<ReturnType<typeof requireActor>>, ip: string | null) => Promise<unknown>): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const { ip } = await clientInfo();
    await fn(actor, ip);
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function uploadResumeAction(id: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor, ip) => {
    const file = await resumeFrom(fd);
    if (!file) throw new ValidationError({ resume: ["Selecione um arquivo PDF."] });
    await uploadResume(actor, id, file, ip);
  });
}

export async function addNoteAction(id: string, prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  const r = await run((actor, ip) => addNote(actor, id, str(values, "body"), ip));
  return r.ok ? { ok: true, submission: nextSubmission(prev) } : { ...r, values, submission: nextSubmission(prev) };
}

export async function addTagAction(id: string, name: string) {
  return run((actor) => addTag(actor, id, name));
}
export async function removeTagAction(id: string, tagId: string) {
  return run((actor) => removeTag(actor, id, tagId));
}
export async function setOwnerAction(id: string, ownerId: string | null) {
  return run((actor, ip) => setOwner(actor, id, ownerId, ip));
}
export async function setTalentPoolAction(id: string, value: boolean) {
  return run((actor) => setTalentPool(actor, id, value));
}
export async function linkJobAction(id: string, jobId: string) {
  return run((actor, ip) => linkToJob(actor, id, jobId, ip));
}

export async function anonymizeAction(id: string): Promise<ActionResult> {
  const r = await run((actor, ip) => anonymizeCandidate(actor, id, ip));
  if (!r.ok) return r;
  redirect("/candidatos?anonimizado=1");
}

export async function deleteCandidatesAction(ids: string[]): Promise<ActionResult<number>> {
  try {
    const { ip } = await clientInfo();
    const n = await deleteCandidates(await requireActor(), ids, ip);
    refresh();
    return { ok: true, data: n };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteCandidateAction(id: string): Promise<ActionResult> {
  const r = await deleteCandidatesAction([id]);
  if (!r.ok) return r;
  redirect("/candidatos?excluido=1");
}
