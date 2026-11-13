import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { authorize, can, canAccessStore, type Actor } from "@/server/authz/authorize";
import { visibleCandidatesWhere } from "@/server/authz/scopes";
import { AppError, NotFoundError, ValidationError } from "@/server/errors";
import { cpfDigits } from "@/lib/cpf";
import { digitsOnly } from "@/lib/phone";
import { addDays } from "@/lib/period";
import { COMPETENCIES, QUESTIONNAIRE_VERSION, QUESTIONS } from "./questionnaire";
import { validAnswers, type TestResult } from "./scoring";
import { DEFAULT_PROFILE, JOB_TEMPLATES, MATRIX_VERSION, type Essential } from "./matrix";
import { normalizeWeights, scoreV2, type JobProfileSnapshot, type ResultV2 } from "./scoring-v2";
import { aiConfigured, aiModel } from "./ai";

export const TEST_DAYS = 15;

// ───────── Link individual (mesmo esquema da admissão, com outra chave) ─────────

function linkKey() {
  const base = process.env.BEHAVIORAL_SECRET || process.env.FORM_SECRET || process.env.DATABASE_URL;
  if (!base) throw new Error("Segredo do link do teste ausente");
  return createHash("sha256").update(`nexo-teste:${base}`).digest();
}
const sign = (v: string) => createHmac("sha256", linkKey()).update(v).digest("base64url").slice(0, 22);
const tokenFromNonce = (nonce: string) => `${nonce}${sign(nonce)}`;
const hashToken = (t: string) => createHash("sha256").update(`teste:${t}`).digest("hex");
export const testPath = (nonce: string) => `/teste/${tokenFromNonce(nonce)}`;

export type TestState = "SENT" | "COMPLETED" | "CANCELED" | "EXPIRED";
export const TEST_STATUS_LABEL: Record<TestState, string> = { SENT: "Aguardando resposta", COMPLETED: "Respondido", CANCELED: "Substituído", EXPIRED: "Link vencido" };
export const stateOf = (t: { status: string; expiresAt: Date }, now = new Date()): TestState =>
  t.status === "SENT" && t.expiresAt < now ? "EXPIRED" : (t.status as TestState);

// ───────── Painel ─────────

export type TestFilters = { q?: string; status?: string; page?: number };
const PAGE = 30;

export async function listTests(actor: Actor, f: TestFilters = {}) {
  authorize(actor, "behavioral.send");
  const now = new Date();
  const base: Prisma.BehavioralTestWhereInput = { candidate: visibleCandidatesWhere(actor) };
  const and: Prisma.BehavioralTestWhereInput[] = [base];
  const q = f.q?.trim();
  if (q) {
    const d = cpfDigits(q);
    and.push(d.length >= 6 && d.length === q.replace(/[\s.-]/g, "").length ? { candidate: { cpf: { contains: d } } } : { candidate: { fullName: { contains: q, mode: "insensitive" } } });
  }
  if (f.status === "SENT") and.push({ status: "SENT", expiresAt: { gte: now } });
  else if (f.status === "EXPIRED") and.push({ status: "SENT", expiresAt: { lt: now } });
  else if (f.status === "COMPLETED" || f.status === "CANCELED") and.push({ status: f.status });
  const where = { AND: and };
  const page = Math.max(1, f.page ?? 1);
  const showResult = can(actor, "behavioral.view");
  const [total, rows, sent, completed, waiting] = await Promise.all([
    db.behavioralTest.count({ where }),
    db.behavioralTest.findMany({
      where,
      orderBy: [{ sentAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: {
        id: true, status: true, sentAt: true, completedAt: true, expiresAt: true, overall: true, profile: true,
        candidate: { select: { id: true, fullName: true } },
        candidateJob: { select: { job: { select: { title: true, store: { select: { name: true } } } } } },
        createdBy: { select: { name: true } },
      },
    }),
    db.behavioralTest.count({ where: { AND: [base, { status: { not: "CANCELED" } }] } }),
    db.behavioralTest.count({ where: { AND: [base, { status: "COMPLETED" }] } }),
    db.behavioralTest.count({ where: { AND: [base, { status: "SENT", expiresAt: { gte: now } }] } }),
  ]);
  return {
    rows: rows.map((r) => ({ ...r, state: stateOf(r, now), overall: showResult ? r.overall : null, profile: showResult ? r.profile : null })),
    total, page, pages: Math.max(1, Math.ceil(total / PAGE)), stats: { sent, completed, waiting }, showResult,
  };
}

/** Candidatos para o "Gerar teste": busca por nome, CPF ou telefone, com as vagas em andamento. */
export async function findCandidatesForTest(actor: Actor, q: string) {
  authorize(actor, "behavioral.send");
  const term = q.trim();
  if (term.length < 2) return [];
  const d = digitsOnly(term);
  const or: Prisma.CandidateWhereInput[] = [{ fullName: { contains: term, mode: "insensitive" } }];
  if (d.length >= 4) or.push({ cpf: { contains: d } }, { phoneE164: { contains: d } }, { whatsappE164: { contains: d } });
  const rows = await db.candidate.findMany({
    where: { AND: [visibleCandidatesWhere(actor), { OR: or }] },
    orderBy: { fullName: "asc" },
    take: 8,
    select: {
      id: true, fullName: true, cpf: true, phoneE164: true, whatsappE164: true,
      processes: {
        where: { status: { in: ["ACTIVE", "HIRED"] } },
        orderBy: { appliedAt: "desc" },
        select: { id: true, status: true, job: { select: { title: true, store: { select: { name: true } } } }, stage: { select: { name: true } } },
      },
      behavioralTests: { where: { status: { in: ["SENT", "COMPLETED"] } }, orderBy: { sentAt: "desc" }, take: 1, select: { status: true, sentAt: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id, fullName: c.fullName, hasCpf: !!c.cpf, phone: c.whatsappE164 ?? c.phoneE164,
    processes: c.processes.map((p) => ({ id: p.id, label: `${p.job.title} · ${p.job.store.name}`, stage: p.stage.name })),
    lastTest: c.behavioralTests.at(0) ?? null,
  }));
}

/** Gera o link. Um teste pendente da mesma pessoa e vaga é substituído (fica no histórico). */
export async function createTest(actor: Actor, candidateId: string, candidateJobId: string | null, ip?: string | null) {
  authorize(actor, "behavioral.send");
  const c = await db.candidate.findFirst({
    where: { AND: [{ id: candidateId }, visibleCandidatesWhere(actor)] },
    select: { id: true, fullName: true, desiredStoreId: true, processes: { select: { id: true, status: true, jobId: true } } },
  });
  if (!c) throw new NotFoundError("Candidato não encontrado.");
  const process = candidateJobId ? c.processes.find((p) => p.id === candidateJobId) : null;
  if (candidateJobId && !process) throw new ValidationError({ candidateJobId: ["Escolha uma das vagas do candidato."] });
  const jobProfile = await profileSnapshot(process?.jobId ?? null);
  const nonce = randomBytes(12).toString("base64url");
  const test = await db.$transaction(async (tx) => {
    await tx.behavioralTest.updateMany({
      where: { candidateId: c.id, candidateJobId: candidateJobId ?? null, status: "SENT" },
      data: { status: "CANCELED", canceledAt: new Date(), tokenHash: null, tokenNonce: null },
    });
    const t = await tx.behavioralTest.create({
      data: {
        candidateId: c.id, candidateJobId: candidateJobId ?? null, version: QUESTIONNAIRE_VERSION, matrixVersion: MATRIX_VERSION,
        jobProfile: jobProfile as unknown as Prisma.InputJsonValue,
        tokenNonce: nonce, tokenHash: hashToken(tokenFromNonce(nonce)), expiresAt: addDays(new Date(), TEST_DAYS), createdById: actor.id,
      },
    });
    await audit(tx, {
      actorId: actor.id, action: "behavioral.create", entityType: "Candidate", entityId: c.id, storeId: c.desiredStoreId, ipAddress: ip,
      summary: `Gerou o teste comportamental de ${c.fullName}`,
    });
    return t;
  });
  return { id: test.id, path: testPath(nonce), expiresAt: test.expiresAt };
}

/** Testes do candidato (ficha): status, link e resultado para quem pode ver. */
export async function testsForCandidate(actor: Actor, candidateId: string) {
  if (!can(actor, "behavioral.send") && !can(actor, "behavioral.view")) return null;
  const rows = await db.behavioralTest.findMany({
    where: { candidateId, candidate: visibleCandidatesWhere(actor) },
    orderBy: { sentAt: "desc" },
    select: {
      id: true, status: true, sentAt: true, completedAt: true, expiresAt: true, overall: true, profile: true, tokenNonce: true,
      candidateJob: { select: { job: { select: { title: true } } } }, createdBy: { select: { name: true } },
    },
  });
  const showResult = can(actor, "behavioral.view");
  const now = new Date();
  return rows.map((r) => ({
    id: r.id, state: stateOf(r, now), sentAt: r.sentAt, completedAt: r.completedAt, expiresAt: r.expiresAt,
    jobTitle: r.candidateJob?.job.title ?? null, createdBy: r.createdBy?.name ?? null,
    path: r.status === "SENT" && r.tokenNonce && r.expiresAt >= now ? testPath(r.tokenNonce) : null,
    overall: showResult ? r.overall : null, profile: showResult ? r.profile : null,
  }));
}

/** Relatório completo: só quem tem behavioral.view. Cada abertura fica na auditoria. */
export async function getReport(actor: Actor, id: string, ip?: string | null) {
  authorize(actor, "behavioral.view");
  const t = await db.behavioralTest.findFirst({
    where: { id, candidate: visibleCandidatesWhere(actor) },
    include: {
      candidate: { select: { id: true, fullName: true, cpf: true, desiredStoreId: true } },
      candidateJob: { select: { id: true, job: { select: { id: true, title: true, store: { select: { name: true } } } } } },
      createdBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      analyses: { orderBy: { version: "desc" }, include: { requestedBy: { select: { name: true } } } },
    },
  });
  if (!t) throw new NotFoundError("Teste não encontrado.");
  if (t.status === "COMPLETED") {
    await audit(db, {
      actorId: actor.id, action: "behavioral.view_report", entityType: "Candidate", entityId: t.candidate.id, storeId: t.candidate.desiredStoreId, ipAddress: ip,
      summary: `Abriu o relatório comportamental de ${t.candidate.fullName}`,
    });
  }
  return {
    test: t, state: stateOf(t), result: t.result as TestResult | null, answers: t.answers as number[] | null,
    resultV2: (t.result as { kind?: string } | null)?.kind === "m2" ? (t.result as unknown as ResultV2) : null,
    ai: { configured: aiConfigured(), model: aiModel() },
    analysisPending: t.analyses[0]?.status === "PENDING" && Date.now() - t.analyses[0].createdAt.getTime() < 3 * 60 * 1000,
  };
}

// ───────── Página pública ─────────

async function testByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null;
  const nonce = token.slice(0, 16);
  const given = Buffer.from(token.slice(16));
  const expected = Buffer.from(sign(nonce));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return db.behavioralTest.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      candidate: { select: { fullName: true, anonymizedAt: true } },
      candidateJob: { select: { jobId: true, job: { select: { title: true, store: { select: { name: true } } } } } },
    },
  });
}

/** Perguntas para a página pública: sem pontos, sem competências, sem regras. */
export const PUBLIC_QUESTIONS = QUESTIONS.map((q) => ({ n: q.n, text: q.text, options: q.options.map((o) => o.text) }));

export async function openTest(token: string) {
  const t = await testByToken(token);
  if (!t || t.candidate.anonymizedAt || t.status === "CANCELED") return { state: "invalid" as const };
  if (t.status === "COMPLETED") return { state: "completed" as const };
  if (t.expiresAt < new Date()) return { state: "expired" as const };
  return {
    state: "ok" as const,
    id: t.id,
    fullName: t.candidate.fullName,
    jobTitle: t.candidateJob?.job.title ?? null,
    storeName: t.candidateJob?.job.store.name ?? null,
    started: !!t.startedAt,
  };
}

export async function startTest(token: string) {
  const t = await testByToken(token);
  if (!t || t.status !== "SENT") return;
  if (!t.startedAt) await db.behavioralTest.update({ where: { id: t.id }, data: { startedAt: new Date() } });
}

/** Envio final: só uma vez, sem alteração depois. O cálculo acontece aqui, no servidor. */
export async function submitTest(token: string, answers: unknown, meta: { ip: string | null; userAgent: string | null }) {
  const t = await testByToken(token);
  if (!t || t.status === "CANCELED" || t.candidate.anonymizedAt) throw new AppError("NOT_FOUND", "Este link não é mais válido.");
  if (t.status === "COMPLETED") throw new AppError("CONFLICT", "Este teste já foi respondido.");
  if (t.expiresAt < new Date()) throw new AppError("CONFLICT", "Este link venceu. Peça um novo ao RH.");
  if (!validAnswers(answers)) {
    throw new ValidationError({ answers: [`Responda todas as ${QUESTIONS.length} perguntas antes de finalizar.`] });
  }
  const now = new Date();
  // Testes respondidos a partir da matriz m2 usam o motor novo; os pesos são os congelados no envio
  // (para links gerados antes desta versão, os da vaga no momento da resposta).
  const jobProfile = (t.jobProfile as JobProfileSnapshot | null) ?? (await profileSnapshot(t.candidateJob?.jobId ?? null));
  const result = scoreV2(answers, { jobProfile, durationMs: t.startedAt ? now.getTime() - t.startedAt.getTime() : null, questionnaireVersion: t.version });
  await db.$transaction(async (tx) => {
    // Condição no próprio UPDATE: dois envios simultâneos não gravam duas vezes.
    const done = await tx.behavioralTest.updateMany({
      where: { id: t.id, status: "SENT" },
      data: {
        status: "COMPLETED", completedAt: now, startedAt: t.startedAt ?? now, answers, result: result as unknown as Prisma.InputJsonValue,
        overall: result.overall, profile: result.profile, matrixVersion: result.matrixVersion, confidence: result.confidence.level,
        jobProfile: result.jobProfile as unknown as Prisma.InputJsonValue,
        ipAddress: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    });
    if (done.count !== 1) throw new AppError("CONFLICT", "Este teste já foi respondido.");
    if (t.createdById) {
      await tx.notification.create({
        data: {
          userId: t.createdById, type: "SYSTEM", title: `Teste comportamental respondido: ${t.candidate.fullName}`,
          body: t.candidateJob ? `${t.candidateJob.job.title} · ${t.candidateJob.job.store.name}` : null, link: `/teste-comportamental/${t.id}`,
        },
      });
    }
    await audit(tx, {
      actorId: null, action: "behavioral.complete", entityType: "Candidate", entityId: t.candidateId, ipAddress: meta.ip,
      summary: `${t.candidate.fullName} respondeu o teste comportamental`,
    });
  });
  return { testId: t.id };
}

// ───────── Perfil comportamental da vaga (pesos) ─────────

export type JobProfileInput = { template: string; weights: Record<string, number | string>; essentials: { key: string; min: number | string }[] };

async function profileSnapshot(jobId: string | null): Promise<JobProfileSnapshot> {
  if (!jobId) return DEFAULT_PROFILE;
  const p = await db.jobBehavioralProfile.findUnique({ where: { jobId } });
  if (!p) return DEFAULT_PROFILE;
  const tpl = JOB_TEMPLATES.find((t) => t.key === p.template);
  return { template: p.template, name: tpl?.name ?? "Personalizado", weights: normalizeWeights(p.weights as Record<string, number>), essentials: (p.essentials as Essential[]) ?? [] };
}

export async function getJobProfile(actor: Actor, jobId: string) {
  authorize(actor, "behavioral.view");
  const job = await db.job.findUnique({ where: { id: jobId }, select: { id: true, title: true, storeId: true, store: { select: { name: true } }, behavioralProfile: { include: { updatedBy: { select: { name: true } } } } } });
  if (!job || !canAccessStore(actor, job.storeId)) throw new NotFoundError("Vaga não encontrada.");
  return { job, profile: await profileSnapshot(job.id), updatedAt: job.behavioralProfile?.updatedAt ?? null, updatedBy: job.behavioralProfile?.updatedBy?.name ?? null };
}

/** Define pesos e essenciais. Vale para os PRÓXIMOS testes da vaga (os enviados mantêm os pesos do envio). */
export async function saveJobProfile(actor: Actor, jobId: string, input: JobProfileInput, ip?: string | null) {
  authorize(actor, "behavioral.view");
  const job = await db.job.findUnique({ where: { id: jobId }, select: { id: true, title: true, storeId: true } });
  if (!job || !canAccessStore(actor, job.storeId)) throw new NotFoundError("Vaga não encontrada.");
  const tpl = JOB_TEMPLATES.find((t) => t.key === input.template);
  const errors: Record<string, string[]> = {};
  const weights: Record<string, number> = {};
  for (const c of COMPETENCIES) {
    const v = Number(input.weights[c.key]);
    if (!Number.isInteger(v) || v < 0 || v > 3) errors[`w_${c.key}`] = ["Peso de 0 a 3."];
    else weights[c.key] = v;
  }
  if (!Object.keys(errors).length && Object.values(weights).every((v) => v === 0)) errors.weights = ["Pelo menos uma competência precisa ter peso."];
  const essentials: Essential[] = [];
  for (const e of input.essentials) {
    const k = COMPETENCIES.find((c) => c.key === e.key)?.key;
    const min = Number(e.min);
    if (!k) continue;
    if (!Number.isInteger(min) || min < 40 || min > 100) { errors[`min_${e.key}`] = ["Referência de 40 a 100."]; continue; }
    essentials.push({ key: k, min });
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const template = tpl && JSON.stringify(normalizeWeights(tpl.weights)) === JSON.stringify(normalizeWeights(weights)) ? tpl.key : "personalizado";
  const before = await db.jobBehavioralProfile.findUnique({ where: { jobId } });
  await db.$transaction(async (tx) => {
    await tx.jobBehavioralProfile.upsert({
      where: { jobId },
      update: { template, weights, essentials: essentials as unknown as Prisma.InputJsonValue, updatedById: actor.id },
      create: { jobId, template, weights, essentials: essentials as unknown as Prisma.InputJsonValue, updatedById: actor.id },
    });
    await audit(tx, {
      actorId: actor.id, action: "behavioral.job_profile", entityType: "Job", entityId: jobId, storeId: job.storeId, ipAddress: ip,
      summary: `Alterou os pesos comportamentais da vaga ${job.title}`,
      before: before ? { template: before.template, weights: before.weights, essentials: before.essentials } : { template: "padrao" },
      after: { template, weights, essentials },
    });
  });
}

// ───────── Revisão humana ─────────

export type ReviewItemStatus = "pendente" | "confirmado" | "nao_confirmado";
export type Review = { note: string | null; items: Record<string, ReviewItemStatus> };

export async function saveReview(actor: Actor, testId: string, input: { note: string; items: Record<string, string> }, ip?: string | null) {
  authorize(actor, "behavioral.view");
  const t = await db.behavioralTest.findFirst({ where: { id: testId, status: "COMPLETED", candidate: visibleCandidatesWhere(actor) }, include: { candidate: { select: { fullName: true, desiredStoreId: true } } } });
  if (!t) throw new NotFoundError("Teste não encontrado.");
  const items: Record<string, ReviewItemStatus> = {};
  for (const [k, v] of Object.entries(input.items)) {
    if (/^[a-z_:0-9-]{1,40}$/.test(k) && (v === "confirmado" || v === "nao_confirmado")) items[k] = v;
  }
  const review: Review = { note: input.note.trim().slice(0, 4000) || null, items };
  await db.$transaction(async (tx) => {
    await tx.behavioralTest.update({ where: { id: t.id }, data: { review: review as unknown as Prisma.InputJsonValue, reviewedById: actor.id, reviewedAt: new Date() } });
    await audit(tx, {
      actorId: actor.id, action: "behavioral.review", entityType: "Candidate", entityId: t.candidateId, storeId: t.candidate.desiredStoreId, ipAddress: ip,
      summary: `Registrou a revisão do teste comportamental de ${t.candidate.fullName}`,
    });
  });
}

// ───────── Comparação na mesma vaga ─────────

export async function compareForJob(actor: Actor, jobId: string) {
  authorize(actor, "behavioral.view");
  const job = await db.job.findUnique({ where: { id: jobId }, select: { id: true, title: true, storeId: true, store: { select: { name: true } } } });
  if (!job || !canAccessStore(actor, job.storeId)) throw new NotFoundError("Vaga não encontrada.");
  const tests = await db.behavioralTest.findMany({
    where: { status: "COMPLETED", matrixVersion: MATRIX_VERSION, candidateJob: { jobId }, candidate: visibleCandidatesWhere(actor) },
    orderBy: { completedAt: "desc" },
    select: { id: true, completedAt: true, result: true, candidate: { select: { id: true, fullName: true } } },
  });
  // Só ficam lado a lado testes avaliados com os mesmos pesos (critério consistente).
  const groups = new Map<string, { profile: JobProfileSnapshot; rows: { id: string; candidate: { id: string; fullName: string }; completedAt: Date | null; r: ResultV2 }[] }>();
  for (const t of tests) {
    const r = t.result as unknown as ResultV2;
    const key = JSON.stringify({ w: r.jobProfile.weights, e: r.jobProfile.essentials });
    if (!groups.has(key)) groups.set(key, { profile: r.jobProfile, rows: [] });
    groups.get(key)!.rows.push({ id: t.id, candidate: t.candidate, completedAt: t.completedAt, r });
  }
  return { job, groups: [...groups.values()] };
}
