"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/current-user";
import { toActionError } from "@/server/errors";
import { updateCompanySettings } from "@/server/modules/settings/service";
import { formValues, nextSubmission, str, type FormState } from "@/lib/form";

export async function saveCompanyAction(prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  try {
    const keys = ["companyName", "legalName", "taxId", "contactEmail", "contactPhone", "privacyPolicy", "retentionMonths", "stalledDays", "siteTitle", "siteIntro", "siteContactEmail", "siteContactWhatsapp"];
    await updateCompanySettings(await requireActor(), Object.fromEntries(keys.map((k) => [k, str(values, k)])));
    refresh();
    return { ok: true, message: "Dados salvos.", values, submission: nextSubmission(prev) };
  } catch (e) {
    return { ...toActionError(e), values, submission: nextSubmission(prev) };
  }
}
