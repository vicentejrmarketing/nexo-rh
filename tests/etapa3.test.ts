// Etapa 3 — funil (movimentação com histórico) e entrevistas (agenda, conflitos, avaliação) + alertas.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { createJob } from "@/server/modules/jobs/service";
import { createCandidate } from "@/server/modules/candidates/service";
import { getBoard, moveProcess, stalledProcesses, updateStage } from "@/server/modules/pipeline/service";
import {
  cancelInterview, evaluateInterview, getInterview, listInterviews, rescheduleInterview, scheduleInterview, setInterviewOutcome,
} from "@/server/modules/interviews/service";
import { ensureAlerts } from "@/server/modules/alerts/service";
import { addDays, dayKey, startOfDaySP } from "@/lib/period";
import { adminActor, makeActor, makeStore, resetDatabase } from "./support/db";

process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = "/tmp/nexo-test-storage";

const tomorrow = () => dayKey(addDays(startOfDaySP(new Date()), 1));

async function setup() {
  const admin = await adminActor();
  const store = await makeStore("Loja Centro");
  const recruiter = await makeActor("RECRUITER", [store.id]);
  const other = await makeActor("RECRUITER", [store.id]);
  const job = await createJob(admin, { title: "Vendedor", description: "Vendas na loja física.", openings: "1", storeId: store.id, priority: "MEDIUM", recruiterId: recruiter.id });
  const c = await createCandidate(admin, { fullName: "Lucas Pereira", phone: "(47) 99111-2222", source: "MANUAL", consent: "on" }, { jobId: job.id });
  const p = await db.candidateJob.findFirstOrThrow({ where: { candidateId: c.id } });
  await db.candidateJob.update({ where: { id: p.id }, data: { recruiterId: recruiter.id } });
  return { admin, store, recruiter, other, job, candidate: c, processId: p.id };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("funil", () => {
  it("move registrando etapa anterior, nova, usuário e observação; etapas finais encerram e reabrem", async () => {
    const { recruiter, processId } = await setup();
    await moveProcess(recruiter, processId, "contacted", "Falei pelo WhatsApp");
    const h = await db.stageHistory.findFirstOrThrow({ where: { candidateJobId: processId, note: "Falei pelo WhatsApp" }, include: { fromStage: true, toStage: true } });
    expect(h.fromStage?.key).toBe("applied");
    expect(h.toStage.key).toBe("contacted");
    expect(h.movedById).toBe(recruiter.id);

    await moveProcess(recruiter, processId, "hired");
    let p = await db.candidateJob.findUniqueOrThrow({ where: { id: processId } });
    expect(p.status).toBe("HIRED");
    expect(p.hiredAt).not.toBeNull();
    await moveProcess(recruiter, processId, "approved");
    p = await db.candidateJob.findUniqueOrThrow({ where: { id: processId } });
    expect(p.status).toBe("ACTIVE");
    expect(p.hiredAt).toBeNull();
    expect(p.closedAt).toBeNull();
    await moveProcess(recruiter, processId, "rejected", "Sem disponibilidade");
    expect((await db.candidateJob.findUniqueOrThrow({ where: { id: processId } })).status).toBe("REJECTED");
    expect(await db.activityLog.count({ where: { action: "application.move", entityId: processId } })).toBe(4);
  });

  it("recrutador não move processo de outro; gestor de loja só vê", async () => {
    const { other, store, processId } = await setup();
    await expect(moveProcess(other, processId, "contacted")).rejects.toBeInstanceOf(ForbiddenError);
    const gl = await makeActor("STORE_MANAGER", [store.id]);
    const board = await getBoard(gl);
    expect(board.columns.find((c) => c.key === "applied")!.cards[0].canMove).toBe(false);
    await expect(moveProcess(gl, processId, "contacted")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("quadro filtra por vaga e recrutador e marca parados conforme o prazo da etapa", async () => {
    const { admin, recruiter, job, processId } = await setup();
    await db.candidateJob.update({ where: { id: processId }, data: { lastMovedAt: addDays(new Date(), -5) } });
    const board = await getBoard(admin, { jobId: job.id });
    const card = board.columns.find((c) => c.key === "applied")!.cards[0];
    expect(card.stalled).toBe(true); // padrão da empresa: 3 dias
    expect(board.stalledTotal).toBe(1);
    expect((await getBoard(admin, { recruiterId: "sem" })).columns.reduce((n, c) => n + c.total, 0)).toBe(0);
    expect((await stalledProcesses(recruiter)).map((p) => p.id)).toEqual([processId]);
    const applied = await db.recruitmentStage.findUniqueOrThrow({ where: { key: "applied" } });
    await updateStage(admin, applied.id, { name: "Inscritos", stalledDays: "10" });
    expect((await getBoard(admin)).stalledTotal).toBe(0);
  });
});

describe("entrevistas", () => {
  it("agenda, move para a etapa de entrevista, avisa o entrevistador e bloqueia conflito de horário", async () => {
    const { admin, recruiter, other, job, processId } = await setup();
    const i = await scheduleInterview(recruiter, processId, { date: tomorrow(), time: "10:00", durationMinutes: "30", mode: "ONLINE", interviewerId: other.id, storeId: job.storeId, meetingUrl: "https://meet.google.com/abc", moveStage: "on" });
    const p = await db.candidateJob.findUniqueOrThrow({ where: { id: processId }, include: { stage: true } });
    expect(p.stage.key).toBe("online_interview");
    expect(await db.notification.count({ where: { userId: other.id, link: `/entrevistas/${i.id}` } })).toBe(1);

    // Outro candidato com o mesmo entrevistador às 10:15 → conflito
    const c2 = await createCandidate(admin, { fullName: "Maria Souza", phone: "(47) 99333-4444", source: "MANUAL", consent: "on" }, { jobId: job.id });
    const p2 = await db.candidateJob.findFirstOrThrow({ where: { candidateId: c2.id } });
    await expect(scheduleInterview(admin, p2.id, { date: tomorrow(), time: "10:15", durationMinutes: "30", mode: "IN_PERSON", interviewerId: other.id, storeId: job.storeId })).rejects.toBeInstanceOf(ValidationError);
    await scheduleInterview(admin, p2.id, { date: tomorrow(), time: "10:30", durationMinutes: "30", mode: "IN_PERSON", interviewerId: other.id, storeId: job.storeId });
    // Data passada é recusada
    await expect(scheduleInterview(admin, p2.id, { date: "2020-01-01", time: "10:00", durationMinutes: "30", mode: "ONLINE", storeId: job.storeId })).rejects.toBeInstanceOf(ValidationError);
    const from = startOfDaySP(new Date());
    expect((await listInterviews(admin, from, addDays(from, 3))).length).toBe(2);
  });

  it("reagendar preserva o histórico; cancelar exige motivo", async () => {
    const { recruiter, job, processId } = await setup();
    const i = await scheduleInterview(recruiter, processId, { date: tomorrow(), time: "14:00", durationMinutes: "30", mode: "IN_PERSON", storeId: job.storeId });
    const next = await rescheduleInterview(recruiter, i.id, { date: tomorrow(), time: "16:00", durationMinutes: "45", mode: "IN_PERSON", storeId: job.storeId, reason: "Pedido do candidato" });
    expect((await db.interview.findUniqueOrThrow({ where: { id: i.id } })).status).toBe("RESCHEDULED");
    expect(next.rescheduledFromId).toBe(i.id);
    await expect(cancelInterview(recruiter, next.id, "")).rejects.toBeInstanceOf(ValidationError);
    await cancelInterview(recruiter, next.id, "Vaga pausada");
    expect((await db.interview.findUniqueOrThrow({ where: { id: next.id } })).status).toBe("CANCELED");
  });

  it("resultado e avaliação só depois do horário; avaliar de novo atualiza a mesma avaliação", async () => {
    const { recruiter, job, processId } = await setup();
    const i = await scheduleInterview(recruiter, processId, { date: tomorrow(), time: "09:00", durationMinutes: "30", mode: "ONLINE", interviewerId: recruiter.id, storeId: job.storeId });
    await expect(setInterviewOutcome(recruiter, i.id, "COMPLETED")).rejects.toBeInstanceOf(ValidationError);
    await db.interview.update({ where: { id: i.id }, data: { scheduledAt: addDays(new Date(), -1) } });
    await expect(evaluateInterview(recruiter, i.id, { overall: "", recommendation: "ADVANCE" })).rejects.toBeInstanceOf(ValidationError);
    await evaluateInterview(recruiter, i.id, { overall: "4", communication: "5", recommendation: "ADVANCE", comments: "Boa comunicação" });
    await evaluateInterview(recruiter, i.id, { overall: "5", recommendation: "ADVANCE" });
    const evs = await db.interviewEvaluation.findMany({ where: { interviewId: i.id } });
    expect(evs).toHaveLength(1);
    expect(evs[0].overall).toBe(5);
    expect((await getInterview(recruiter, i.id)).interview.status).toBe("COMPLETED");
  });
});

describe("alertas", () => {
  it("cria aviso de entrevista nas próximas 24 h e de parados, sem duplicar", async () => {
    const { recruiter, job, processId } = await setup();
    const soon = new Date(Date.now() + 3 * 3600000);
    await db.interview.create({ data: { candidateJobId: processId, storeId: job.storeId, interviewerId: recruiter.id, scheduledAt: soon, mode: "ONLINE", createdById: recruiter.id } });
    await db.candidateJob.update({ where: { id: processId }, data: { lastMovedAt: addDays(new Date(), -6) } });
    await ensureAlerts(recruiter, new Date(), true);
    await ensureAlerts(recruiter, new Date(), true);
    expect(await db.notification.count({ where: { userId: recruiter.id, type: "INTERVIEW_SOON" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: recruiter.id, type: "STALLED_CANDIDATE" } })).toBe(1);
  });
});



