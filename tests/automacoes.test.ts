// Mensagens automáticas em modo 1 clique: fila por evento, sem duplicidade, dados completos e LGPD.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { NotFoundError, ValidationError } from "@/server/errors";
import { createJob } from "@/server/modules/jobs/service";
import { createCandidate, linkToJob } from "@/server/modules/candidates/service";
import { moveProcess } from "@/server/modules/pipeline/service";
import { cancelInterview, rescheduleInterview, scheduleInterview } from "@/server/modules/interviews/service";
import { pendingQueue, recordOptOut, sendDispatch, setRuleEnabled } from "@/server/modules/automations/service";
import { addDays, dayKey, startOfDaySP } from "@/lib/period";
import { adminActor, makeActor, makeStore, resetDatabase } from "./support/db";

process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = "/tmp/nexo-test-storage";

const inDays = (n: number) => dayKey(addDays(startOfDaySP(new Date()), n));

async function setup() {
  const admin = await adminActor();
  const store = await db.store.update({ where: { id: (await makeStore("Loja Centro")).id }, data: { address: "Rua XV, 100" } });
  const recruiter = await makeActor("RECRUITER", [store.id]);
  const job = await createJob(admin, { title: "Vendedor", description: "Vendas na loja física.", openings: "1", storeId: store.id, priority: "MEDIUM", recruiterId: recruiter.id });
  const c = await createCandidate(admin, { fullName: "Lucas Pereira", phone: "(47) 99111-2222", sameWhatsapp: "on", source: "MANUAL", consent: "on" }, { jobId: job.id });
  const p = await db.candidateJob.findFirstOrThrow({ where: { candidateId: c.id } });
  await db.candidateJob.update({ where: { id: p.id }, data: { recruiterId: recruiter.id } });
  return { admin, store, recruiter, job, candidate: c, processId: p.id };
}

const ruleOf = (event: string) => db.automationRule.findUniqueOrThrow({ where: { event } });
const dispatches = (processId: string) => db.messageDispatch.findMany({ where: { candidateJobId: processId }, include: { rule: true }, orderBy: { createdAt: "asc" } });

beforeEach(async () => {
  await resetDatabase();
});

describe("fila de mensagens automáticas", () => {
  it("inscrição gera a mensagem uma única vez, com texto pronto e link do WhatsApp", async () => {
    const { recruiter, processId } = await setup();
    const q = await pendingQueue(recruiter);
    expect(q.ready).toHaveLength(1);
    expect(q.ready[0].rule.event).toBe("stage:applied");
    expect(q.ready[0].eval.body).toContain("Olá, Lucas! Recebemos sua candidatura para a vaga de Vendedor na Loja Centro.");
    const { url } = await sendDispatch(recruiter, q.ready[0].id);
    expect(url).toMatch(/^https:\/\/wa\.me\/5547991112222\?text=Ol%C3%A1%2C%20Lucas/);
    const msg = await db.message.findFirstOrThrow({ where: { candidateJobId: processId } });
    expect(msg.channel).toBe("MANUAL_LINK");
    expect(msg.stageKey).toBe("applied");
    await expect(sendDispatch(recruiter, q.ready[0].id)).rejects.toBeInstanceOf(ValidationError); // não duplica
    expect((await pendingQueue(recruiter)).ready).toHaveLength(0);
  });

  it("mudança de etapa: registra antes, não duplica ao voltar e pula se o candidato já mudou de novo", async () => {
    const { recruiter, processId } = await setup();
    await moveProcess(recruiter, processId, "approved");
    await moveProcess(recruiter, processId, "trial");
    await moveProcess(recruiter, processId, "approved"); // voltou para Aprovados: não gera segunda mensagem
    const ds = await dispatches(processId);
    expect(ds.filter((d) => d.rule.event === "stage:approved")).toHaveLength(1);
    await moveProcess(recruiter, processId, "hired");
    const q = await pendingQueue(recruiter);
    expect(q.ready.map((d) => d.rule.event)).toEqual(["stage:hired"]);
    const skipped = await db.messageDispatch.findMany({ where: { candidateJobId: processId, status: "SKIPPED" }, include: { rule: true } });
    expect(skipped.map((s) => s.rule.event).sort()).toEqual(["stage:applied", "stage:approved", "stage:trial"]);
  });

  it("automação desativada não gera mensagem; desistência começa desligada", async () => {
    const { admin, recruiter, processId } = await setup();
    expect((await ruleOf("stage:withdrawn")).enabled).toBe(false);
    await setRuleEnabled(admin, (await ruleOf("stage:rejected")).id, false);
    await moveProcess(recruiter, processId, "rejected");
    expect((await dispatches(processId)).map((d) => d.rule.event)).toEqual(["stage:applied"]);
  });

  it("entrevista online sem link fica parada e avisa o recrutador; com link, sai com data, horário e link", async () => {
    const { recruiter, job, processId } = await setup();
    const i = await scheduleInterview(recruiter, processId, { date: inDays(2), time: "10:00", durationMinutes: "30", mode: "ONLINE", storeId: job.storeId, moveStage: "on" });
    let q = await pendingQueue(recruiter);
    const blocked = q.blocked.find((d) => d.rule.event === "interview:online")!;
    expect(blocked.reason).toMatch(/link da entrevista online/);
    expect(await db.notification.count({ where: { userId: recruiter.id, title: { startsWith: "Mensagem parada" } } })).toBe(1);
    await db.interview.update({ where: { id: i.id }, data: { meetingUrl: "https://meet.google.com/abc" } });
    q = await pendingQueue(recruiter);
    const ready = q.ready.find((d) => d.rule.event === "interview:online")!;
    expect(ready.eval.body).toContain("às 10:00. Link de acesso: https://meet.google.com/abc.");
    // Lembretes ficam agendados para 24 h e 1 h antes, e só aparecem na hora.
    const reminders = (await dispatches(processId)).filter((d) => d.rule.event.startsWith("reminder:"));
    expect(reminders.map((r) => (i.scheduledAt.getTime() - r.dueAt.getTime()) / 60000).sort((a, b) => a - b)).toEqual([60, 1440]);
    expect(q.ready.some((d) => d.rule.event.startsWith("reminder:"))).toBe(false);
  });

  it("presencial usa o endereço da loja; mover para etapa de entrevista sem agendar pede o agendamento", async () => {
    const { admin, recruiter, job } = await setup();
    const c2 = await createCandidate(admin, { fullName: "Ana Lima", phone: "(47) 99333-4444", sameWhatsapp: "on", source: "MANUAL", consent: "on" }, { jobId: job.id });
    const p2 = await db.candidateJob.findFirstOrThrow({ where: { candidateId: c2.id } });
    await moveProcess(admin, p2.id, "onsite_interview");
    let q = await pendingQueue(admin);
    expect(q.blocked.find((d) => d.candidateJobId === p2.id)!.reason).toMatch(/Agende a entrevista/);
    await scheduleInterview(admin, p2.id, { date: inDays(3), time: "15:00", durationMinutes: "30", mode: "IN_PERSON", storeId: job.storeId });
    q = await pendingQueue(admin);
    expect(q.blocked.some((d) => d.candidateJobId === p2.id)).toBe(false);
    expect(q.ready.find((d) => d.candidateJobId === p2.id && d.rule.event === "interview:in_person")!.eval.body).toContain("no endereço Rua XV, 100 - São Paulo/SP");
    void recruiter;
  });

  it("reagendar/cancelar: avisa só se o candidato já sabia, e cancela lembretes antigos", async () => {
    const { recruiter, job, processId } = await setup();
    const i = await scheduleInterview(recruiter, processId, { date: inDays(2), time: "09:00", durationMinutes: "30", mode: "IN_PERSON", storeId: job.storeId });
    const scheduled = (await pendingQueue(recruiter)).ready.find((d) => d.rule.event === "interview:in_person")!;
    await sendDispatch(recruiter, scheduled.id);
    const next = await rescheduleInterview(recruiter, i.id, { date: inDays(4), time: "11:00", durationMinutes: "30", mode: "IN_PERSON", storeId: job.storeId });
    const all = await dispatches(processId);
    expect(all.filter((d) => d.interviewId === i.id && d.rule.event.startsWith("reminder:")).every((d) => d.status === "CANCELED")).toBe(true);
    expect(all.some((d) => d.interviewId === next.id && d.rule.event === "interview:rescheduled")).toBe(true);
    const resched = (await pendingQueue(recruiter)).ready.find((d) => d.rule.event === "interview:rescheduled")!;
    await sendDispatch(recruiter, resched.id);
    await cancelInterview(recruiter, next.id, "Vaga pausada");
    const after = await dispatches(processId);
    expect(after.some((d) => d.interviewId === next.id && d.rule.event === "interview:canceled" && d.status === "PENDING")).toBe(true);
    expect(after.filter((d) => d.interviewId === next.id && d.rule.event.startsWith("reminder:")).every((d) => d.status === "CANCELED")).toBe(true);
  });

  it("mesma pessoa em duas vagas recebe as mensagens de cada candidatura separadamente", async () => {
    const { admin, recruiter, store, candidate } = await setup();
    const job2 = await createJob(admin, { title: "Caixa", description: "Operação de caixa.", openings: "1", storeId: store.id, priority: "MEDIUM" });
    await linkToJob(admin, candidate.id, job2.id);
    const q = await pendingQueue(admin);
    expect(q.ready.filter((d) => d.candidateJob.candidate.id === candidate.id).map((d) => d.candidateJob.job.title).sort()).toEqual(["Caixa", "Vendedor"]);
    void recruiter;
  });

  it("descadastro cancela a fila; recrutador não vê a fila de outro", async () => {
    const { admin, store, recruiter, candidate, processId } = await setup();
    const other = await makeActor("RECRUITER", [store.id]);
    expect((await pendingQueue(other)).ready).toHaveLength(0);
    await expect(sendDispatch(other, (await dispatches(processId))[0].id)).rejects.toBeInstanceOf(NotFoundError);
    await recordOptOut(admin, candidate.id);
    expect((await pendingQueue(recruiter)).ready).toHaveLength(0);
    await moveProcess(recruiter, processId, "approved");
    expect((await pendingQueue(recruiter)).ready).toHaveLength(0); // novo evento também não sai
  });
});
