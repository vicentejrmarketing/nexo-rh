// Exclusão definitiva de candidatos.
import { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { createJob } from "@/server/modules/jobs/service";
import { createCandidate, deleteCandidates, ensureConversationForTest } from "./support/candidates";
import { adminActor, makeActor, makeStore, resetDatabase } from "./support/db";

process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = "/tmp/nexo-test-storage";
const PDF = { name: "cv.pdf", type: "application/pdf", data: Buffer.from("%PDF-1.4\n%%EOF") };

beforeEach(async () => {
  await resetDatabase();
});

describe("excluir candidatos", () => {
  it("apaga cadastro, candidaturas, conversas e currículo; recrutador não pode; fora do acesso não acha", async () => {
    const admin = await adminActor();
    const store = await makeStore("Loja A");
    const job = await createJob(admin, { title: "Vendedor", description: "Vendas na loja.", openings: "1", storeId: store.id, priority: "MEDIUM" });
    const c = await createCandidate(admin, { fullName: "Pedro Alves", phone: "(47) 99000-1111", source: "MANUAL", consent: "on" }, { jobId: job.id, resume: PDF });
    await ensureConversationForTest(admin, c.id);
    const key = (await db.attachment.findFirstOrThrow({ where: { candidateId: c.id } })).storageKey;
    expect(existsSync(path.join("/tmp/nexo-test-storage", key))).toBe(true);

    const recruiter = await makeActor("RECRUITER", [store.id]);
    await expect(deleteCandidates(recruiter, [c.id])).rejects.toBeInstanceOf(ForbiddenError);
    const otherHr = await makeActor("HR_MANAGER", [(await makeStore("Loja B")).id]);
    await expect(deleteCandidates(otherHr, [c.id])).rejects.toBeInstanceOf(NotFoundError);

    expect(await deleteCandidates(admin, [c.id])).toBe(1);
    expect(await db.candidate.count()).toBe(0);
    expect(await db.candidateJob.count()).toBe(0);
    expect(await db.conversation.count()).toBe(0);
    expect(await db.messageDispatch.count()).toBe(0);
    expect(existsSync(path.join("/tmp/nexo-test-storage", key))).toBe(false);
    const log = await db.activityLog.findFirstOrThrow({ where: { action: "candidate.delete" } });
    expect(log.summary).not.toContain("Pedro");
  });
});
