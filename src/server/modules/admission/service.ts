import "server-only";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { AdmissionDocKind, AdmissionStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { authorize, type Actor } from "@/server/authz/authorize";
import { ROLES } from "@/server/authz/catalog";
import { visibleJobsWhere } from "@/server/authz/scopes";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/modules/users/schemas";
import { sha256, storage } from "@/server/storage";
import { cpfDigits, isValidCpf } from "@/lib/cpf";
import { addDays } from "@/lib/period";

// ───────── Catálogo de documentos ─────────

export const DOC_KINDS: AdmissionDocKind[] = ["ID_DOCUMENT", "PROOF_OF_ADDRESS", "SELFIE", "WORK_CARD", "VOTER_ID", "MILITARY"];

export const DOC_INFO: Record<AdmissionDocKind, { label: string; hint: string; required: boolean; imageOnly?: boolean }> = {
  ID_DOCUMENT: { label: "Documento com foto (RG com CPF ou CNH)", hint: "Frente e verso. Foto ou PDF.", required: true },
  PROOF_OF_ADDRESS: { label: "Comprovante de endereço", hint: "Conta de luz, água, telefone ou similar. Foto ou PDF.", required: true },
  SELFIE: { label: "Foto estilo selfie", hint: "Rosto de frente, fundo claro, sem óculos escuros ou boné.", required: true, imageOnly: true },
  WORK_CARD: { label: "Carteira de trabalho (digital ou física)", hint: "Print da carteira digital ou foto da página com foto e dados. Foto ou PDF.", required: true },
  VOTER_ID: { label: "Título de eleitor", hint: "Foto, PDF ou print do e-Título.", required: true },
  MILITARY: { label: "Certificado de reservista (para homens)", hint: "Obrigatório para homens. Foto ou PDF.", required: false },
};

export const ADMISSION_STATUS_LABEL: Record<AdmissionStatus | "NOT_SENT", string> = {
  NOT_SENT: "Link não enviado",
  PENDING: "Aguardando contratado",
  SUBMITTED: "Enviado: conferir",
  CHANGES_REQUESTED: "Devolvido para correção",
  COMPLETED: "Completo",
};

export const MAX_DOC_BYTES = 4 * 1024 * 1024; // limite por requisição da Vercel
export const MAX_FILES_PER_KIND = 4;
export const LINK_DAYS = 7;

// ───────── Link (token) ─────────

function linkKey() {
  const base = process.env.ADMISSION_SECRET || process.env.FORM_SECRET || process.env.DATABASE_URL;
  if (!base) throw new Error("Segredo do link de admissão ausente");
  return createHash("sha256").update(`nexo-admissao:${base}`).digest();
}
const sign = (v: string) => createHmac("sha256", linkKey()).update(v).digest("base64url").slice(0, 22);
const tokenFromNonce = (nonce: string) => `${nonce}${sign(nonce)}`;
const hashToken = (t: string) => createHash("sha256").update(`adm:${t}`).digest("hex");

export const admissionPath = (nonce: string) => `/admissao/${tokenFromNonce(nonce)}`;

// ───────── Painel: lista e detalhe dos contratados ─────────

const ownOnly = (actor: Actor) => ROLES[actor.roleKey].ownRecordsOnly;

function hiresWhere(actor: Actor): Prisma.CandidateJobWhereInput {
  return { status: "HIRED", candidate: { anonymizedAt: null }, job: visibleJobsWhere(actor) };
}

export type HireFilters = { q?: string; storeId?: string; status?: string; page?: number };
const PAGE = 30;

export async function listHires(actor: Actor, f: HireFilters = {}) {
  authorize(actor, "admission.view");
  const and: Prisma.CandidateJobWhereInput[] = [hiresWhere(actor)];
  const q = f.q?.trim();
  if (q) {
    const digits = cpfDigits(q);
    and.push(
      digits.length >= 6 && digits.length === q.replace(/[\s.-]/g, "").length
        ? { candidate: { cpf: { contains: digits } } }
        : { candidate: { fullName: { contains: q, mode: "insensitive" } } },
    );
  }
  if (f.storeId) and.push({ job: { storeId: f.storeId } });
  if (f.status === "NOT_SENT") and.push({ admission: null });
  else if (f.status && f.status in ADMISSION_STATUS_LABEL) and.push({ admission: { status: f.status as AdmissionStatus } });
  const where = { AND: and };
  const page = Math.max(1, f.page ?? 1);
  const [total, rows, counts] = await Promise.all([
    db.candidateJob.count({ where }),
    db.candidateJob.findMany({
      where,
      orderBy: [{ hiredAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: {
        id: true, hiredAt: true,
        candidate: { select: { id: true, fullName: true, cpf: true, phoneE164: true, whatsappE164: true } },
        job: { select: { id: true, title: true, store: { select: { id: true, name: true } } } },
        recruiter: { select: { name: true } },
        admission: { select: { status: true, submittedAt: true, tokenExpiresAt: true, _count: { select: { files: true } } } },
      },
    }),
    db.candidateJob.findMany({ where: hiresWhere(actor), select: { admission: { select: { status: true } } } }),
  ]);
  const summary = { total: counts.length, NOT_SENT: 0, PENDING: 0, SUBMITTED: 0, CHANGES_REQUESTED: 0, COMPLETED: 0 };
  for (const c of counts) summary[c.admission?.status ?? "NOT_SENT"]++;
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE)), summary };
}

async function loadHire(actor: Actor, processId: string) {
  const p = await db.candidateJob.findFirst({
    where: { AND: [{ id: processId }, hiresWhere(actor)] },
    include: { admission: true, candidate: { select: { id: true, fullName: true, cpf: true } } },
  });
  if (!p) throw new NotFoundError("Contratado não encontrado.");
  return p;
}

function assertCanManage(actor: Actor, p: { recruiterId: string | null }) {
  authorize(actor, "admission.manage");
  if (ownOnly(actor) && p.recruiterId && p.recruiterId !== actor.id) {
    throw new ForbiddenError("Este contratado está sob responsabilidade de outro recrutador.");
  }
}

export function canManageHire(actor: Actor, p: { recruiterId: string | null }) {
  if (!actor.permissions.has("admission.manage")) return false;
  return !ownOnly(actor) || !p.recruiterId || p.recruiterId === actor.id;
}

/** Tudo o que o sistema já sabe do contratado + a admissão. */
export async function getHire(actor: Actor, processId: string) {
  authorize(actor, "admission.view");
  const p = await db.candidateJob.findFirst({
    where: { AND: [{ id: processId }, hiresWhere(actor)] },
    include: {
      candidate: {
        include: {
          desiredPosition: { select: { name: true } },
          desiredStore: { select: { name: true } },
          owner: { select: { name: true } },
          tags: { include: { tag: true } },
          notes: { orderBy: { createdAt: "desc" }, take: 20, include: { author: { select: { name: true } } } },
          processes: { orderBy: { appliedAt: "desc" }, select: { id: true, status: true, appliedAt: true, job: { select: { title: true, store: { select: { name: true } } } }, stage: { select: { name: true } } } },
        },
      },
      job: { include: { store: true, position: { select: { name: true } } } },
      recruiter: { select: { id: true, name: true } },
      resume: { select: { id: true, fileName: true } },
      stage: { select: { name: true } },
      history: { orderBy: { movedAt: "asc" }, include: { toStage: { select: { name: true } }, fromStage: { select: { name: true } }, movedBy: { select: { name: true } } } },
      interviews: {
        orderBy: { scheduledAt: "desc" },
        include: { evaluations: { include: { evaluator: { select: { name: true } } } }, interviewer: { select: { name: true } } },
      },
      admission: {
        include: {
          linkCreatedBy: { select: { name: true } },
          files: { orderBy: { createdAt: "asc" }, include: { reviewedBy: { select: { name: true } } } },
        },
      },
    },
  });
  if (!p) throw new NotFoundError("Contratado não encontrado.");
  return { process: p, canManage: canManageHire(actor, p), link: p.admission?.tokenNonce ? admissionPath(p.admission.tokenNonce) : null };
}

/** Cria (ou renova) o link de documentos. O link anterior deixa de funcionar. */
export async function generateLink(actor: Actor, processId: string, ip?: string | null) {
  const p = await loadHire(actor, processId);
  assertCanManage(actor, p);
  if (p.admission?.status === "COMPLETED") throw new AppError("CONFLICT", "A admissão já foi concluída. Não é preciso enviar outro link.");
  const nonce = randomBytes(12).toString("base64url");
  const data = {
    tokenNonce: nonce, tokenHash: hashToken(tokenFromNonce(nonce)), tokenExpiresAt: addDays(new Date(), LINK_DAYS),
    linkCreatedAt: new Date(), linkCreatedById: actor.id,
  };
  await db.$transaction(async (tx) => {
    await tx.admission.upsert({ where: { candidateJobId: p.id }, update: data, create: { candidateJobId: p.id, ...data } });
    await audit(tx, {
      actorId: actor.id, action: p.admission ? "admission.link_renew" : "admission.link_create", entityType: "CandidateJob", entityId: p.id, ipAddress: ip,
      summary: `${p.admission ? "Gerou um novo" : "Gerou o"} link de documentos de admissão de ${p.candidate.fullName}`,
    });
  });
  return { path: admissionPath(nonce) };
}

export async function reviewFile(actor: Actor, fileId: string, decision: "APPROVED" | "REJECTED", reason: string | null, ip?: string | null) {
  const file = await db.admissionFile.findUnique({ where: { id: fileId }, include: { admission: true } });
  if (!file) throw new NotFoundError("Arquivo não encontrado.");
  const p = await loadHire(actor, file.admission.candidateJobId);
  assertCanManage(actor, p);
  if (file.admission.status === "COMPLETED") throw new AppError("CONFLICT", "A admissão já foi concluída.");
  const why = reason?.trim().slice(0, 300) || null;
  if (decision === "REJECTED" && !why) throw new ValidationError({ reason: ["Explique o motivo para o contratado corrigir."] });
  await db.$transaction(async (tx) => {
    await tx.admissionFile.update({ where: { id: fileId }, data: { status: decision, rejectionReason: decision === "REJECTED" ? why : null, reviewedById: actor.id, reviewedAt: new Date() } });
    await audit(tx, {
      actorId: actor.id, action: decision === "APPROVED" ? "admission.file_approve" : "admission.file_reject", entityType: "CandidateJob", entityId: p.id, ipAddress: ip,
      summary: `${decision === "APPROVED" ? "Aprovou" : "Devolveu"} o documento "${DOC_INFO[file.kind].label}" de ${p.candidate.fullName}`,
    });
  });
}

/**
 * Fecha a conferência. Com documento devolvido (ou recado), volta para o contratado corrigir pelo mesmo link;
 * sem pendências, conclui a admissão.
 */
export async function finishReview(actor: Actor, processId: string, note: string | null, ip?: string | null) {
  const p = await loadHire(actor, processId);
  assertCanManage(actor, p);
  const a = p.admission;
  if (!a || a.status === "PENDING") throw new AppError("CONFLICT", "O contratado ainda não enviou os documentos.");
  if (a.status === "COMPLETED") throw new AppError("CONFLICT", "A admissão já foi concluída.");
  const files = await db.admissionFile.findMany({ where: { admissionId: a.id } });
  const rejected = files.filter((f) => f.status === "REJECTED");
  const pendingReview = files.filter((f) => f.status === "PENDING");
  const msg = note?.trim().slice(0, 1000) || null;
  if (rejected.length || msg) {
    const expires = a.tokenExpiresAt && a.tokenExpiresAt > addDays(new Date(), 2) ? a.tokenExpiresAt : addDays(new Date(), LINK_DAYS);
    await db.$transaction(async (tx) => {
      await tx.admission.update({ where: { id: a.id }, data: { status: "CHANGES_REQUESTED", reviewNote: msg, tokenExpiresAt: expires } });
      await audit(tx, {
        actorId: actor.id, action: "admission.request_changes", entityType: "CandidateJob", entityId: p.id, ipAddress: ip,
        summary: `Devolveu a admissão de ${p.candidate.fullName} para correção (${rejected.length} documento(s))`,
      });
    });
    return { status: "CHANGES_REQUESTED" as const, path: a.tokenNonce ? admissionPath(a.tokenNonce) : null };
  }
  if (pendingReview.length) throw new ValidationError({ files: ["Aprove ou devolva todos os documentos antes de concluir."] });
  const missing = DOC_KINDS.filter((k) => DOC_INFO[k].required && !files.some((f) => f.kind === k && f.status === "APPROVED"));
  if (missing.length) throw new ValidationError({ files: [`Falta aprovar: ${missing.map((k) => DOC_INFO[k].label).join(", ")}.`] });
  await db.$transaction(async (tx) => {
    // Link desativado: depois de concluída, a página não aceita mais nada.
    await tx.admission.update({ where: { id: a.id }, data: { status: "COMPLETED", completedAt: new Date(), reviewNote: null, tokenHash: null, tokenNonce: null } });
    await audit(tx, { actorId: actor.id, action: "admission.complete", entityType: "CandidateJob", entityId: p.id, ipAddress: ip, summary: `Concluiu a admissão de ${p.candidate.fullName}` });
  });
  return { status: "COMPLETED" as const, path: null };
}

/** Reabre uma admissão concluída (ex.: faltou algo). Gera link novo. */
export async function reopenAdmission(actor: Actor, processId: string, ip?: string | null) {
  const p = await loadHire(actor, processId);
  assertCanManage(actor, p);
  if (p.admission?.status !== "COMPLETED") throw new AppError("CONFLICT", "Só é possível reabrir uma admissão concluída.");
  await db.admission.update({ where: { id: p.admission.id }, data: { status: "SUBMITTED", completedAt: null } });
  await audit(db, { actorId: actor.id, action: "admission.reopen", entityType: "CandidateJob", entityId: p.id, ipAddress: ip, summary: `Reabriu a admissão de ${p.candidate.fullName}` });
}

/** Acesso a um arquivo da admissão (registra quem abriu). */
export async function admissionFileAccess(actor: Actor, fileId: string, ip?: string | null) {
  authorize(actor, "admission.view");
  const file = await db.admissionFile.findUnique({ where: { id: fileId }, include: { admission: { select: { candidateJobId: true } } } });
  if (!file) throw new NotFoundError("Arquivo não encontrado.");
  const p = await loadHire(actor, file.admission.candidateJobId);
  await audit(db, {
    actorId: actor.id, action: "admission.file_view", entityType: "CandidateJob", entityId: p.id, ipAddress: ip,
    summary: `Abriu o documento "${DOC_INFO[file.kind].label}" de ${p.candidate.fullName}`,
  });
  return file;
}

// ───────── Página pública do contratado ─────────

export type PublicSession = { admissionId: string };

async function admissionByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null;
  const nonce = token.slice(0, 16);
  const given = Buffer.from(token.slice(16));
  const expected = Buffer.from(sign(nonce));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return db.admission.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      files: { orderBy: { createdAt: "asc" }, select: { id: true, kind: true, fileName: true, status: true, rejectionReason: true, sizeBytes: true, createdAt: true } },
      candidateJob: {
        select: {
          id: true, recruiterId: true,
          candidate: { select: { id: true, fullName: true, cpf: true, email: true, anonymizedAt: true } },
          job: { select: { title: true, store: { select: { name: true, city: true, state: true } } } },
        },
      },
    },
  });
}

export type PublicAdmission = NonNullable<Awaited<ReturnType<typeof admissionByToken>>>;

/** Estado do link para a página pública. */
export async function openAdmission(token: string) {
  const a = await admissionByToken(token);
  if (!a || a.candidateJob.candidate.anonymizedAt) return { state: "invalid" as const };
  if (!a.tokenExpiresAt || a.tokenExpiresAt < new Date()) return { state: "expired" as const };
  return { state: "ok" as const, admission: a };
}

// Sessão curta depois de confirmar o CPF: cookie assinado com o id da admissão.
const SESSION_MS = 2 * 60 * 60 * 1000;
export function sessionValue(admissionId: string, now = Date.now()) {
  const exp = String(now + SESSION_MS);
  return `${admissionId}.${exp}.${sign(`sess:${admissionId}:${exp}`)}`;
}
export function checkSession(value: string | undefined, admissionId: string, now = Date.now()): boolean {
  const [id, exp, sig] = (value ?? "").split(".");
  if (!id || !exp || !sig || id !== admissionId || Number(exp) < now) return false;
  const expected = Buffer.from(sign(`sess:${id}:${exp}`));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const rlKey = (v: string) => createHash("sha256").update(`nexo-rl:${v}`).digest("hex").slice(0, 32);
async function rateLimit(bucket: string, max: number, windowMs: number) {
  const n = await db.rateLimitHit.count({ where: { bucket, createdAt: { gte: new Date(Date.now() - windowMs) } } });
  if (n >= max) throw new AppError("RATE_LIMITED", "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.");
  await db.rateLimitHit.create({ data: { bucket } });
}

/** Confere o CPF do contratado. Sem CPF no cadastro, o informado (válido) passa a ser o do cadastro. */
export async function verifyIdentity(token: string, cpfInput: string, ip: string | null) {
  const o = await openAdmission(token);
  if (o.state !== "ok") throw new AppError("NOT_FOUND", "Este link não é mais válido. Peça um novo ao RH.");
  const a = o.admission;
  await rateLimit(`adm-cpf:${a.id}`, 8, 15 * 60 * 1000);
  await rateLimit(`adm-cpf-ip:${rlKey(ip ?? "?")}`, 20, 15 * 60 * 1000);
  if (!isValidCpf(cpfInput)) throw new ValidationError({ cpf: ["CPF inválido. Confira os números."] });
  const cpf = cpfDigits(cpfInput);
  const current = a.candidateJob.candidate.cpf;
  if (current && current !== cpf) throw new ValidationError({ cpf: ["O CPF não confere com o cadastro. Confira os números ou fale com o RH."] });
  await db.admission.update({ where: { id: a.id }, data: { lastOpenedAt: new Date() } });
  if (!current) await db.candidate.update({ where: { id: a.candidateJob.candidate.id }, data: { cpf } });
  return sessionValue(a.id);
}

async function editable(token: string, session: string | undefined) {
  const o = await openAdmission(token);
  if (o.state !== "ok") throw new AppError("NOT_FOUND", "Este link não é mais válido. Peça um novo ao RH.");
  if (!checkSession(session, o.admission.id)) throw new AppError("FORBIDDEN", "Sua sessão expirou. Recarregue a página e confirme o CPF de novo.");
  if (o.admission.status === "SUBMITTED" || o.admission.status === "COMPLETED") {
    throw new AppError("CONFLICT", "Seus documentos já foram enviados e estão em conferência.");
  }
  return o.admission;
}

// Assinaturas de arquivo aceitas (não confiamos na extensão nem no tipo informado pelo navegador).
function sniff(data: Buffer): { mime: string; ext: string } | null {
  const h = data.subarray(0, 12);
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (h.subarray(0, 4).toString("latin1") === "RIFF" && h.subarray(8, 12).toString("latin1") === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (h.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = h.subarray(8, 12).toString("latin1");
    if (/^(avif|avis)$/.test(brand)) return { mime: "image/avif", ext: "avif" };
    if (/^(heic|heix|heim|heis|hevc|hevx|hevm|hevs|mif1|msf1|heif)$/.test(brand)) return { mime: "image/heic", ext: "heic" };
  }
  if (h.subarray(0, 4).toString("latin1") === "GIF8") return { mime: "image/gif", ext: "gif" };
  if (h[0] === 0x42 && h[1] === 0x4d) return { mime: "image/bmp", ext: "bmp" };
  if ((h[0] === 0x49 && h[1] === 0x49 && h[2] === 0x2a && h[3] === 0x00) || (h[0] === 0x4d && h[1] === 0x4d && h[2] === 0x00 && h[3] === 0x2a)) return { mime: "image/tiff", ext: "tiff" };
  if (data.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  return null;
}

export type UploadFile = { name: string; data: Buffer };

export async function uploadAdmissionFile(token: string, session: string | undefined, kind: string, file: UploadFile, ip: string | null) {
  const a = await editable(token, session);
  if (!DOC_KINDS.includes(kind as AdmissionDocKind)) throw new ValidationError({ file: ["Tipo de documento inválido."] });
  const k = kind as AdmissionDocKind;
  await rateLimit(`adm-up:${a.id}`, 60, 60 * 60 * 1000);
  await rateLimit(`adm-up-ip:${rlKey(ip ?? "?")}`, 120, 60 * 60 * 1000);
  if (!file.data.length) throw new ValidationError({ file: ["O arquivo está vazio."] });
  if (file.data.length > MAX_DOC_BYTES) throw new ValidationError({ file: ["O arquivo deve ter no máximo 4 MB."] });
  const type = sniff(file.data);
  if (!type) throw new ValidationError({ file: ["Formato não reconhecido. Envie uma foto (JPG, PNG, HEIC, WEBP, GIF…) ou um PDF."] });
  if (DOC_INFO[k].imageOnly && type.mime === "application/pdf") throw new ValidationError({ file: ["Para a selfie, envie uma foto."] });
  if (type.mime === "application/pdf") {
    const sample = file.data.subarray(0, Math.min(file.data.length, 2 * 1024 * 1024)).toString("latin1");
    if (/\/JavaScript|\/JS\s*[(<]|\/Launch/.test(sample)) throw new ValidationError({ file: ["Este PDF contém conteúdo executável e foi recusado."] });
  }
  const active = a.files.filter((f) => f.kind === k && f.status !== "REJECTED").length;
  if (active >= MAX_FILES_PER_KIND) throw new ValidationError({ file: [`No máximo ${MAX_FILES_PER_KIND} arquivos para este documento. Remova um para enviar outro.`] });
  const driver = storage();
  if (!driver) throw new AppError("INTERNAL", "O envio de arquivos está indisponível no momento. Tente mais tarde.");
  const key = `admissao/${a.id}/${randomUUID()}.${type.ext}`;
  await driver.put(key, file.data, type.mime);
  const base = file.name.replace(/\.[^.]*$/, "").replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 80) || "documento";
  try {
    return await db.admissionFile.create({
      data: { admissionId: a.id, kind: k, storageKey: key, fileName: `${base}.${type.ext}`, mimeType: type.mime, sizeBytes: file.data.length, sha256: sha256(file.data) },
      select: { id: true, kind: true, fileName: true, status: true, rejectionReason: true, sizeBytes: true, createdAt: true },
    });
  } catch (e) {
    await driver.remove(key).catch(() => {});
    throw e;
  }
}

export async function removeAdmissionFile(token: string, session: string | undefined, fileId: string) {
  const a = await editable(token, session);
  const f = await db.admissionFile.findFirst({ where: { id: fileId, admissionId: a.id } });
  if (!f) throw new NotFoundError("Arquivo não encontrado.");
  if (f.status === "APPROVED") throw new AppError("FORBIDDEN", "Este documento já foi aprovado pelo RH e não pode ser removido.");
  await db.admissionFile.delete({ where: { id: f.id } });
  await storage()?.remove(f.storageKey).catch(() => {});
}

// Campos digitados. No rascunho tudo é opcional; ao enviar, os obrigatórios são cobrados.
const text = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`).optional().transform((v) => v || null);
const isoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && v >= "1900-01-01" && v <= new Date().toISOString().slice(0, 10);

const personSchema = z.object({ name: z.string().trim().max(120), cpf: z.string().trim().max(14), birthDate: z.string().trim().max(10) });

const dataSchema = z.object({
  email: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email("E-mail inválido."))]).optional().transform((v) => v || null),
  race: text(60),
  uniformSize: text(30),
  education: text(120),
  pisNis: z.string().optional().transform((v, ctx) => {
    const d = (v ?? "").replace(/\D/g, "");
    if (!d) return null;
    if (d.length !== 11) {
      ctx.addIssue({ code: "custom", message: "O PIS/NIS tem 11 números." });
      return z.NEVER;
    }
    return d;
  }),
  maritalStatus: text(40),
  children: z.array(personSchema).max(15).default([]),
  spouseName: text(120),
  spouseCpf: text(14),
  spouseBirthDate: text(10),
  needsTransport: z.enum(["sim", "nao", ""]).optional().transform((v) => (v === "sim" ? true : v === "nao" ? false : null)),
  busesPerDay: z.string().optional().transform((v, ctx) => {
    if (!v?.trim()) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 12) {
      ctx.addIssue({ code: "custom", message: "Informe quantos ônibus por dia (1 a 12)." });
      return z.NEVER;
    }
    return n;
  }),
  transportDailyCost: z.string().optional().transform((v, ctx) => {
    if (!v?.trim()) return null;
    const n = Number(v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0 || n > 500) {
      ctx.addIssue({ code: "custom", message: "Informe o valor total por dia, ex.: 11,00." });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  }),
  bankAccount: text(30),
  bankBranch: text(10),
  pixKey: text(120),
  privacy: z.string().optional().transform((v) => v === "on"),
});
export type AdmissionDataInput = z.input<typeof dataSchema>;
const familySchema = dataSchema.pick({ children: true, spouseName: true, spouseCpf: true, spouseBirthDate: true });

function strictChecks(d: z.output<typeof dataSchema>, files: { kind: AdmissionDocKind; status: string }[]) {
  const errors: Record<string, string[]> = {};
  const need = (k: keyof typeof d, msg: string) => {
    if (d[k] === null || d[k] === undefined || d[k] === "") errors[k] = [msg];
  };
  need("email", "Informe seu e-mail.");
  need("race", "Informe sua raça/cor.");
  need("uniformSize", "Informe o tamanho do uniforme.");
  need("education", "Informe seu grau de escolaridade.");
  need("pisNis", "Informe seu PIS/NIS (11 números).");
  need("maritalStatus", "Informe seu estado civil.");
  need("needsTransport", "Responda se vai precisar de vale-transporte.");
  if (d.needsTransport) {
    need("busesPerDay", "Informe quantos ônibus por dia.");
    need("transportDailyCost", "Informe o valor total por dia.");
  }
  need("bankAccount", "Informe o número da conta Santander.");
  need("bankBranch", "Informe a agência.");
  need("pixKey", "Informe a chave Pix.");
  if (!d.privacy) errors.privacy = ["É preciso concordar com o uso dos dados para a admissão."];
  for (const k of DOC_KINDS) {
    if (DOC_INFO[k].required && !files.some((f) => f.kind === k && f.status !== "REJECTED")) errors[`doc_${k}`] = ["Envie este documento."];
  }
  return errors;
}

/** Validações de filhos e cônjuge valem também no rascunho (o que foi digitado precisa estar certo). */
function familyChecks(d: z.output<typeof familySchema>) {
  const errors: Record<string, string[]> = {};
  const children: { name: string; cpf: string; birthDate: string }[] = [];
  d.children.forEach((c, i) => {
    if (!c.name && !c.cpf && !c.birthDate) return;
    const msgs: string[] = [];
    if (c.name.length < 3) msgs.push("nome");
    if (!isValidCpf(c.cpf)) msgs.push("CPF válido");
    if (!isoDate(c.birthDate)) msgs.push("data de nascimento");
    if (msgs.length) errors[`child_${i}`] = [`Filho(a) ${i + 1}: informe ${msgs.join(", ")}.`];
    children.push({ name: c.name, cpf: cpfDigits(c.cpf), birthDate: c.birthDate });
  });
  const anySpouse = d.spouseName || d.spouseCpf || d.spouseBirthDate;
  if (anySpouse) {
    if (!d.spouseName || d.spouseName.length < 3) errors.spouseName = ["Informe o nome do cônjuge."];
    if (!isValidCpf(d.spouseCpf)) errors.spouseCpf = ["CPF do cônjuge inválido."];
    if (!d.spouseBirthDate || !isoDate(d.spouseBirthDate)) errors.spouseBirthDate = ["Data de nascimento inválida."];
  }
  return { errors, children };
}

export async function saveAdmissionData(token: string, session: string | undefined, raw: AdmissionDataInput, submit: boolean, meta: { ip: string | null; userAgent: string | null }) {
  const a = await editable(token, session);
  const parsed = dataSchema.safeParse(raw);
  if (!parsed.success) {
    // Mostra também os erros de filhos/cônjuge de uma vez, não só os do primeiro problema.
    const family = familySchema.safeParse(raw);
    throw new ValidationError({ ...(family.success ? familyChecks(family.data).errors : {}), ...fieldErrorsOf(parsed.error) });
  }
  const d = parsed.data;
  const fam = familyChecks(d);
  const errors = { ...fam.errors, ...(submit ? strictChecks(d, a.files) : {}) };
  if (Object.keys(errors).length) throw new ValidationError(errors);

  const data = {
    email: d.email, race: d.race, uniformSize: d.uniformSize, education: d.education, pisNis: d.pisNis, maritalStatus: d.maritalStatus,
    children: fam.children, spouseName: d.spouseName, spouseCpf: d.spouseCpf ? cpfDigits(d.spouseCpf) : null, spouseBirthDate: d.spouseBirthDate,
    needsTransport: d.needsTransport, busesPerDay: d.needsTransport ? d.busesPerDay : null, transportDailyCost: d.needsTransport ? d.transportDailyCost : null,
    bankAccount: d.bankAccount, bankBranch: d.bankBranch, pixKey: d.pixKey,
  };
  if (!submit) {
    await db.admission.update({ where: { id: a.id }, data });
    return { submitted: false };
  }
  const cj = a.candidateJob;
  await db.$transaction(async (tx) => {
    await tx.admission.update({
      where: { id: a.id },
      data: { ...data, status: "SUBMITTED", submittedAt: new Date(), privacyAcceptedAt: new Date(), ipAddress: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null },
    });
    if (!cj.candidate.email && d.email) await tx.candidate.update({ where: { id: cj.candidate.id }, data: { email: d.email } });
    const notify = [...new Set([cj.recruiterId, a.linkCreatedById].filter((v): v is string => !!v))];
    if (notify.length) {
      await tx.notification.createMany({
        data: notify.map((userId) => ({
          userId, type: "SYSTEM" as const, title: `Documentos de admissão enviados: ${cj.candidate.fullName}`,
          body: `${cj.job.title} · ${cj.job.store.name}. Confira e aprove.`, link: `/contratados/${cj.id}`,
        })),
      });
    }
    await audit(tx, {
      actorId: null, action: "admission.submit", entityType: "CandidateJob", entityId: cj.id, ipAddress: meta.ip,
      summary: `${cj.candidate.fullName} enviou os documentos de admissão`,
    });
  });
  // Arquivos devolvidos e substituídos não servem mais: saem do armazenamento.
  const old = await db.admissionFile.findMany({ where: { admissionId: a.id, status: "REJECTED" } });
  const replaced = old.filter((f) => a.files.some((n) => n.kind === f.kind && n.status === "PENDING"));
  if (replaced.length) {
    await db.admissionFile.deleteMany({ where: { id: { in: replaced.map((f) => f.id) } } });
    for (const f of replaced) await storage()?.remove(f.storageKey).catch(() => {});
  }
  return { submitted: true };
}
