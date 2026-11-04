// Etapa 2 — lojas, vagas, candidatos e banco de talentos contra PostgreSQL real.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { getStore, listStores, saveStore } from "@/server/modules/stores/service";
import { createJob, deleteJob, duplicateJob, listJobs, setJobStatus, updateJob } from "@/server/modules/jobs/service";
import {
  addNote, anonymizeCandidate, createCandidate, findDuplicates, getCandidateProfile, linkToJob, resumeAccess, runRetention, searchCandidates,
  updateCandidate, uploadResume,
} from "@/server/modules/candidates/service";
import { savePosition, deletePosition } from "@/server/modules/settings/service";
import { toE164BR } from "@/lib/phone";
import { adminActor, makeActor, makeStore, resetDatabase } from "./support/db";

process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = "/tmp/nexo-test-storage";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const baseJob = (storeId: string) => ({ title: "Vendedor(a) de Loja", description: "Atendimento e vendas na loja.", openings: "2", storeId, priority: "MEDIUM" as const });
const baseCand = (extra: Record<string, string> = {}) => ({ fullName: "Ana Paula Souza", phone: "(47) 99999-0000", source: "MANUAL" as const, consent: "on", ...extra });

beforeEach(async () => {
  await resetDatabase();
});

describe("telefone", () => {
  it("normaliza números brasileiros para E.164", () => {
    expect(toE164BR("(47) 99999-0000")).toBe("+5547999990000");
    expect(toE164BR("047 3333-4444")).toBe("+554733334444");
    expect(toE164BR("+55 11 98888-7777")).toBe("+5511988887777");
    expect(toE164BR("123")).toBeNull();
  });
});

describe("lojas", () => {
  it("administrador cadastra; gestor de RH não; gestor de loja só vê as suas", async () => {
    const admin = await adminActor();
    const a = await saveStore(admin, null, { name: "Loja Centro", city: "Itajaí", state: "SC", employeeCount: "12", status: "ACTIVE" });
    await saveStore(admin, null, { name: "Loja Norte", city: "Blumenau", state: "SC", employeeCount: "8", status: "ACTIVE" });
    const hr = await makeActor("HR_MANAGER", [a.id]);
    await expect(saveStore(hr, null, { name: "X", city: "Y", state: "SC", employeeCount: "1", status: "ACTIVE" })).rejects.toBeInstanceOf(ForbiddenError);
    const gl = await makeActor("STORE_MANAGER", [a.id]);
    expect((await listStores(gl)).map((s) => s.name)).toEqual(["Loja Centro"]);
    const other = (await db.store.findFirstOrThrow({ where: { name: "Loja Norte" } })).id;
    await expect(getStore(gl, other)).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveStore(admin, null, { name: "Loja Centro", city: "Itajaí", state: "SC", employeeCount: "1", status: "ACTIVE" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("vagas", () => {
  it("ciclo de vida: criar aberta, pausar, reabrir, encerrar; transição inválida é recusada", async () => {
    const admin = await adminActor();
    const s = await makeStore("Loja A");
    const job = await createJob(admin, baseJob(s.id));
    expect(job.status).toBe("OPEN");
    expect(job.openedAt).not.toBeNull();
    expect(job.city).toBe("São Paulo"); // herdou a cidade da loja
    await setJobStatus(admin, job.id, "PAUSED");
    await setJobStatus(admin, job.id, "CLOSED");
    const closed = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(closed.closedAt).not.toBeNull();
    await setJobStatus(admin, job.id, "OPEN");
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).closedAt).toBeNull();
    const draft = await createJob(admin, { ...baseJob(s.id), status: "DRAFT" });
    await expect(setJobStatus(admin, draft.id, "CLOSED")).rejects.toBeInstanceOf(ValidationError);
    expect(await db.activityLog.count({ where: { entityId: job.id, action: { startsWith: "job." } } })).toBe(4); // criar, pausar, encerrar, reabrir
  });

  it("salário inválido e máximo menor que mínimo são recusados", async () => {
    const admin = await adminActor();
    const s = await makeStore("Loja A");
    await expect(createJob(admin, { ...baseJob(s.id), salaryMin: "abc" })).rejects.toMatchObject({ fieldErrors: { salaryMin: expect.any(Array) } });
    await expect(createJob(admin, { ...baseJob(s.id), salaryMin: "2.000,00", salaryMax: "1.500,00" })).rejects.toMatchObject({ fieldErrors: { salaryMax: expect.any(Array) } });
    const ok = await createJob(admin, { ...baseJob(s.id), salaryMin: "1.800,50", salaryMax: "2.200" });
    expect(Number(ok.salaryMin)).toBe(1800.5);
    expect(Number(ok.salaryMax)).toBe(2200);
  });

  it("recrutador vê vagas da loja, mas só altera as próprias; não cria vaga", async () => {
    const admin = await adminActor();
    const s = await makeStore("Loja A");
    const rec = await makeActor("RECRUITER", [s.id]);
    const mine = await createJob(admin, { ...baseJob(s.id), recruiterId: rec.id });
    const other = await createJob(admin, baseJob(s.id));
    expect((await listJobs(rec)).map((j) => [j.id, j.canEdit])).toEqual(expect.arrayContaining([[mine.id, true], [other.id, false]]));
    await setJobStatus(rec, mine.id, "PAUSED");
    await expect(setJobStatus(rec, other.id, "PAUSED")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateJob(rec, other.id, baseJob(s.id))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createJob(rec, baseJob(s.id))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("gestor de RH não cria vaga em loja fora do seu acesso", async () => {
    const a = await makeStore("Loja A");
    const b = await makeStore("Loja B");
    const hr = await makeActor("HR_MANAGER", [a.id]);
    await expect(createJob(hr, baseJob(b.id))).rejects.toMatchObject({ fieldErrors: { storeId: expect.any(Array) } });
  });

  it("duplicar gera rascunho; excluir é bloqueado quando há candidatos", async () => {
    const admin = await adminActor();
    const s = await makeStore("Loja A");
    const job = await createJob(admin, baseJob(s.id));
    const copy = await duplicateJob(admin, job.id);
    expect(copy.status).toBe("DRAFT");
    expect(copy.slug).not.toBe(job.slug);
    const c = await createCandidate(admin, baseCand({ desiredStoreId: s.id }));
    await linkToJob(admin, c.id, job.id);
    await expect(deleteJob(admin, job.id)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteJob(admin, copy.id);
    expect(await db.job.count({ where: { id: copy.id } })).toBe(0);
  });
});

describe("candidatos", () => {
  it("cadastro normaliza contatos, registra consentimento, retenção e currículo", async () => {
    const admin = await adminActor();
    const c = await createCandidate(admin, baseCand({ email: "ANA@Mail.com", sameWhatsapp: "on" }), { resume: { name: "cv.pdf", type: "application/pdf", data: PDF } });
    const saved = await db.candidate.findUniqueOrThrow({ where: { id: c.id }, include: { consents: true, attachments: true } });
    expect(saved).toMatchObject({ phoneE164: "+5547999990000", whatsappE164: "+5547999990000", email: "ana@mail.com", inTalentPool: true });
    expect(saved.consents.map((x) => x.purpose).sort()).toEqual(["RECRUITMENT_PROCESS", "TALENT_POOL"]);
    expect(saved.retentionUntil!.getTime()).toBeGreaterThan(Date.now() + 700 * 86400000);
    expect(saved.attachments).toHaveLength(1);
  });

  it("recusa arquivo que não é PDF e não deixa candidato pela metade", async () => {
    const admin = await adminActor();
    await expect(createCandidate(admin, baseCand(), { resume: { name: "cv.pdf", type: "application/pdf", data: Buffer.from("MZ executável") } })).rejects.toMatchObject({
      fieldErrors: { resume: ["Envie o currículo em PDF."] },
    });
    await expect(createCandidate(admin, baseCand(), { resume: { name: "x.pdf", type: "application/pdf", data: Buffer.from("%PDF-1.4 /JavaScript (alert)") } })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.candidate.count()).toBe(0);
  });

  it("exige ao menos um contato", async () => {
    const admin = await adminActor();
    await expect(createCandidate(admin, { fullName: "Sem Contato", source: "MANUAL" })).rejects.toMatchObject({ fieldErrors: { phone: expect.any(Array) } });
  });

  it("detecta duplicado por telefone (mesmo em outro formato) e por e-mail; fora do acesso, não revela o nome", async () => {
    const admin = await adminActor();
    const a = await makeStore("Loja A");
    const b = await makeStore("Loja B");
    await createCandidate(admin, baseCand({ email: "ana@mail.com", desiredStoreId: a.id }));
    const hits = await findDuplicates(admin, { phone: "47 999990000" });
    expect(hits).toEqual([expect.objectContaining({ fullName: "Ana Paula Souza", matchedBy: ["telefone"], visible: true })]);
    expect((await findDuplicates(admin, { email: "ANA@mail.com" }))[0].matchedBy).toEqual(["e-mail"]);
    const recB = await makeActor("RECRUITER", [b.id]);
    expect(await findDuplicates(recB, { phone: "47999990000" })).toEqual([{ id: null, fullName: null, matchedBy: ["telefone"], visible: false }]);
  });

  it("busca por nome, telefone parcial e e-mail, respeitando as lojas", async () => {
    const admin = await adminActor();
    const a = await makeStore("Loja A");
    const b = await makeStore("Loja B");
    await createCandidate(admin, baseCand({ fullName: "Bruna Santos", phone: "47988887777", desiredStoreId: a.id }));
    await createCandidate(admin, baseCand({ fullName: "Carlos Lima", phone: "47977776666", desiredStoreId: b.id }));
    expect((await searchCandidates(admin, { q: "bruna" })).total).toBe(1);
    expect((await searchCandidates(admin, { q: "8888-7777" })).items[0].fullName).toBe("Bruna Santos");
    const glA = await makeActor("STORE_MANAGER", [a.id]);
    expect((await searchCandidates(glA, {})).items.map((c) => c.fullName)).toEqual(["Bruna Santos"]);
    await expect(getCandidateProfile(glA, (await db.candidate.findFirstOrThrow({ where: { fullName: "Carlos Lima" } })).id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("recrutador só edita candidatos dele; gestor de loja não edita", async () => {
    const admin = await adminActor();
    const s = await makeStore("Loja A");
    const rec1 = await makeActor("RECRUITER", [s.id]);
    const rec2 = await makeActor("RECRUITER", [s.id]);
    const c = await createCandidate(rec1, baseCand({ desiredStoreId: s.id }));
    expect(c.ownerId).toBe(rec1.id);
    await updateCandidate(rec1, c.id, baseCand({ desiredStoreId: s.id, fullName: "Ana Paula Souza Lima", ownerId: rec1.id }));
    await expect(updateCandidate(rec2, c.id, baseCand({ desiredStoreId: s.id }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addNote(rec2, c.id, "tentativa")).rejects.toBeInstanceOf(ForbiddenError);
    const gl = await makeActor("STORE_MANAGER", [s.id]);
    await expect(addNote(gl, c.id, "x")).rejects.toBeInstanceOf(ForbiddenError);
    expect((await getCandidateProfile(gl, c.id)).canEdit).toBe(false);
    void admin;
  });

  it("vincular à vaga cria processo em Inscritos com histórico; não duplica; vaga pausada recusa", async () => {
    const admin = await adminActor();
    const s = await makeStore("Loja A");
    const job = await createJob(admin, baseJob(s.id));
    const c = await createCandidate(admin, baseCand({ desiredStoreId: s.id }));
    const p = await linkToJob(admin, c.id, job.id);
    const hist = await db.stageHistory.findMany({ where: { candidateJobId: p.id }, include: { toStage: true } });
    expect(hist.map((h) => h.toStage.key)).toEqual(["applied"]);
    await expect(linkToJob(admin, c.id, job.id)).rejects.toMatchObject({ fieldErrors: { jobId: ["Este candidato já está nesta vaga."] } });
    await setJobStatus(admin, job.id, "PAUSED");
    const c2 = await createCandidate(admin, baseCand({ phone: "47911112222", desiredStoreId: s.id }));
    await expect(linkToJob(admin, c2.id, job.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("currículo: substituir mantém um só ativo; gestor de loja abre; acesso fica registrado", async () => {
    const admin = await adminActor();
    const s = await makeStore("Loja A");
    const c = await createCandidate(admin, baseCand({ desiredStoreId: s.id }), { resume: { name: "v1.pdf", type: "application/pdf", data: PDF } });
    await uploadResume(admin, c.id, { name: "v2.pdf", type: "application/pdf", data: PDF });
    const active = await db.attachment.findMany({ where: { candidateId: c.id, deletedAt: null } });
    expect(active.map((a) => a.fileName)).toEqual(["v2.pdf"]);
    const gl = await makeActor("STORE_MANAGER", [s.id]);
    await resumeAccess(gl, active[0].id);
    expect(await db.activityLog.count({ where: { action: "resume.view", actorId: gl.id } })).toBe(1);
    const outsider = await makeActor("STORE_MANAGER", [(await makeStore("Loja B")).id]);
    await expect(resumeAccess(outsider, active[0].id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("anonimização remove dados pessoais e currículo; retenção só atinge vencidos sem processo ativo", async () => {
    const admin = await adminActor();
    const s = await makeStore("Loja A");
    const c = await createCandidate(admin, baseCand({ email: "x@y.com", desiredStoreId: s.id }), { resume: { name: "cv.pdf", type: "application/pdf", data: PDF } });
    await addNote(admin, c.id, "Observação com dado pessoal");
    await anonymizeCandidate(admin, c.id);
    const a = await db.candidate.findUniqueOrThrow({ where: { id: c.id }, include: { notes: true, attachments: true } });
    expect(a).toMatchObject({ fullName: "Candidato anonimizado", phoneE164: null, email: null, inTalentPool: false });
    expect(a.notes).toHaveLength(0);
    expect(a.attachments.every((x) => x.deletedAt)).toBe(true);
    expect((await searchCandidates(admin, {})).total).toBe(0);

    const job = await createJob(admin, baseJob(s.id));
    const expired = await createCandidate(admin, baseCand({ phone: "47922223333", desiredStoreId: s.id }));
    const busy = await createCandidate(admin, baseCand({ phone: "47933334444", desiredStoreId: s.id }));
    await linkToJob(admin, busy.id, job.id);
    await db.candidate.updateMany({ where: { id: { in: [expired.id, busy.id] } }, data: { retentionUntil: new Date(Date.now() - 86400000) } });
    expect(await runRetention(admin)).toBe(1);
    expect((await db.candidate.findUniqueOrThrow({ where: { id: busy.id } })).anonymizedAt).toBeNull();
  });
});

describe("cargos", () => {
  it("não exclui cargo em uso", async () => {
    const admin = await adminActor();
    const s = await makeStore("Loja A");
    const pos = await savePosition(admin, null, { name: "Caixa" });
    await createJob(admin, { ...baseJob(s.id), positionId: pos.id });
    await expect(deletePosition(admin, pos.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
