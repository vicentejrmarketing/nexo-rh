// Os indicadores vêm do banco e respeitam o escopo de loja e de responsável.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { getFunnel, getHeadlineKpis, getJobsByStatus } from "@/server/modules/dashboard/service";
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

  it("funil conta quem chegou a cada etapa; contratado passa por todas; reprovado não avança", async () => {
    const a = await makeStore("Loja A");
    const admin = await adminActor();
    const stage = async (key: string) => (await db.recruitmentStage.findUniqueOrThrow({ where: { key } })).id;
    const job = await db.job.create({ data: { title: "Caixa", slug: "caixa-f", description: "x", storeId: a.id, city: "SP", status: "OPEN" } });
    const mk = async (n: number, current: string, history: string[], status: "ACTIVE" | "HIRED" | "REJECTED" = "ACTIVE") => {
      const c = await db.candidate.create({ data: { fullName: `F${n}`, source: "MANUAL" } });
      const p = await db.candidateJob.create({ data: { candidateId: c.id, jobId: job.id, stageId: await stage(current), source: "MANUAL", status } });
      for (const h of history) await db.stageHistory.create({ data: { candidateJobId: p.id, toStageId: await stage(h) } });
    };
    await mk(1, "applied", ["applied"]);
    await mk(2, "onsite_interview", ["applied", "contacted", "onsite_interview"]);
    await mk(3, "hired", ["applied", "approved", "hired"], "HIRED");
    await mk(4, "rejected", ["applied", "contacted", "rejected"], "REJECTED");
    const rows = Object.fromEntries((await getFunnel(admin, null)).map((r) => [r.key, r]));
    expect(rows.applied).toMatchObject({ count: 4, percent: 100 });
    expect(rows.contacted.count).toBe(3); // 2, 3 (contratado) e 4 (reprovado depois do contato)
    expect(rows.onsite_interview.count).toBe(2); // 2 e 3
    expect(rows.approved).toMatchObject({ count: 1, percent: 25 });
  });

  it("vagas por status e filtro de loja fora do acesso é ignorado (nunca amplia)", async () => {
    const a = await makeStore("Loja A");
    const b = await makeStore("Loja B");
    for (const [i, s, store] of [[1, "OPEN", a.id], [2, "PAUSED", a.id], [3, "CLOSED", b.id], [4, "DRAFT", a.id]] as const) {
      await db.job.create({ data: { title: "V", slug: `v-${i}`, description: "x", storeId: store, city: "SP", status: s } });
    }
    expect(await getJobsByStatus(await adminActor())).toEqual({ total: 3, open: 1, paused: 1, closed: 1 });
    const gestorA = await makeActor("STORE_MANAGER", [a.id]);
    expect((await getJobsByStatus(gestorA)).total).toBe(2);
    // Tentar filtrar pela loja B não dá acesso a ela.
    expect((await getJobsByStatus(gestorA, { storeId: b.id })).total).toBe(2);
  });
});
