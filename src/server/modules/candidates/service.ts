import "server-only";
import { ensureDefaultRules, onStageEntered } from "@/server/modules/automations/service";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CandidateSource, Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { authorize, canAccessStore, type Actor } from "@/server/authz/authorize";
import { canEditCandidate, canEditJob, visibleCandidatesWhere, visibleJobsWhere } from "@/server/authz/scopes";
import { ROLES } from "@/server/authz/catalog";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/modules/users/schemas";
import { getCompanySettings } from "@/server/modules/settings/service";
import { sha256, storage, validatePdf } from "@/server/storage";
import { digitsOnly, toE164BR } from "@/lib/phone";
import { cpfDigits, isValidCpf } from "@/lib/cpf";
import { addDays } from "@/lib/period";

export const SOURCE_LABEL: Record<CandidateSource, string> = {
  ONLINE_FORM: "Site", MANUAL: "Cadastro manual", REFERRAL: "Indicação", WHATSAPP: "WhatsApp",
  JOB_BOARD: "Site de vagas", SOCIAL_MEDIA: "Redes sociais", OTHER: "Outra",
};

const UF = /^[A-Z]{2}$/;
const phoneField = (label: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v?.trim()) return null;
      const e = toE164BR(v);
      if (!e) {
        ctx.addIssue({ code: "custom", message: `${label} inválido. Use DDD + número.` });
        return z.NEVER;
      }
      return e;
    });

const candidateSchema = z
  .object({
    fullName: z.string().trim().min(3, "Informe o nome completo.").max(120),
    cpf: z.string().optional().transform((v, ctx) => {
      if (!cpfDigits(v)) return null;
      if (!isValidCpf(v)) {
        ctx.addIssue({ code: "custom", message: "CPF inválido. Confira os números." });
        return z.NEVER;
      }
      return cpfDigits(v);
    }),
    phone: phoneField("Telefone"),
    whatsapp: phoneField("WhatsApp"),
    sameWhatsapp: z.string().optional().transform((v) => v === "on"),
    email: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email("E-mail inválido."))]).optional().transform((v) => v || null),
    city: z.string().trim().max(80).optional().transform((v) => v || null),
    state: z.string().trim().toUpperCase().optional().transform((v) => v || null).refine((v) => v === null || UF.test(v), "UF inválida."),
    address: z.string().trim().max(200).optional().transform((v) => v || null),
    desiredPositionId: z.string().optional().transform((v) => v || null),
    desiredStoreId: z.string().optional().transform((v) => v || null),
    source: z.enum(Object.keys(SOURCE_LABEL) as [CandidateSource, ...CandidateSource[]]),
    experience: z.string().trim().max(5000).optional().transform((v) => v || null),
    introduction: z.string().trim().max(5000).optional().transform((v) => v || null),
    ownerId: z.string().optional().transform((v) => v || null),
    consent: z.string().optional().transform((v) => v === "on"),
  })
  .refine((v) => v.phone || v.whatsapp || v.email, { path: ["phone"], message: "Informe ao menos um contato: telefone, WhatsApp ou e-mail." });

export type CandidateInput = z.input<typeof candidateSchema>;

// ───────── Busca ─────────

export type CandidateFilters = {
  q?: string; storeId?: string; positionId?: string; stage?: string; city?: string; experience?: string; tag?: string;
  mine?: boolean; talentPool?: boolean; page?: number;
};
const PAGE = 30;

function searchWhere(actor: Actor, f: CandidateFilters): Prisma.CandidateWhereInput {
  const and: Prisma.CandidateWhereInput[] = [visibleCandidatesWhere(actor)];
  const q = f.q?.trim();
  if (q) {
    const digits = digitsOnly(q);
    if (q.includes("@")) and.push({ email: { contains: q.toLowerCase() } });
    else if (digits.length >= 4 && digits.length >= q.replace(/\s/g, "").length - 4) {
      and.push({ OR: [{ phoneE164: { contains: digits } }, { whatsappE164: { contains: digits } }, ...(digits.length >= 6 ? [{ cpf: { contains: digits } }] : [])] });
    } else {
      and.push({ OR: [{ fullName: { contains: q, mode: "insensitive" } }, { email: { contains: q.toLowerCase() } }] });
    }
  }
  if (f.storeId) and.push({ OR: [{ desiredStoreId: f.storeId }, { processes: { some: { job: { storeId: f.storeId } } } }] });
  if (f.positionId) and.push({ OR: [{ desiredPositionId: f.positionId }, { processes: { some: { job: { positionId: f.positionId } } } }] });
  if (f.stage === "sem-processo") and.push({ processes: { none: {} } });
  else if (f.stage) and.push({ processes: { some: { stage: { key: f.stage }, status: f.stage === "hired" ? "HIRED" : undefined } } });
  if (f.city?.trim()) and.push({ city: { contains: f.city.trim(), mode: "insensitive" } });
  if (f.experience?.trim()) and.push({ experience: { contains: f.experience.trim(), mode: "insensitive" } });
  if (f.tag) and.push({ tags: { some: { tagId: f.tag } } });
  if (f.mine) and.push({ OR: [{ ownerId: actor.id }, { processes: { some: { recruiterId: actor.id } } }] });
  if (f.talentPool) and.push({ inTalentPool: true });
  return { AND: and };
}

export async function searchCandidates(actor: Actor, f: CandidateFilters = {}) {
  authorize(actor, f.talentPool ? "talentpool.view" : "candidates.view");
  const where = searchWhere(actor, f);
  const page = Math.max(1, f.page ?? 1);
  const [items, total] = await Promise.all([
    db.candidate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: {
        id: true, fullName: true, phoneE164: true, whatsappE164: true, email: true, city: true, state: true, source: true, createdAt: true, ownerId: true,
        updatedAt: true, retentionUntil: true, inTalentPool: true, experience: true,
        desiredPosition: { select: { name: true } },
        desiredStore: { select: { name: true } },
        owner: { select: { id: true, name: true } },
        tags: { select: { tag: { select: { id: true, name: true } } } },
        attachments: { where: { deletedAt: null, kind: "RESUME" }, select: { id: true }, take: 1 },
        processes: {
          orderBy: { lastMovedAt: "desc" },
          select: { id: true, status: true, recruiterId: true, stage: { select: { key: true, name: true } }, job: { select: { id: true, title: true, store: { select: { name: true } } } } },
        },
      },
    }),
    db.candidate.count({ where }),
  ]);
  return { items: items.map((c) => ({ ...c, canEdit: canEditCandidate(actor, c) })), total, page, pageCount: Math.max(1, Math.ceil(total / PAGE)) };
}

// ───────── Duplicidade ─────────

export type DuplicateHit = { id: string | null; fullName: string | null; matchedBy: ("CPF" | "telefone" | "e-mail")[]; visible: boolean };

/** Possíveis duplicados por telefone/WhatsApp ou e-mail. Fora do acesso do usuário, mostra só que existe. */
export async function findDuplicates(actor: Actor, input: { cpf?: string; phone?: string; whatsapp?: string; email?: string; excludeId?: string }): Promise<DuplicateHit[]> {
  authorize(actor, "candidates.view");
  const phones = [toE164BR(input.phone), toE164BR(input.whatsapp)].filter((p): p is string => !!p);
  const email = input.email?.trim().toLowerCase();
  const or: Prisma.CandidateWhereInput[] = [];
  const cpf = isValidCpf(input.cpf) ? cpfDigits(input.cpf) : null;
  if (cpf) or.push({ cpf });
  if (phones.length) or.push({ phoneE164: { in: phones } }, { whatsappE164: { in: phones } });
  if (email && email.includes("@")) or.push({ email });
  if (!or.length) return [];
  const found = await db.candidate.findMany({
    where: { anonymizedAt: null, OR: or, ...(input.excludeId ? { id: { not: input.excludeId } } : {}) },
    select: { id: true, fullName: true, cpf: true, phoneE164: true, whatsappE164: true, email: true },
    take: 5,
  });
  if (!found.length) return [];
  const visibleIds = new Set(
    (await db.candidate.findMany({ where: { AND: [{ id: { in: found.map((f) => f.id) } }, visibleCandidatesWhere(actor)] }, select: { id: true } })).map((c) => c.id),
  );
  return found.map((c) => {
    const matchedBy: DuplicateHit["matchedBy"] = [];
    if (cpf && c.cpf === cpf) matchedBy.push("CPF");
    if (phones.some((p) => p === c.phoneE164 || p === c.whatsappE164)) matchedBy.push("telefone");
    if (email && c.email === email) matchedBy.push("e-mail");
    const visible = visibleIds.has(c.id);
    return { id: visible ? c.id : null, fullName: visible ? c.fullName : null, matchedBy, visible };
  });
}

// ───────── Cadastro e edição ─────────

async function validateCandidateRefs(actor: Actor, d: { desiredStoreId: string | null; desiredPositionId: string | null; ownerId: string | null }) {
  if (d.desiredStoreId) {
    const exists = await db.store.findUnique({ where: { id: d.desiredStoreId }, select: { id: true } });
    if (!exists) throw new ValidationError({ desiredStoreId: ["Loja não encontrada."] });
  }
  if (d.desiredPositionId && !(await db.position.findUnique({ where: { id: d.desiredPositionId }, select: { id: true } }))) {
    throw new ValidationError({ desiredPositionId: ["Cargo não encontrado."] });
  }
  if (d.ownerId && !(await db.user.findFirst({ where: { id: d.ownerId, status: "ACTIVE" }, select: { id: true } }))) {
    throw new ValidationError({ ownerId: ["Responsável não encontrado."] });
  }
  // Quem não vê todas as lojas precisa deixar o candidato visível para si (loja autorizada ou responsável).
  if (!actor.allStores && !(d.desiredStoreId && canAccessStore(actor, d.desiredStoreId)) && d.ownerId !== actor.id) {
    throw new ValidationError({ desiredStoreId: ["Escolha uma das suas lojas ou fique como responsável pelo candidato."] });
  }
}

async function retentionDate() {
  const s = await getCompanySettings();
  return addDays(new Date(), s.retentionDays);
}

export type ResumeFile = { name: string; type: string; data: Buffer };

export type PreparedResume = { key: string; fileName: string; sizeBytes: number; sha256: string };

/** Valida e envia o PDF ANTES da transação (envio lento não segura o banco). */
export async function prepareResume(file: ResumeFile): Promise<PreparedResume> {
  const problem = validatePdf(file.data);
  if (problem) throw new ValidationError({ resume: [problem] });
  const driver = storage();
  if (!driver) throw new AppError("VALIDATION", "O armazenamento de currículos ainda não foi configurado. Salve sem currículo e anexe depois.", { resume: ["Armazenamento não configurado."] });
  const key = `curriculos/${randomUUID()}.pdf`;
  await driver.put(key, file.data, "application/pdf");
  const safeName = file.name.replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 120) || "curriculo.pdf";
  return { key, fileName: safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`, sizeBytes: file.data.length, sha256: sha256(file.data) };
}

export function attachResume(tx: Tx, uploadedById: string | null, candidateId: string, r: PreparedResume) {
  return tx.attachment.create({
    data: { candidateId, kind: "RESUME", storageKey: r.key, fileName: r.fileName, mimeType: "application/pdf", sizeBytes: r.sizeBytes, sha256: r.sha256, uploadedById },
  });
}

/** Se a gravação no banco falhar, o arquivo já enviado é apagado. */
export async function withUploadedResume<T>(file: ResumeFile | null | undefined, fn: (r: PreparedResume | null) => Promise<T>): Promise<T> {
  const r = file ? await prepareResume(file) : null;
  try {
    return await fn(r);
  } catch (e) {
    if (r) await storage()?.remove(r.key).catch(() => {});
    throw e;
  }
}

export async function createCandidate(actor: Actor, raw: CandidateInput, opts: { resume?: ResumeFile | null; jobId?: string | null; ip?: string | null } = {}) {
  authorize(actor, "candidates.create");
  const parsed = candidateSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  const { phone, whatsapp, sameWhatsapp, consent, ...d } = parsed.data;
  if (!d.ownerId && ROLES[actor.roleKey].ownRecordsOnly) d.ownerId = actor.id;
  if (!d.ownerId && !actor.allStores && !d.desiredStoreId) d.ownerId = actor.id;
  await validateCandidateRefs(actor, d);
  const job = opts.jobId ? await db.job.findFirst({ where: { AND: [{ id: opts.jobId }, visibleJobsWhere(actor)] } }) : null;
  if (opts.jobId && !job) throw new ValidationError({ jobId: ["Vaga não encontrada."] });
  const settings = await getCompanySettings();
  if (job) await ensureDefaultRules();

  return withUploadedResume(opts.resume, (resume) => db.$transaction(async (tx) => {
    const c = await tx.candidate.create({
      data: {
        ...d, phoneE164: phone, whatsappE164: whatsapp ?? (sameWhatsapp ? phone : null),
        retentionUntil: addDays(new Date(), settings.retentionDays), inTalentPool: true,
      },
    });
    if (consent) {
      await tx.candidateConsent.createMany({
        data: (["RECRUITMENT_PROCESS", "TALENT_POOL", "WHATSAPP_CONTACT"] as const).map((purpose) => ({
          candidateId: c.id, purpose, policyVersion: settings.privacyVersion ?? "sem-versao", source: "MANUAL" as const, ipAddress: opts.ip ?? null,
        })),
      });
    }
    if (resume) await attachResume(tx, actor.id, c.id, resume);
    await audit(tx, {
      actorId: actor.id, action: "candidate.create", entityType: "Candidate", entityId: c.id, storeId: d.desiredStoreId, ipAddress: opts.ip,
      summary: `Cadastrou o candidato ${c.fullName}`,
    });
    if (job) await linkInTx(tx, actor, c.id, c.fullName, job, opts.ip);
    return c;
  }));
}

async function loadCandidateForEdit(actor: Actor, id: string) {
  const c = await db.candidate.findFirst({
    where: { AND: [{ id }, visibleCandidatesWhere(actor)] },
    include: { processes: { select: { recruiterId: true } } },
  });
  if (!c) throw new NotFoundError("Candidato não encontrado.");
  if (!canEditCandidate(actor, c)) throw new ForbiddenError("Este candidato está sob responsabilidade de outro recrutador.");
  return c;
}

export async function updateCandidate(actor: Actor, id: string, raw: CandidateInput, ip?: string | null) {
  authorize(actor, "candidates.update");
  const before = await loadCandidateForEdit(actor, id);
  const parsed = candidateSchema.safeParse({ ...raw, consent: undefined });
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  const { phone, whatsapp, sameWhatsapp, consent: _c, ...d } = parsed.data;
  // Recrutador não passa o candidato para outra pessoa; a gestão de RH pode.
  if (ROLES[actor.roleKey].ownRecordsOnly && d.ownerId !== before.ownerId && d.ownerId !== actor.id) d.ownerId = before.ownerId;
  await validateCandidateRefs(actor, d);
  const retentionUntil = await retentionDate();
  return db.$transaction(async (tx) => {
    const c = await tx.candidate.update({
      where: { id },
      data: { ...d, phoneE164: phone, whatsappE164: whatsapp ?? (sameWhatsapp ? phone : null), retentionUntil },
    });
    await audit(tx, {
      actorId: actor.id, action: "candidate.update", entityType: "Candidate", entityId: id, storeId: c.desiredStoreId, ipAddress: ip,
      summary: `Atualizou o cadastro de ${c.fullName}`,
      before: { fullName: before.fullName, phone: before.phoneE164, email: before.email, ownerId: before.ownerId, desiredStoreId: before.desiredStoreId },
      after: { fullName: c.fullName, phone: c.phoneE164, email: c.email, ownerId: c.ownerId, desiredStoreId: c.desiredStoreId },
    });
    return c;
  });
}

export async function uploadResume(actor: Actor, id: string, file: ResumeFile, ip?: string | null) {
  authorize(actor, "candidates.update");
  const c = await loadCandidateForEdit(actor, id);
  const old = await db.attachment.findMany({ where: { candidateId: id, kind: "RESUME", deletedAt: null } });
  const retentionUntil = await retentionDate();
  await withUploadedResume(file, (r) => db.$transaction(async (tx) => {
    await attachResume(tx, actor.id, id, r!);
    await tx.attachment.updateMany({ where: { id: { in: old.map((o) => o.id) } }, data: { deletedAt: new Date() } });
    await tx.candidate.update({ where: { id }, data: { retentionUntil } });
    await audit(tx, { actorId: actor.id, action: "candidate.resume", entityType: "Candidate", entityId: id, storeId: c.desiredStoreId, ipAddress: ip, summary: `Anexou currículo de ${c.fullName}` });
  }));
  // O arquivo antigo sai do armazenamento depois que o novo está salvo.
  for (const o of old) await storage()?.remove(o.storageKey).catch(() => {});
}

// ───────── Perfil ─────────

export async function getCandidateProfile(actor: Actor, id: string) {
  authorize(actor, "candidates.view");
  const c = await db.candidate.findFirst({
    where: { AND: [{ id }, visibleCandidatesWhere(actor)] },
    include: {
      desiredPosition: { select: { id: true, name: true } },
      desiredStore: { select: { id: true, name: true, city: true } },
      owner: { select: { id: true, name: true } },
      tags: { select: { tag: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      notes: { orderBy: { createdAt: "desc" }, select: { id: true, body: true, createdAt: true, author: { select: { name: true } } } },
      attachments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, sizeBytes: true, createdAt: true, kind: true } },
      consents: { orderBy: { grantedAt: "desc" }, select: { id: true, purpose: true, policyVersion: true, source: true, grantedAt: true, revokedAt: true } },
      processes: {
        orderBy: { appliedAt: "desc" },
        select: {
          id: true, status: true, appliedAt: true, lastMovedAt: true, source: true, recruiterId: true,
          salaryExpectation: true, currentlyEmployed: true, applicantMessage: true,
          resume: { select: { id: true, fileName: true, deletedAt: true } },
          job: { select: { id: true, title: true, status: true, store: { select: { name: true } } } },
          stage: { select: { key: true, name: true } },
          recruiter: { select: { name: true } },
          history: { orderBy: { movedAt: "desc" }, select: { id: true, movedAt: true, note: true, fromStage: { select: { name: true } }, toStage: { select: { name: true } }, movedBy: { select: { name: true } } } },
          interviews: {
            orderBy: { scheduledAt: "desc" },
            select: { id: true, scheduledAt: true, mode: true, status: true, interviewer: { select: { name: true } }, evaluations: { select: { id: true, overall: true, recommendation: true, comments: true, evaluator: { select: { name: true } }, createdAt: true } } },
          },
        },
      },
      conversations: { select: { id: true, lastMessageAt: true, lastMessageText: true, _count: { select: { messages: true } } } },
    },
  });
  if (!c) throw new NotFoundError("Candidato não encontrado.");
  return {
    candidate: c,
    canEdit: canEditCandidate(actor, c),
    canViewResume: actor.permissions.has("resumes.view"),
    canManagePool: actor.permissions.has("talentpool.manage") && canEditCandidate({ ...actor, permissions: new Set([...actor.permissions, "candidates.update"]) }, c),
    canAnonymize: actor.permissions.has("privacy.manage"),
    canLink: actor.permissions.has("candidates.update"),
  };
}

export async function candidateFormOptions(actor: Actor) {
  const [stores, positions, owners] = await Promise.all([
    db.store.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, city: true }, orderBy: { name: "asc" } }),
    db.position.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { status: "ACTIVE", role: { key: { in: ["RECRUITER", "HR_MANAGER", "ADMIN"] } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  // Lojas: todas aparecem como "loja desejada" (o candidato pode querer qualquer uma),
  // mas quem não vê todas precisa escolher uma das suas ou ficar como responsável.
  return { stores, positions, owners, myStoreIds: actor.allStores ? null : actor.storeIds };
}

// ───────── Observações, etiquetas, responsável, banco de talentos ─────────

export async function addNote(actor: Actor, id: string, body: string, ip?: string | null) {
  authorize(actor, "candidates.update");
  const c = await loadCandidateForEdit(actor, id);
  const text = body.trim();
  if (text.length < 2) throw new ValidationError({ body: ["Escreva a observação."] });
  if (text.length > 4000) throw new ValidationError({ body: ["Máximo de 4.000 caracteres."] });
  const retentionUntil = await retentionDate();
  await db.$transaction(async (tx) => {
    await tx.candidateNote.create({ data: { candidateId: id, authorId: actor.id, body: text } });
    await tx.candidate.update({ where: { id }, data: { retentionUntil } });
    await audit(tx, { actorId: actor.id, action: "candidate.note", entityType: "Candidate", entityId: id, storeId: c.desiredStoreId, ipAddress: ip, summary: `Registrou observação em ${c.fullName}` });
  });
}

export async function addTag(actor: Actor, id: string, name: string) {
  authorize(actor, "talentpool.manage");
  const c = await loadCandidateForEdit({ ...actor, permissions: new Set([...actor.permissions, "candidates.update"]) }, id);
  const tagName = name.trim().replace(/\s+/g, " ");
  if (tagName.length < 2 || tagName.length > 30) throw new ValidationError({ tag: ["A etiqueta deve ter de 2 a 30 caracteres."] });
  const existing = await db.tag.findFirst({ where: { name: { equals: tagName, mode: "insensitive" } } });
  const tag = existing ?? (await db.tag.create({ data: { name: tagName } }));
  await db.candidateTag.upsert({ where: { candidateId_tagId: { candidateId: id, tagId: tag.id } }, update: {}, create: { candidateId: id, tagId: tag.id } });
  await audit(db, { actorId: actor.id, action: "candidate.tag", entityType: "Candidate", entityId: id, storeId: c.desiredStoreId, summary: `Etiquetou ${c.fullName} como "${tag.name}"` });
}

export async function removeTag(actor: Actor, id: string, tagId: string) {
  authorize(actor, "talentpool.manage");
  await loadCandidateForEdit({ ...actor, permissions: new Set([...actor.permissions, "candidates.update"]) }, id);
  await db.candidateTag.deleteMany({ where: { candidateId: id, tagId } });
}

export async function listTags() {
  return db.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { candidates: true } } } });
}

/** Recrutador assume candidato sem responsável; a gestão de RH define qualquer responsável. */
export async function setOwner(actor: Actor, id: string, ownerId: string | null, ip?: string | null) {
  authorize(actor, "candidates.update");
  const c = await loadCandidateForEdit(actor, id);
  if (ROLES[actor.roleKey].ownRecordsOnly && ownerId !== actor.id) throw new ForbiddenError("Você só pode assumir o candidato para si.");
  const owner = ownerId ? await db.user.findFirst({ where: { id: ownerId, status: "ACTIVE" }, select: { name: true } }) : null;
  if (ownerId && !owner) throw new ValidationError({ ownerId: ["Responsável não encontrado."] });
  await db.$transaction(async (tx) => {
    await tx.candidate.update({ where: { id }, data: { ownerId } });
    await audit(tx, { actorId: actor.id, action: "candidate.owner", entityType: "Candidate", entityId: id, storeId: c.desiredStoreId, ipAddress: ip, summary: owner ? `Definiu ${owner.name} como responsável por ${c.fullName}` : `Removeu o responsável de ${c.fullName}` });
  });
}

export async function setTalentPool(actor: Actor, id: string, inTalentPool: boolean) {
  authorize(actor, "talentpool.manage");
  const c = await loadCandidateForEdit({ ...actor, permissions: new Set([...actor.permissions, "candidates.update"]) }, id);
  const retentionUntil = await retentionDate();
  await db.$transaction(async (tx) => {
    await tx.candidate.update({ where: { id }, data: { inTalentPool, ...(inTalentPool ? { retentionUntil } : {}) } });
    await audit(tx, { actorId: actor.id, action: inTalentPool ? "talentpool.add" : "talentpool.remove", entityType: "Candidate", entityId: id, storeId: c.desiredStoreId, summary: `${inTalentPool ? "Incluiu" : "Retirou"} ${c.fullName} ${inTalentPool ? "no" : "do"} banco de talentos` });
  });
}

// ───────── Vínculo com vaga ─────────

async function linkInTx(tx: Tx, actor: Actor, candidateId: string, candidateName: string, job: { id: string; title: string; status: string; storeId: string; recruiterId: string | null }, ip?: string | null) {
  if (job.status !== "OPEN") throw new ValidationError({ jobId: ["Só é possível vincular candidatos a vagas abertas."] });
  const applied = await tx.recruitmentStage.findUniqueOrThrow({ where: { key: "applied" } });
  const exists = await tx.candidateJob.findUnique({ where: { candidateId_jobId: { candidateId, jobId: job.id } } });
  if (exists) throw new ValidationError({ jobId: ["Este candidato já está nesta vaga."] });
  const recruiterId = job.recruiterId ?? (ROLES[actor.roleKey].ownRecordsOnly ? actor.id : null);
  const p = await tx.candidateJob.create({ data: { candidateId, jobId: job.id, stageId: applied.id, recruiterId, source: "MANUAL" } });
  await tx.stageHistory.create({ data: { candidateJobId: p.id, toStageId: applied.id, movedById: actor.id, note: "Vinculado à vaga" } });
  await onStageEntered(tx, p.id, "applied");
  await audit(tx, {
    actorId: actor.id, action: "application.create", entityType: "CandidateJob", entityId: p.id, storeId: job.storeId, ipAddress: ip,
    summary: `Vinculou ${candidateName} à vaga ${job.title}`,
  });
  return p;
}

export async function linkToJob(actor: Actor, candidateId: string, jobId: string, ip?: string | null) {
  authorize(actor, "candidates.update");
  const c = await db.candidate.findFirst({ where: { AND: [{ id: candidateId }, visibleCandidatesWhere(actor)] }, select: { id: true, fullName: true } });
  if (!c) throw new NotFoundError("Candidato não encontrado.");
  const job = await db.job.findFirst({ where: { AND: [{ id: jobId }, visibleJobsWhere(actor)] } });
  if (!job) throw new ValidationError({ jobId: ["Vaga não encontrada."] });
  // Recrutador vincula às vagas em que é responsável (ou sem responsável, assumindo o processo).
  if (ROLES[actor.roleKey].ownRecordsOnly && job.recruiterId && !canEditJob(actor, job)) {
    throw new ForbiddenError("Esta vaga está sob responsabilidade de outro recrutador.");
  }
  const retentionUntil = await retentionDate();
  await ensureDefaultRules();
  return db.$transaction(async (tx) => {
    const p = await linkInTx(tx, actor, c.id, c.fullName, job, ip);
    await tx.candidate.update({ where: { id: c.id }, data: { retentionUntil } });
    return p;
  });
}

export async function openJobsForLinking(actor: Actor, candidateId?: string) {
  const linked = candidateId ? (await db.candidateJob.findMany({ where: { candidateId }, select: { jobId: true } })).map((p) => p.jobId) : [];
  return db.job.findMany({
    where: { AND: [visibleJobsWhere(actor), { status: "OPEN" }, { id: { notIn: linked } }] },
    orderBy: [{ priority: "desc" }, { title: "asc" }],
    select: { id: true, title: true, store: { select: { name: true } } },
  });
}

// ───────── LGPD ─────────

/** Remove os dados pessoais e o currículo; mantém os processos (sem identificação) para os relatórios. */
export async function anonymizeCandidate(actor: Actor, id: string, ip?: string | null, reason = "Pedido do titular") {
  authorize(actor, "privacy.manage");
  const c = await db.candidate.findFirst({ where: { AND: [{ id }, visibleCandidatesWhere(actor)] }, include: { attachments: true } });
  if (!c) throw new NotFoundError("Candidato não encontrado.");
  await db.$transaction(async (tx) => {
    await anonymizeInTx(tx, c.id);
    await audit(tx, { actorId: actor.id, action: "privacy.anonymize", entityType: "Candidate", entityId: id, storeId: c.desiredStoreId, ipAddress: ip, summary: `Anonimizou um candidato (${reason})` });
  });
  for (const a of c.attachments) await storage()?.remove(a.storageKey).catch(() => {});
}

async function anonymizeInTx(tx: Tx, id: string) {
  const now = new Date();
  await tx.candidate.update({
    where: { id },
    data: {
      fullName: "Candidato anonimizado", cpf: null, phoneE164: null, whatsappE164: null, email: null, address: null, city: null, state: null,
      experience: null, introduction: null, inTalentPool: false, optedOutAt: now, anonymizedAt: now, ownerId: null,
    },
  });
  await tx.candidateNote.deleteMany({ where: { candidateId: id } });
  await tx.candidateTag.deleteMany({ where: { candidateId: id } });
  await tx.attachment.updateMany({ where: { candidateId: id }, data: { deletedAt: now, fileName: "removido.pdf" } });
  await tx.candidateConsent.updateMany({ where: { candidateId: id, revokedAt: null }, data: { revokedAt: now } });
  await tx.conversation.updateMany({ where: { candidateId: id }, data: { waContactName: null, lastMessageText: null } });
}

/** Candidatos do banco de talentos com prazo vencido e sem processo ativo. */
export async function retentionDue(actor: Actor) {
  authorize(actor, "privacy.manage");
  return db.candidate.count({ where: { AND: [visibleCandidatesWhere(actor), { retentionUntil: { lt: new Date() } }, { processes: { none: { status: "ACTIVE" } } }] } });
}

export async function runRetention(actor: Actor, ip?: string | null) {
  authorize(actor, "privacy.manage");
  const due = await db.candidate.findMany({
    where: { AND: [visibleCandidatesWhere(actor), { retentionUntil: { lt: new Date() } }, { processes: { none: { status: "ACTIVE" } } }] },
    select: { id: true, attachments: { select: { storageKey: true } } },
    take: 500,
  });
  for (const c of due) {
    await db.$transaction(async (tx) => {
      await anonymizeInTx(tx, c.id);
    });
    for (const a of c.attachments) await storage()?.remove(a.storageKey).catch(() => {});
  }
  if (due.length) await audit(db, { actorId: actor.id, action: "privacy.retention", entityType: "Candidate", ipAddress: ip, summary: `Aplicou a política de retenção: ${due.length} candidato(s) anonimizado(s)` });
  return due.length;
}

// ───────── Currículo (download) ─────────

export async function resumeAccess(actor: Actor, attachmentId: string, ip?: string | null) {
  authorize(actor, "resumes.view");
  const a = await db.attachment.findFirst({
    where: { id: attachmentId, deletedAt: null, candidate: visibleCandidatesWhere(actor) },
    select: { id: true, storageKey: true, fileName: true, candidate: { select: { id: true, fullName: true, desiredStoreId: true } } },
  });
  if (!a) throw new NotFoundError("Arquivo não encontrado.");
  await audit(db, { actorId: actor.id, action: "resume.view", entityType: "Candidate", entityId: a.candidate.id, storeId: a.candidate.desiredStoreId, ipAddress: ip, summary: `Abriu o currículo de ${a.candidate.fullName}` });
  return a;
}

/** Opções dos filtros de busca (lojas visíveis, cargos, etapas, etiquetas, recrutadores). */
export async function candidateFilterOptions(actor: Actor) {
  const [stores, positions, stages, tags] = await Promise.all([
    db.store.findMany({ where: actor.allStores ? {} : { id: { in: actor.storeIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.position.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.recruitmentStage.findMany({ where: { active: true }, orderBy: { order: "asc" }, select: { key: true, name: true } }),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { stores, positions, stages, tags };
}

// ───────── Exclusão definitiva ─────────

/**
 * Exclui candidatos de vez: cadastro, candidaturas, entrevistas, observações, etiquetas, consentimentos,
 * conversas e currículos (arquivos apagados do armazenamento). Diferente de anonimizar, não sobra nada
 * para os relatórios. O histórico de auditoria registra só que houve uma exclusão, sem dados pessoais.
 */
export async function deleteCandidates(actor: Actor, ids: string[], ip?: string | null) {
  authorize(actor, "candidates.delete");
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) throw new ValidationError({ ids: ["Selecione ao menos um candidato."] });
  if (unique.length > 100) throw new ValidationError({ ids: ["Exclua no máximo 100 candidatos por vez."] });
  const found = await db.candidate.findMany({
    where: { AND: [{ id: { in: unique } }, visibleCandidatesWhere(actor)] },
    select: { id: true, desiredStoreId: true, attachments: { select: { storageKey: true } } },
  });
  if (found.length !== unique.length) throw new NotFoundError("Algum candidato não foi encontrado ou está fora do seu acesso.");
  const keys = found.flatMap((c) => c.attachments.map((a) => a.storageKey));
  await db.$transaction(async (tx) => {
    await tx.conversation.deleteMany({ where: { candidateId: { in: unique } } });
    await tx.candidate.deleteMany({ where: { id: { in: unique } } });
    for (const c of found) {
      await audit(tx, { actorId: actor.id, action: "candidate.delete", entityType: "Candidate", entityId: c.id, storeId: c.desiredStoreId, ipAddress: ip, summary: "Excluiu um candidato definitivamente" });
    }
  });
  // Arquivos saem do armazenamento depois que o banco confirmou a exclusão.
  for (const k of keys) await storage()?.remove(k).catch(() => {});
  return found.length;
}
