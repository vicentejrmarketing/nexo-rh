// Exclusão de lojas: só sem histórico; vagas vazias saem junto; acessos removidos.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { createJob } from "@/server/modules/jobs/service";
import { deleteStore, storeDeletionCheck } from "@/server/modules/stores/service";
import { createCandidate, deleteCandidates } from "./support/candidates";
import { adminActor, makeActor, makeStore, resetDatabase } from "./support/db";

process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = "/tmp/nexo-test-storage";

beforeEach(async () => {
  await resetDatabase();
});

describe("excluir lojas", () => {
  it("apaga loja e vagas sem candidatos; remove acessos; registra auditoria; só quem gerencia lojas", async () => {
    const admin = await adminActor();
    const store = await makeStore("Loja Teste");
    await createJob(admin, { title: "Vendedor", description: "Vendas na loja.", openings: "1", storeId: store.id, priority: "MEDIUM" });
    const hr = await makeActor("HR_MANAGER", [store.id]);
    await expect(deleteStore(hr, store.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await storeDeletionCheck(store.id)).toMatchObject({ allowed: true, emptyJobs: 1 });
    await deleteStore(admin, store.id);
    expect(await db.store.count({ where: { id: store.id } })).toBe(0);
    expect(await db.job.count({ where: { storeId: store.id } })).toBe(0);
    expect(await db.userStore.count({ where: { storeId: store.id } })).toBe(0);
    const log = await db.activityLog.findFirstOrThrow({ where: { action: "store.delete" } });
    expect(log.summary).toContain("Loja Teste");
    await expect(deleteStore(admin, store.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("bloqueia se houver vaga com candidatos; liberando depois de excluir os candidatos", async () => {
    const admin = await adminActor();
    const store = await makeStore("Loja Centro");
    const job = await createJob(admin, { title: "Caixa", description: "Operação de caixa.", openings: "1", storeId: store.id, priority: "MEDIUM" });
    const c = await createCandidate(admin, { fullName: "Maria Souza", phone: "(47) 99000-2222", source: "MANUAL", consent: "on", desiredStoreId: store.id }, { jobId: job.id });
    await expect(deleteStore(admin, store.id)).rejects.toThrow(/1 vaga\(s\) com candidatos/);
    expect(await db.store.count({ where: { id: store.id } })).toBe(1);
    await deleteCandidates(admin, [c.id]);
    await deleteStore(admin, store.id);
    expect(await db.store.count({ where: { id: store.id } })).toBe(0);
  });
});
