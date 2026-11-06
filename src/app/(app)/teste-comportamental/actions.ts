"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/errors";
import { createTest, findCandidatesForTest } from "@/server/modules/behavioral/service";

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
