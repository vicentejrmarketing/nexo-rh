"use server";

import { redirect } from "next/navigation";
import { clientInfo } from "@/server/auth/session";
import { toActionError, ValidationError } from "@/server/errors";
import { createPrivacyRequest, submitApplication, type ApplyInput } from "@/server/modules/portal/service";
import type { ResumeFile } from "@/server/modules/candidates/service";
import { MAX_RESUME_BYTES } from "@/server/storage";
import { formValues, nextSubmission, str, type FormState } from "@/lib/form";

// Ações públicas (sem login). A validação real acontece no serviço; aqui só se monta a entrada.

export async function applyAction(slug: string, prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  delete values.resume;
  delete values._t;
  delete values.website;
  try {
    const f = fd.get("resume");
    let resume: ResumeFile | null = null;
    if (f instanceof File && f.size > 0) {
      if (f.size > MAX_RESUME_BYTES) throw new ValidationError({ resume: ["O currículo deve ter no máximo 4 MB."] });
      resume = { name: f.name, type: f.type, data: Buffer.from(await f.arrayBuffer()) };
    }
    const input: ApplyInput = {
      fullName: str(values, "fullName"), phone: str(values, "phone"), email: str(values, "email"), city: str(values, "city"),
      state: str(values, "state") as ApplyInput["state"], salaryExpectation: str(values, "salaryExpectation"),
      currentlyEmployed: str(values, "currentlyEmployed") as ApplyInput["currentlyEmployed"], experience: str(values, "experience"),
      message: str(values, "message"), consent: str(values, "consent") as ApplyInput["consent"], talentPool: str(values, "talentPool"),
    };
    const { ip, userAgent } = await clientInfo();
    await submitApplication(slug, input, resume, { ip, userAgent, token: String(fd.get("_t") ?? ""), honeypot: String(fd.get("website") ?? "") });
  } catch (e) {
    return { ...toActionError(e), values, submission: nextSubmission(prev) };
  }
  redirect(`/trabalhe-conosco/inscricao-enviada?vaga=${encodeURIComponent(slug)}`);
}

export async function privacyRequestAction(prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  delete values._t;
  delete values.website;
  try {
    const { ip, userAgent } = await clientInfo();
    await createPrivacyRequest(
      { fullName: str(values, "fullName"), phone: str(values, "phone"), email: str(values, "email"), message: str(values, "message") },
      { ip, userAgent, token: String(fd.get("_t") ?? ""), honeypot: String(fd.get("website") ?? "") },
    );
    return { ok: true, message: "Pedido recebido. Vamos conferir seus dados e responder pelo contato informado.", submission: nextSubmission(prev) };
  } catch (e) {
    return { ...toActionError(e), values, submission: nextSubmission(prev) };
  }
}
