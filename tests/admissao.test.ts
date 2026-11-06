// Contratados e documentos de admissão: link, CPF, envio, conferência e acesso.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { createJob } from "@/server/modules/jobs/service";
import { createCandidate } from "@/server/modules/candidates/service";
import { moveProcess } from "@/server/modules/pipeline/service";
import {
  admissionFileAccess, checkSession, finishReview, generateLink, getHire, listHires, openAdmission, removeAdmissionFile,
  reviewFile, saveAdmissionData, uploadAdmissionFile, verifyIdentity, type AdmissionDataInput,
} from "@/server/modules/admission/service";
import { adminActor, makeActor, makeStore, resetDatabase } from "./support/db";

process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = "/tmp/nexo-test-storage";

const JPG = { name: "frente.jpg", data: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]) };
const PDF = { name: "comprovante.pdf", data: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF") };
const meta = { ip: "10.0.0.9", userAgent: "vitest" };

async function setup() {
  const admin = await adminActor();
  const store = await makeStore("Loja Centro");
  const recruiter = await makeActor("RECRUITER", [store.id]);
  const job = await createJob(admin, { title: "Vendedor", description: "Vendas na loja física.", openings: "1", storeId: store.id, priority: "MEDIUM", recruiterId: recruiter.id });
  const c = await createCandidate(admin, { fullName: "Lucas Pereira", cpf: "529.982.247-25", phone: "(47) 99111-2222", sameWhatsapp: "on", source: "MANUAL", consent: "on" }, { jobId: job.id });
  const p = await db.candidateJob.findFirstOrThrow({ where: { candidateId: c.id } });
  await db.candidateJob.update({ where: { id: p.id }, data: { recruiterId: recruiter.id } });
  await moveProcess(recruiter, p.id, "hired");
  return { admin, store, recruiter, job, candidate: c, processId: p.id };
}

const tokenOf = (path: string) => path.split("/").pop()!;

const fullData = (extra: Partial<AdmissionDataInput> = {}): AdmissionDataInput => ({
  email: "lucas@exemplo.com", race: "Parda", uniformSize: "M", education: "Ensino médio completo", pisNis: "123.45678.90-1",
  maritalStatus: "Casado", children: [{ name: "Ana Pereira", cpf: "111.444.777-35", birthDate: "2018-05-10" }],
  spouseName: "Maria Pereira", spouseCpf: "390.533.447-05", spouseBirthDate: "1995-02-01",
  needsTransport: "sim", busesPerDay: "2", transportDailyCost: "11,00", bankAccount: "01234567-8", bankBranch: "1234", pixKey: "lucas@exemplo.com", privacy: "on", ...extra,
});

async function sendAll(token: string, session: string) {
  for (const kind of ["ID_DOCUMENT", "PROOF_OF_ADDRESS", "SELFIE", "WORK_CARD", "VOTER_ID"]) {
    await uploadAdmissionFile(token, session, kind, kind === "PROOF_OF_ADDRESS" ? PDF : JPG, meta.ip);
  }
}

beforeEach(async () => {
  await resetDatabase();
});

describe("contratados", () => {
  it("lista só contratados visíveis; todos os perfis veem; gestor de loja não gera link", async () => {
    const { admin, store, recruiter, job, processId } = await setup();
    const other = await createCandidate(admin, { fullName: "Ana Lima", phone: "(47) 99333-4444", sameWhatsapp: "on", source: "MANUAL", consent: "on" }, { jobId: job.id });
    void other; // ainda em processo: não aparece
    const list = await listHires(recruiter);
    expect(list.rows.map((r) => r.id)).toEqual([processId]);
    expect(list.summary).toMatchObject({ total: 1, NOT_SENT: 1 });
    const manager = await makeActor("STORE_MANAGER", [store.id]);
    expect((await listHires(manager)).total).toBe(1);
    const h = await getHire(manager, processId);
    expect(h.canManage).toBe(false);
    await expect(generateLink(manager, processId)).rejects.toBeInstanceOf(ForbiddenError);
    const outsider = await makeActor("HR_MANAGER", [(await makeStore("Outra")).id]);
    expect((await listHires(outsider)).total).toBe(0);
    await expect(getHire(outsider, processId)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listHires(admin, { q: "529.982" })).total).toBe(1);
  });

  it("fluxo completo: link, CPF, rascunho, envio, conferência com devolução e conclusão", async () => {
    const { admin, recruiter, processId } = await setup();
    const { path } = await generateLink(recruiter, processId);
    const token = tokenOf(path);
    expect((await openAdmission(token)).state).toBe("ok");
    expect((await openAdmission(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"))).state).toBe("invalid");

    await expect(verifyIdentity(token, "111.444.777-35", meta.ip)).rejects.toBeInstanceOf(ValidationError); // CPF de outra pessoa
    const session = await verifyIdentity(token, "52998224725", meta.ip);
    const a = (await openAdmission(token)) as { state: "ok"; admission: { id: string } };
    expect(checkSession(session, a.admission.id)).toBe(true);
    expect(checkSession(session, "outro")).toBe(false);
    await expect(uploadAdmissionFile(token, "falsa", "SELFIE", JPG, meta.ip)).rejects.toBeInstanceOf(AppError);

    // Rascunho aceita parcial; envio cobra tudo
    await saveAdmissionData(token, session, { race: "Parda" }, false, meta);
    const missing = await saveAdmissionData(token, session, fullData(), true, meta).catch((e) => e);
    expect(Object.keys(missing.fieldErrors)).toContain("doc_SELFIE");
    await expect(uploadAdmissionFile(token, session, "SELFIE", PDF, meta.ip)).rejects.toMatchObject({ fieldErrors: { file: ["Para a selfie, envie uma foto."] } });
    await expect(uploadAdmissionFile(token, session, "ID_DOCUMENT", { name: "x.exe", data: Buffer.from("MZ....") }, meta.ip)).rejects.toBeInstanceOf(ValidationError);
    await sendAll(token, session);
    const bad = await saveAdmissionData(token, session, fullData({ pisNis: "123", children: [{ name: "Ana", cpf: "123", birthDate: "2030-01-01" }] }), true, meta).catch((e) => e);
    expect(Object.keys(bad.fieldErrors).sort()).toEqual(["child_0", "pisNis"]);
    await saveAdmissionData(token, session, fullData(), true, meta);

    const sub = await db.admission.findFirstOrThrow({ where: { candidateJobId: processId } });
    expect(sub.status).toBe("SUBMITTED");
    expect(sub.pisNis).toBe("12345678901");
    expect(Number(sub.transportDailyCost)).toBe(11);
    expect(sub.children).toEqual([{ name: "Ana Pereira", cpf: "11144477735", birthDate: "2018-05-10" }]);
    expect(await db.notification.count({ where: { userId: recruiter.id, link: `/contratados/${processId}` } })).toBe(1);
    await expect(saveAdmissionData(token, session, fullData(), true, meta)).rejects.toThrow(/conferência/); // não edita durante a conferência

    // Conferência: devolve a selfie
    const files = await db.admissionFile.findMany({ where: { admissionId: sub.id } });
    const selfie = files.find((f) => f.kind === "SELFIE")!;
    await expect(reviewFile(recruiter, selfie.id, "REJECTED", "")).rejects.toBeInstanceOf(ValidationError);
    for (const f of files) await reviewFile(recruiter, f.id, f.id === selfie.id ? "REJECTED" : "APPROVED", f.id === selfie.id ? "Foto escura" : null);
    expect((await finishReview(recruiter, processId, null)).status).toBe("CHANGES_REQUESTED");

    // Contratado corrige pelo mesmo link: aprovado não sai, selfie nova entra e a antiga é apagada
    const approved = files.find((f) => f.kind === "ID_DOCUMENT")!;
    await expect(removeAdmissionFile(token, session, approved.id)).rejects.toBeInstanceOf(AppError);
    await expect(saveAdmissionData(token, session, fullData(), true, meta)).rejects.toBeInstanceOf(ValidationError); // falta selfie
    await uploadAdmissionFile(token, session, "SELFIE", JPG, meta.ip);
    await saveAdmissionData(token, session, fullData(), true, meta);
    const selfies = await db.admissionFile.findMany({ where: { admissionId: sub.id, kind: "SELFIE" } });
    expect(selfies.map((s) => s.status)).toEqual(["PENDING"]);

    await expect(finishReview(admin, processId, null)).rejects.toBeInstanceOf(ValidationError); // selfie nova sem conferir
    await reviewFile(admin, selfies[0].id, "APPROVED", null);
    expect((await finishReview(admin, processId, null)).status).toBe("COMPLETED");
    expect((await openAdmission(token)).state).toBe("invalid"); // link desativado
    await expect(generateLink(admin, processId)).rejects.toBeInstanceOf(AppError);

    await admissionFileAccess(admin, selfies[0].id, "1.1.1.1");
    expect(await db.activityLog.count({ where: { action: "admission.file_view" } })).toBe(1);
  });

  it("candidato sem CPF: o CPF informado passa a ser o do cadastro; link vencido e renovado", async () => {
    const { admin, processId, candidate } = await setup();
    await db.candidate.update({ where: { id: candidate.id }, data: { cpf: null } });
    const first = tokenOf((await generateLink(admin, processId)).path);
    const second = tokenOf((await generateLink(admin, processId)).path);
    expect((await openAdmission(first)).state).toBe("invalid"); // o anterior deixa de valer
    await verifyIdentity(second, "111.444.777-35", null);
    expect((await db.candidate.findUniqueOrThrow({ where: { id: candidate.id } })).cpf).toBe("11144477735");
    await db.admission.updateMany({ data: { tokenExpiresAt: new Date(Date.now() - 1000) } });
    expect((await openAdmission(second)).state).toBe("expired");
  });

  it("recrutador não gerencia contratado de outro recrutador", async () => {
    const { store, processId } = await setup();
    const other = await makeActor("RECRUITER", [store.id]);
    expect((await listHires(other)).total).toBe(1);
    await expect(generateLink(other, processId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
