// Os indicadores vêm do banco e respeitam o escopo de loja e de responsável.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { getHeadlineKpis } from "@/server/modules/dashboard/service";
import { adminActor, makeActor, makeStore, resetDatabase } from "./support/db";

beforeEach(async () => {
  await resetDatabase();
});

async function hire(storeId: string, recruiterId: string | null, n: number) {
  const job = await db.job.create({ data: { title: "Vendedor", slug: `vendedor-${storeId}-${n}`, description: "x", storeId, city: "São Paulo", status: "OPEN", recruiterId } });
  const hired = await db.recruitmentStage.findUniqueOrThrow({ where: { key: "hired" } });
  const cand = await db.candidate.create({ data: { fullName: `Candidato ${n}`, source: "MANUAL", desiredStoreId: storeId, ownerId: recruiterId } });
  await db.candidateJob.create({ data: { candidateId: cand.id, jobId: job.id, stageId: hired.id, status: "HIRED", source: "MANUAL", recruiterId } });
}

describe("indicadores da Visão Geral", () => {
  it("banco vazio mostra zero em tudo (sem números fictícios)", async () => {
    expect(await getHeadlineKpis(await adminActor())).toEqual({ candidates: 0, conversations: 0, interviews: 0, approved: 0, hired: 0 });
  });

  it("Gestor de Loja vê só a própria loja; Administrador vê todas; Recrutador vê só os seus", async () => {
    const a = await makeStore("Loja A");
    const b = await makeStore("Loja B");
    const recA = await makeActor("RECRUITER", [a.id]);
    await hire(a.id, recA.id, 1);
    await hire(a.id, null, 2);
    await hire(b.id, null, 3);

    expect((await getHeadlineKpis(await adminActor())).hired).toBe(3);
    const gestorA = await makeActor("STORE_MANAGER", [a.id]);
    expect(await getHeadlineKpis(gestorA)).toMatchObject({ hired: 2, candidates: 2 });
    expect(await getHeadlineKpis(recA)).toMatchObject({ hired: 1, candidates: 1 });
  });
});
