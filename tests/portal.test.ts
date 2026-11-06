// Portal público de vagas: publicação, filtros, inscrição, duplicidade, antispam e LGPD.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { AppError, ValidationError } from "@/server/errors";
import { createJob, setJobPublished, setJobStatus, updateJob } from "@/server/modules/jobs/service";
import { getCandidateProfile, searchCandidates } from "@/server/modules/candidates/service";
import { getHeadlineKpis } from "@/server/modules/dashboard/service";
import { getStore } from "@/server/modules/stores/service";
import { savePosition } from "@/server/modules/settings/service";
import {
  checkFormToken, createPrivacyRequest, getPublicJob, issueFormToken, listPublicJobs, publicFilterOptions, submitApplication, type ApplyInput,
} from "@/server/modules/portal/service";
import { listPrivacyRequests, resolvePrivacyRequest, siteOverview } from "@/server/modules/portal/admin";
import { adminActor, makeActor, makeStore, resetDatabase } from "./support/db";

process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = "/tmp/nexo-test-storage";

const PDF = { name: "curriculo.pdf", type: "application/pdf", data: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF") };
const meta = (ip = "10.0.0.1") => ({ ip, userAgent: "vitest", token: issueFormToken(Date.now() - 6000) });
const form = (extra: Partial<ApplyInput> = {}): ApplyInput => ({
  fullName: "Bruna Costa Lima", cpf: "529.982.247-25", phone: "(47) 98888-1111", email: "bruna@exemplo.com", city: "Itajaí", state: "SC",
  salaryExpectation: "2.300,00", currentlyEmployed: "nao", consent: "on", ...extra,
});

async function setup() {
  const admin = await adminActor();
  const store = await makeStore("Loja Centro");
  const pos = await savePosition(admin, null, { name: "Operador(a) de Caixa", area: "Atendimento" });
  const recruiter = await makeActor("RECRUITER", [store.id]);
  const job = await createJob(admin, {
    title: "Operador de Caixa", description: "Atendimento no caixa e fechamento.", openings: "2", storeId: store.id, priority: "HIGH",
    positionId: pos.id, recruiterId: recruiter.id, salaryMin: "1.900,00", salaryMax: "2.400,00", showSalary: "on", publishedOnline: "on", contractType: "CLT",
  });
  return { admin, store, pos, recruiter, job };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("publicação no site", () => {
  it("só vagas abertas e publicadas aparecem; pausada/encerrada abre sem aceitar; rascunho e cancelada somem", async () => {
    const { admin, store, job } = await setup();
    expect(job.publishedAt).not.toBeNull();
    expect((await listPublicJobs()).items.map((j) => j.id)).toEqual([job.id]);
    expect((await getPublicJob(job.slug))?.accepting).toBe(true);

    const draft = await createJob(admin, { title: "Estoquista", description: "Organização de estoque.", openings: "1", storeId: store.id, priority: "MEDIUM", status: "DRAFT", publishedOnline: "on" });
    expect(await getPublicJob(draft.slug)).toBeNull();

    await setJobStatus(admin, job.id, "PAUSED");
    expect((await listPublicJobs()).total).toBe(0);
    expect((await getPublicJob(job.slug))?.accepting).toBe(false);
    await setJobStatus(admin, job.id, "CLOSED");
    expect((await getPublicJob(job.slug))?.accepting).toBe(false);
    await setJobStatus(admin, job.id, "OPEN");
    await setJobPublished(admin, job.id, false);
    expect(await getPublicJob(job.slug)).toBeNull();
    await setJobPublished(admin, job.id, true);
    await setJobStatus(admin, job.id, "CANCELED");
    expect(await getPublicJob(job.slug)).toBeNull();
  });

  it("salário oculto não vaza para o site", async () => {
    const { admin, job } = await setup();
    await updateJob(admin, job.id, {
      title: job.title, description: job.description, openings: "2", storeId: job.storeId, priority: "HIGH", salaryMin: "1.900,00", publishedOnline: "on", salaryText: "A combinar",
    });
    const pub = (await getPublicJob(job.slug))!.job;
    expect(pub.salaryMin).toBeNull();
    expect(pub.salaryLabel).toBe("A combinar");
  });
});

describe("filtros", () => {
  it("combinam palavra-chave, área, cidade, estado, contratação, faixa salarial e data", async () => {
    const { admin, store } = await setup();
    const other = await db.store.create({ data: { name: "Loja Norte", city: "Curitiba", state: "PR" } });
    await createJob(admin, { title: "Vendedor Externo", description: "Vendas em campo.", openings: "1", storeId: other.id, priority: "LOW", contractType: "PJ", publishedOnline: "on", salaryMin: "4.000,00", showSalary: "on" });
    expect((await listPublicJobs({ q: "caixa" })).total).toBe(1);
    expect((await listPublicJobs({ area: "Atendimento" })).total).toBe(1);
    expect((await listPublicJobs({ state: "PR" })).items[0].title).toBe("Vendedor Externo");
    expect((await listPublicJobs({ city: "São Paulo", contract: "CLT" })).total).toBe(1);
    expect((await listPublicJobs({ city: "São Paulo", contract: "PJ" })).total).toBe(0);
    expect((await listPublicJobs({ salary: "3000-5000" })).items.map((j) => j.title)).toEqual(["Vendedor Externo"]);
    expect((await listPublicJobs({ salary: "ate-2000" })).items.map((j) => j.title)).toEqual(["Operador de Caixa"]);
    expect((await listPublicJobs({ storeId: store.id, days: "7" })).total).toBe(1);
    expect((await listPublicJobs({ q: "vendas", sort: "relevantes" })).items[0].title).toBe("Vendedor Externo");
    const opts = await publicFilterOptions();
    expect(opts.states).toEqual(["PR", "SP"]);
    expect(opts.areas).toEqual(["Atendimento"]);
  });
});

describe("inscrição pelo site", () => {
  it("cria candidato, candidatura na etapa Inscritos, currículo, consentimento e notifica o recrutador", async () => {
    const { admin, store, recruiter, job } = await setup();
    const r = await submitApplication(job.slug, form({ talentPool: "on", message: "Disponível à tarde" }), PDF, meta());
    expect(r.reused).toBe(false);

    const app = await db.candidateJob.findUniqueOrThrow({ where: { id: r.applicationId }, include: { stage: true, resume: true, consents: true, candidate: true } });
    expect(app.stage.key).toBe("applied");
    expect(app.source).toBe("ONLINE_FORM");
    expect(Number(app.salaryExpectation)).toBe(2300);
    expect(app.currentlyEmployed).toBe(false);
    expect(app.applicantMessage).toBe("Disponível à tarde");
    expect(app.resume?.fileName).toBe("curriculo.pdf");
    expect(app.recruiterId).toBe(recruiter.id);
    expect(app.consents.map((c) => c.purpose).sort()).toEqual(["RECRUITMENT_PROCESS", "TALENT_POOL", "WHATSAPP_CONTACT"]);
    expect(app.candidate.desiredStoreId).toBe(store.id);
    expect(app.candidate.inTalentPool).toBe(true);
    expect(app.candidate.cpf).toBe("52998224725");
    expect((await searchCandidates(admin, { q: "529.982.247-25" })).total).toBe(1);
    expect(await db.stageHistory.count({ where: { candidateJobId: app.id } })).toBe(1);
    expect(await db.notification.count({ where: { userId: recruiter.id, type: "NEW_APPLICATION" } })).toBe(1);

    // Aparece no painel: candidatos, perfil, loja, indicadores e site de vagas
    expect((await searchCandidates(admin, { q: "Bruna" })).total).toBe(1);
    const prof = await getCandidateProfile(admin, r.candidateId);
    expect(prof.candidate.processes[0].job.id).toBe(job.id);
    expect((await getStore(admin, store.id)).processes.map((p) => p.candidate.id)).toContain(r.candidateId);
    expect((await getHeadlineKpis(admin)).candidates).toBe(1);
    expect((await siteOverview(admin)).stats.total).toBe(1);
  });

  it("segunda inscrição do mesmo telefone reaproveita o cadastro; na mesma vaga não duplica", async () => {
    const { admin, store, job } = await setup();
    const first = await submitApplication(job.slug, form(), PDF, meta());
    const job2 = await createJob(admin, { title: "Repositor", description: "Reposição de mercadorias.", openings: "1", storeId: store.id, priority: "MEDIUM", publishedOnline: "on" });
    const second = await submitApplication(job2.slug, form({ fullName: "Bruna C. Lima", email: "" }), PDF, meta("10.0.0.2"));
    expect(second.candidateId).toBe(first.candidateId);
    expect(second.reused).toBe(true);
    expect(await db.candidate.count()).toBe(1);
    expect(await db.candidateJob.count({ where: { candidateId: first.candidateId } })).toBe(2);
    expect((await db.candidate.findUniqueOrThrow({ where: { id: first.candidateId } })).fullName).toBe("Bruna Costa Lima"); // não sobrescreve

    const again = await submitApplication(job.slug, form({ salaryExpectation: "2.500" }), PDF, meta("10.0.0.3"));
    expect(again.reapplied).toBe(true);
    expect(again.applicationId).toBe(first.applicationId);
    expect(await db.candidateJob.count({ where: { jobId: job.id } })).toBe(1);
    expect(Number((await db.candidateJob.findUniqueOrThrow({ where: { id: first.applicationId } })).salaryExpectation)).toBe(2500);
  });

  it("CPF: mesmo CPF com outro telefone reaproveita; mesmo telefone com outro CPF é outra pessoa", async () => {
    const { job } = await setup();
    const first = await submitApplication(job.slug, form(), PDF, meta());
    const sameCpf = await submitApplication(job.slug, form({ phone: "(47) 97777-0000", email: "" }), PDF, meta("10.0.0.2"));
    expect(sameCpf.candidateId).toBe(first.candidateId);
    const relative = await submitApplication(job.slug, form({ fullName: "Carlos Costa Lima", cpf: "111.444.777-35", email: "" }), PDF, meta("10.0.0.3"));
    expect(relative.candidateId).not.toBe(first.candidateId);
    expect((await db.candidate.findUniqueOrThrow({ where: { id: relative.candidateId } })).cpf).toBe("11144477735");
    const missing = await submitApplication(job.slug, form({ cpf: "" }), PDF, meta("10.0.0.4")).catch((e) => e);
    expect(missing.fieldErrors.cpf).toEqual(["Informe seu CPF."]);
  });

  it("valida campos, telefone, pretensão, PDF e consentimento", async () => {
    const { job } = await setup();
    const err = await submitApplication(job.slug, form({ cpf: "111.111.111-11", phone: "123", salaryExpectation: "abc", consent: undefined as unknown as "on", state: "XX" as "SC" }), null, meta()).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(Object.keys(err.fieldErrors).sort()).toEqual(["consent", "cpf", "phone", "resume", "salaryExpectation", "state"]);
    const fake = { ...PDF, data: Buffer.from("MZ isto não é um pdf") };
    await expect(submitApplication(job.slug, form(), fake, meta())).rejects.toBeInstanceOf(ValidationError);
    const js = { ...PDF, data: Buffer.from("%PDF-1.4 /JavaScript (app.alert(1))") };
    await expect(submitApplication(job.slug, form(), js, meta())).rejects.toBeInstanceOf(ValidationError);
    expect(await db.candidate.count()).toBe(0);
  });

  it("vaga pausada ou encerrada recusa a inscrição", async () => {
    const { admin, job } = await setup();
    await setJobStatus(admin, job.id, "PAUSED");
    await expect(submitApplication(job.slug, form(), PDF, meta())).rejects.toMatchObject({ code: "CONFLICT" });
    await setJobStatus(admin, job.id, "CLOSED");
    await expect(submitApplication(job.slug, form(), PDF, meta())).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.candidate.count()).toBe(0);
  });

  it("bloqueia robôs: campo invisível, envio rápido demais, token falso e excesso de envios", async () => {
    const { job } = await setup();
    await expect(submitApplication(job.slug, form(), PDF, { ...meta(), honeypot: "http://spam" })).rejects.toBeInstanceOf(AppError);
    await expect(submitApplication(job.slug, form(), PDF, { ...meta(), token: issueFormToken() })).rejects.toBeInstanceOf(AppError);
    expect(checkFormToken("123.abc")).toBe("token inválido");
    expect(checkFormToken(issueFormToken(Date.now() - 4 * 3600_000))).toBe("formulário expirado");
    for (let i = 0; i < 5; i++) await submitApplication(job.slug, form(), PDF, meta(`10.1.0.${i}`));
    await expect(submitApplication(job.slug, form(), PDF, meta("10.1.0.99"))).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("sem responsável na vaga, avisa gestor da loja e RH", async () => {
    const { admin, store } = await setup();
    const manager = await makeActor("STORE_MANAGER", [store.id]);
    await db.store.update({ where: { id: store.id }, data: { managerId: manager.id } });
    const job = await createJob(admin, { title: "Fiscal de Loja", description: "Prevenção de perdas.", openings: "1", storeId: store.id, priority: "MEDIUM", publishedOnline: "on" });
    await submitApplication(job.slug, form(), PDF, meta());
    expect(await db.notification.count({ where: { userId: manager.id } })).toBe(1);
    expect(await db.notification.count({ where: { userId: admin.id } })).toBe(1);
  });
});

describe("LGPD", () => {
  it("pedido de exclusão localiza o cadastro e, ao atender, anonimiza e apaga os contatos do pedido", async () => {
    const { admin, job } = await setup();
    const r = await submitApplication(job.slug, form(), PDF, meta());
    await createPrivacyRequest({ fullName: "Bruna Costa Lima", phone: "47 98888-1111" }, meta());
    const [req] = await listPrivacyRequests(admin);
    expect(req.candidateId).toBe(r.candidateId);
    await resolvePrivacyRequest(admin, req.id, "anonymize");
    const c = await db.candidate.findUniqueOrThrow({ where: { id: r.candidateId } });
    expect(c.anonymizedAt).not.toBeNull();
    expect(c.phoneE164).toBeNull();
    const after = await db.privacyRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(after.status).toBe("DONE");
    expect(after.phoneE164).toBeNull();
    // Candidatura continua (sem identificação) para os relatórios
    expect(await db.candidateJob.count({ where: { jobId: job.id } })).toBe(1);
  });
});
