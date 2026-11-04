"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { toActionError } from "@/server/errors";
import { saveStore } from "@/server/modules/stores/service";
import { formValues, nextSubmission, str, type FormState } from "@/lib/form";

export async function saveStoreAction(id: string | null, prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  let storeId: string;
  try {
    const actor = await requireActor();
    const { ip } = await clientInfo();
    const store = await saveStore(
      actor,
      id,
      {
        name: str(values, "name"), city: str(values, "city"), state: str(values, "state") as "SC", address: str(values, "address"),
        managerId: str(values, "managerId"), employeeCount: str(values, "employeeCount") || "0", status: (str(values, "status") || "ACTIVE") as "ACTIVE",
      },
      ip,
    );
    storeId = store.id;
  } catch (e) {
    return { ...toActionError(e), values, submission: nextSubmission(prev) };
  }
  redirect(`/lojas/${storeId}?salvo=1`);
}
