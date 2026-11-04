"use server";

import { requireActor } from "@/server/auth/current-user";
import { markAllNotificationsRead } from "@/server/modules/alerts/service";

export async function markNotificationsReadAction() {
  await markAllNotificationsRead(await requireActor());
}
