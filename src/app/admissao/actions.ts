"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientInfo } from "@/server/auth/session";
import { ValidationError, toActionError, type ActionResult } from "@/server/errors";
import {
  MAX_DOC_BYTES, removeAdmissionFile, saveAdmissionData, uploadAdmissionFile, verifyIdentity, type AdmissionDataInput,
} from "@/server/modules/admission/service";
import { formValues, nextSubmission, str, type FormState } from "@/lib/form";

const COOKIE = "nexo_adm";

async function session() {
  return (await cookies()).get(COOKIE)?.value;
}

export async function verifyAction(token: string, prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  try {
    const { ip } = await clientInfo();
    const value = await verifyIdentity(token, str(values, "cpf"), ip);
    (await cookies()).set(COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/admissao", maxAge: 2 * 60 * 60 });
  } catch (e) {
    return { ...toActionError(e), values, submission: nextSubmission(prev) };
  }
  redirect(`/admissao/${token}`);
}

export type UploadedFile = { id: string; kind: string; fileName: string; status: string; rejectionReason: string | null; sizeBytes: number };

export async function uploadAction(token: string, kind: string, fd: FormData): Promise<ActionResult<UploadedFile>> {
  try {
    const f = fd.get("file");
    if (!(f instanceof File) || f.size === 0) throw new ValidationError({ file: ["Selecione um arquivo."] });
    if (f.size > MAX_DOC_BYTES) throw new ValidationError({ file: ["O arquivo deve ter no máximo 4 MB."] });
    const { ip } = await clientInfo();
    const row = await uploadAdmissionFile(token, await session(), kind, { name: f.name, data: Buffer.from(await f.arrayBuffer()) }, ip);
    return { ok: true, data: { id: row.id, kind: row.kind, fileName: row.fileName, status: row.status, rejectionReason: row.rejectionReason, sizeBytes: row.sizeBytes } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeFileAction(token: string, fileId: string): Promise<ActionResult> {
  try {
    await removeAdmissionFile(token, await session(), fileId);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveAction(token: string, prev: FormState<{ submitted: boolean }>, fd: FormData): Promise<FormState<{ submitted: boolean }>> {
  const values = formValues(fd);
  const submit = str(values, "_intent") === "submit";
  let submitted = false;
  let rowIds: number[] = [];
  try {
    // Cada linha de filho tem um número próprio na tela; os erros voltam com esse número.
    rowIds = Object.keys(values).filter((k) => /^child_name_\d+$/.test(k)).map((k) => Number(k.slice(11))).sort((x, y) => x - y).slice(0, 15);
    const children: AdmissionDataInput["children"] = rowIds.map((i) => ({ name: str(values, `child_name_${i}`), cpf: str(values, `child_cpf_${i}`), birthDate: str(values, `child_birth_${i}`) }));
    const input: AdmissionDataInput = {
      email: str(values, "email"), race: str(values, "race"), uniformSize: str(values, "uniformSize"), education: str(values, "education"),
      pisNis: str(values, "pisNis"), maritalStatus: str(values, "maritalStatus"), children,
      spouseName: str(values, "spouseName"), spouseCpf: str(values, "spouseCpf"), spouseBirthDate: str(values, "spouseBirthDate"),
      needsTransport: str(values, "needsTransport") as "sim", busesPerDay: str(values, "busesPerDay"), transportDailyCost: str(values, "transportDailyCost"),
      bankAccount: str(values, "bankAccount"), bankBranch: str(values, "bankBranch"), pixKey: str(values, "pixKey"), privacy: str(values, "privacy"),
    };
    const { ip } = await clientInfo();
    const ua = (await headers()).get("user-agent");
    submitted = (await saveAdmissionData(token, await session(), input, submit, { ip, userAgent: ua })).submitted;
  } catch (e) {
    const err = toActionError(e);
    if (err.fieldErrors) {
      err.fieldErrors = Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => {
        const m = /^child_(\d+)$/.exec(k);
        return [m ? `child_${rowIds[Number(m[1])]}` : k, v];
      }));
    }
    return { ...err, values, submission: nextSubmission(prev) };
  }
  if (submitted) redirect(`/admissao/${token}`);
  return { ok: true, data: { submitted: false }, message: "Rascunho salvo. Você pode continuar depois pelo mesmo link.", values, submission: nextSubmission(prev) };
}
