"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/errors";
import { disconnect, generateVerifyToken, saveCredentials, testConnection } from "@/server/whatsapp/settings";
import { formValues, nextSubmission, str, type FormState } from "@/lib/form";

export async function saveCredentialsAction(prev: FormState, fd: FormData): Promise<FormState> {
  const v = formValues(fd);
  // Segredos nunca voltam para o navegador, nem em caso de erro.
  const values = { appId: str(v, "appId"), wabaId: str(v, "wabaId"), phoneNumberId: str(v, "phoneNumberId") };
  try {
    const { ip } = await clientInfo();
    const r = await saveCredentials(await requireActor(), { ...values, accessToken: str(v, "accessToken"), appSecret: str(v, "appSecret") }, ip);
    refresh();
    return r.ok
      ? { ok: true, message: `Conectado${r.displayPhone ? ` ao número ${r.displayPhone}` : ""}.`, submission: nextSubmission(prev) }
      : { ok: false, code: "VALIDATION", message: `Credenciais salvas, mas a Meta recusou: ${r.message}`, values, submission: nextSubmission(prev) };
  } catch (e) {
    return { ...toActionError(e), values, submission: nextSubmission(prev) };
  }
}

export async function testConnectionAction(): Promise<ActionResult> {
  try {
    const { ip } = await clientInfo();
    const r = await testConnection(await requireActor(), ip);
    refresh();
    return r.ok ? { ok: true, message: `Conectado${r.displayPhone ? ` (${r.displayPhone})` : ""}.` } : { ok: false, code: "VALIDATION", message: r.message };
  } catch (e) {
    return toActionError(e);
  }
}

export async function generateVerifyTokenAction(): Promise<ActionResult<string>> {
  try {
    const { ip } = await clientInfo();
    const token = await generateVerifyToken(await requireActor(), ip);
    refresh();
    return { ok: true, data: token };
  } catch (e) {
    return toActionError(e);
  }
}

export async function disconnectAction(): Promise<ActionResult> {
  try {
    const { ip } = await clientInfo();
    await disconnect(await requireActor(), ip);
    refresh();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
