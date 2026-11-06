// Teste comportamental: link individual, resposta única, cálculo no servidor e acesso ao relatório.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { createJob } from "@/server/modules/jobs/service";
import { createCandidate } from "@/server/modules/candidates/service";
import {
  PUBLIC_QUESTIONS, createTest, findCandidatesForTest, getReport, listTests, openTest, startTest, submitTest, testsForCandidate,
} from "@/server/modules/behavioral/service";
import { QUESTIONS } from "@/server/modules/behavioral/questionnaire";
import { adminActor, makeActor, makeStore, resetDatabase } from "./support/db";

const meta = { ip: "10.0.0.5", userAgent: "vitest" };
const best = QUESTIONS.map((q) => q.options.findIndex((o) => o.points === 3));
const tokenOf = (path: string) => path.split("/").pop()!;

async function setup() {
  const admin = await adminActor();
  const store = await makeStore("Loja Centro");
  const recruiter = await makeActor("RECRUITER", [store.id]);
  const job = await createJob(admin, { title: "Vendedor", description: "Vendas na loja física.", openings: "1", storeId: store.id, priority: "MEDIUM", recruiterId: recruiter.id });
  const c = await createCandidate(admin, { fullName: "Lucas Pereira", cpf: "529.982.247-25", phone: "(47) 99111-2222", sameWhatsapp: "on", source: "MANUAL", consent: "on" }, { jobId: job.id });
  const p = await db.candidateJob.findFirstOrThrow({ where: { candidateId: c.id } });
  return { admin, store, recruiter, job, candidate: c, processId: p.id };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("teste comportamental", () => {
  it("recrutador gera e envia, mas não vê resultado nem relatório; RH vê tudo", async () => {
    const { admin, recruiter, candidate, processId } = await setup();
    const found = await findCandidatesForTest(recruiter, "529982");
    expect(found[0].processes.map((p) => p.id)).toEqual([processId]);
    const { id, path } = await createTest(recruiter, candidate.id, processId);
    const token = tokenOf(path);
    const o = await openTest(token);
    expect(o).toMatchObject({ state: "ok", fullName: "Lucas Pereira", jobTitle: "Vendedor" });
    await startTest(token);
    await submitTest(token, best, meta);

    const list = await listTests(recruiter);
    expect(list.stats).toEqual({ sent: 1, completed: 1, waiting: 0 });
    expect(list.rows[0]).toMatchObject({ state: "COMPLETED", overall: null, profile: null });
    await expect(getReport(recruiter, id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await testsForCandidate(recruiter, candidate.id))![0].overall).toBeNull();

    const hr = await makeActor("HR_MANAGER", [(await db.store.findFirstOrThrow()).id]);
    const rep = await getReport(hr, id, "1.1.1.1");
    expect(rep.result!.overall).toBe(100);
    expect(rep.answers).toEqual(best);
    expect(await db.activityLog.count({ where: { action: "behavioral.view_report" } })).toBe(1);
    expect((await listTests(admin)).rows[0].overall).toBe(100);
    expect(await db.notification.count({ where: { userId: recruiter.id, link: `/teste-comportamental/${id}` } })).toBe(1);
    const manager = await makeActor("STORE_MANAGER", [(await db.store.findFirstOrThrow()).id]);
    await expect(listTests(manager)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("não aceita resposta incompleta, nem responder duas vezes; o link mostra concluído", async () => {
    const { admin, candidate, processId } = await setup();
    const token = tokenOf((await createTest(admin, candidate.id, processId)).path);
    await expect(submitTest(token, best.slice(0, 24), meta)).rejects.toBeInstanceOf(ValidationError);
    await expect(submitTest(token, [...best.slice(0, 24), 7], meta)).rejects.toBeInstanceOf(ValidationError);
    const [a, b] = await Promise.allSettled([submitTest(token, best, meta), submitTest(token, best.map(() => 0), meta)]);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect((await openTest(token)).state).toBe("completed");
    await expect(submitTest(token, best, meta)).rejects.toBeInstanceOf(AppError);
    const t = await db.behavioralTest.findFirstOrThrow();
    expect(t.status).toBe("COMPLETED");
    expect(t.completedAt).toBeInstanceOf(Date);
  });

  it("novo teste substitui o pendente (que fica no histórico); respondidos nunca somem; link vencido", async () => {
    const { admin, candidate, processId } = await setup();
    const first = tokenOf((await createTest(admin, candidate.id, processId)).path);
    const second = tokenOf((await createTest(admin, candidate.id, processId)).path);
    expect((await openTest(first)).state).toBe("invalid");
    await submitTest(second, best, meta);
    await createTest(admin, candidate.id, processId); // um terceiro não apaga o respondido
    const hist = (await testsForCandidate(admin, candidate.id))!;
    expect(hist.map((h) => h.state)).toEqual(["SENT", "COMPLETED", "CANCELED"]);
    expect(hist[0].path).toMatch(/^\/teste\//);
    await db.behavioralTest.updateMany({ where: { status: "SENT" }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await listTests(admin, { status: "EXPIRED" })).total).toBe(1);
    expect((await openTest(tokenOf(hist[0].path!))).state).toBe("expired");
  });

  it("perguntas públicas sem pontos; token adulterado não abre; candidato de fora do acesso não aparece", async () => {
    const { candidate, processId, admin } = await setup();
    expect(JSON.stringify(PUBLIC_QUESTIONS)).not.toMatch(/points|insight|competency/);
    expect(PUBLIC_QUESTIONS).toHaveLength(25);
    const token = tokenOf((await createTest(admin, candidate.id, processId)).path);
    expect((await openTest(token.slice(0, -2) + "xx")).state).toBe("invalid");
    const outsider = await makeActor("RECRUITER", [(await makeStore("Outra")).id]);
    expect(await findCandidatesForTest(outsider, "Lucas")).toEqual([]);
    await expect(createTest(outsider, candidate.id, null)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createTest(admin, candidate.id, "processo-de-outro")).rejects.toBeInstanceOf(ValidationError);
  });
});
