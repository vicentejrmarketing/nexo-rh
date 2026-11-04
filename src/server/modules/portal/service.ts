import "server-only";
import { ensureDefaultRules, onStageEntered } from "@/server/modules/automations/service";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ContractType, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { AppError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/modules/users/schemas";
import { getCompanySettings } from "@/server/modules/settings/service";
import { CONTRACT_LABEL } from "@/server/modules/jobs/service";
import { attachResume, withUploadedResume, type ResumeFile } from "@/server/modules/candidates/service";
import { storageReady } from "@/server/storage";
import { addDays } from "@/lib/period";
import { parseMoneyBR } from "@/lib/form";
import { toE164BR } from "@/lib/phone";

// Portal público de vagas. Nada aqui exige login: toda função devolve só dados próprios para o público
// (nunca recrutador, contatos internos ou dados de candidatos) e toda escrita passa por validação,
// limite de envios e proteção contra robôs.

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;
export { UFS as PUBLIC_UFS };

/** Vaga visível e com inscrições abertas no site. */
const listedWhere: Prisma.JobWhereInput = { status: "OPEN", publishedOnline: true, store: { status: "ACTIVE" } };

const publicSelect = {
  id: true, slug: true, title: true, description: true, requirements: true, responsibilities: true, benefits: true,
  salaryMin: true, salaryMax: true, salaryText: true, showSalary: true, contractType: true, openings: true, city: true,
  status: true, publishedAt: true, openedAt: true, createdAt: true, priority: true,
  store: { select: { id: true, name: true, city: true, state: true } },
  position: { select: { id: true, name: true, area: true } },
} satisfies Prisma.JobSelect;

export type PublicJob = Prisma.JobGetPayload<{ select: typeof publicSelect }>;

function publicSalary(j: Pick<PublicJob, "showSalary" | "salaryMin" | "salaryMax" | "salaryText">): string | null {
  if (!j.showSalary) return j.salaryText || null;
  const fmt = (v: unknown) => `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const min = j.salaryMin ? fmt(j.salaryMin) : null;
  const max = j.salaryMax ? fmt(j.salaryMax) : null;
  const range = min && max ? (min === max ? min : `${min} a ${max}`) : min ? `A partir de ${min}` : max ? `Até ${max}` : null;
  return [range, j.salaryText].filter(Boolean).join(" · ") || null;
}

function shape(j: PublicJob) {
  return {
    ...j,
    salaryMin: j.showSalary && j.salaryMin ? Number(j.salaryMin) : null,
    salaryMax: j.showSalary && j.salaryMax ? Number(j.salaryMax) : null,
    salaryLabel: publicSalary(j),
    contractLabel: CONTRACT_LABEL[j.contractType],
    state: j.store.state,
    publishedOn: j.publishedAt ?? j.openedAt ?? j.createdAt,
  };
}
export type PublicJobView = ReturnType<typeof shape>;

// ───────── Listagem e filtros ─────────

export type PublicFilters = {
  q?: string; positionId?: string; area?: string; city?: string; state?: string; storeId?: string;
  contract?: string; salary?: string; days?: string; sort?: string; page?: number;
};
export const SALARY_RANGES = [
  { value: "ate-2000", label: "Até R$ 2.000", min: 0, max: 2000 },
  { value: "2000-3000", label: "R$ 2.000 a R$ 3.000", min: 2000, max: 3000 },
  { value: "3000-5000", label: "R$ 3.000 a R$ 5.000", min: 3000, max: 5000 },
  { value: "acima-5000", label: "Acima de R$ 5.000", min: 5000, max: null },
] as const;
export const DAY_RANGES = [
  { value: "1", label: "Últimas 24 horas" }, { value: "7", label: "Últimos 7 dias" },
  { value: "15", label: "Últimos 15 dias" }, { value: "30", label: "Últimos 30 dias" },
] as const;
const PAGE = 12;

function filterWhere(f: PublicFilters): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = [listedWhere];
  const q = f.q?.trim().slice(0, 80);
  if (q) {
    const words = q.split(/\s+/).filter((w) => w.length >= 2).slice(0, 5);
    for (const w of words) {
      and.push({
        OR: [
          { title: { contains: w, mode: "insensitive" } }, { description: { contains: w, mode: "insensitive" } },
          { requirements: { contains: w, mode: "insensitive" } }, { responsibilities: { contains: w, mode: "insensitive" } },
          { city: { contains: w, mode: "insensitive" } }, { position: { name: { contains: w, mode: "insensitive" } } },
          { store: { name: { contains: w, mode: "insensitive" } } },
        ],
      });
    }
  }
  if (f.positionId) and.push({ positionId: f.positionId });
  if (f.area) and.push({ position: { area: f.area } });
  if (f.city) and.push({ city: { equals: f.city, mode: "insensitive" } });
  if (f.state && (UFS as readonly string[]).includes(f.state)) and.push({ store: { state: f.state } });
  if (f.storeId) and.push({ storeId: f.storeId });
  if (f.contract && f.contract in CONTRACT_LABEL) and.push({ contractType: f.contract as ContractType });
  const range = SALARY_RANGES.find((r) => r.value === f.salary);
  if (range) {
    // Só vagas com salário divulgado. A faixa da vaga precisa cruzar a faixa escolhida.
    and.push({ showSalary: true, OR: [{ salaryMin: { not: null } }, { salaryMax: { not: null } }] });
    if (range.max !== null) and.push({ OR: [{ salaryMin: { lt: range.max } }, { AND: [{ salaryMin: null }, { salaryMax: { lte: range.max } }] }] });
    if (range.min > 0) and.push({ OR: [{ salaryMax: { gte: range.min } }, { AND: [{ salaryMax: null }, { salaryMin: { gte: range.min } }] }] });
  }
  const days = Number(f.days);
  if ([1, 7, 15, 30].includes(days)) and.push({ publishedAt: { gte: addDays(new Date(), -days) } });
  return { AND: and };
}

/** Relevância: palavra no título vale mais que no cargo, que vale mais que no texto; depois urgência e data. */
function relevance(j: PublicJob, q: string): number {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  const PRIORITY = { URGENT: 3, HIGH: 2, MEDIUM: 1, LOW: 0 } as const;
  let score = 0;
  for (const w of words) {
    if (j.title.toLowerCase().includes(w)) score += 10;
    if (j.position?.name.toLowerCase().includes(w)) score += 6;
    if (j.city.toLowerCase().includes(w) || j.store.name.toLowerCase().includes(w)) score += 4;
    if ((j.requirements ?? "").toLowerCase().includes(w) || (j.responsibilities ?? "").toLowerCase().includes(w)) score += 2;
    if (j.description.toLowerCase().includes(w)) score += 1;
  }
  return score * 10 + PRIORITY[j.priority];
}

export async function listPublicJobs(f: PublicFilters = {}) {
  const where = filterWhere(f);
  const page = Math.max(1, f.page ?? 1);
  const relevant = f.sort === "relevantes";
  if (!relevant) {
    const [items, total] = await Promise.all([
      db.job.findMany({ where, select: publicSelect, orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], skip: (page - 1) * PAGE, take: PAGE }),
      db.job.count({ where }),
    ]);
    return { items: items.map(shape), total, page, pageCount: Math.max(1, Math.ceil(total / PAGE)) };
  }
  // A relevância é calculada aqui; o volume de vagas abertas de uma empresa é pequeno.
  const all = await db.job.findMany({ where, select: publicSelect, take: 500 });
  const q = f.q?.trim() ?? "";
  const PRIORITY = { URGENT: 3, HIGH: 2, MEDIUM: 1, LOW: 0 } as const;
  all.sort((a, b) => (q ? relevance(b, q) - relevance(a, q) : PRIORITY[b.priority] - PRIORITY[a.priority]) || (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  return { items: all.slice((page - 1) * PAGE, page * PAGE).map(shape), total: all.length, page, pageCount: Math.max(1, Math.ceil(all.length / PAGE)) };
}

/** Opções dos filtros, tiradas apenas das vagas visíveis agora (nada de opção que leva a lista vazia). */
export async function publicFilterOptions() {
  const jobs = await db.job.findMany({
    where: listedWhere,
    select: { city: true, contractType: true, store: { select: { id: true, name: true, state: true } }, position: { select: { id: true, name: true, area: true } } },
  });
  const uniq = <T,>(arr: T[], key: (t: T) => string) => [...new Map(arr.map((x) => [key(x), x])).values()];
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR");
  return {
    total: jobs.length,
    positions: uniq(jobs.flatMap((j) => (j.position ? [{ id: j.position.id, name: j.position.name }] : [])), (p) => p.id).sort(byName),
    areas: [...new Set(jobs.map((j) => j.position?.area).filter((a): a is string => !!a))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    cities: [...new Set(jobs.map((j) => j.city))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    states: [...new Set(jobs.map((j) => j.store.state))].sort(),
    stores: uniq(jobs.map((j) => ({ id: j.store.id, name: j.store.name })), (s) => s.id).sort(byName),
    contracts: [...new Set(jobs.map((j) => j.contractType))].map((c) => ({ value: c, label: CONTRACT_LABEL[c] })),
  };
}

/**
 * Página da vaga. Rascunho, cancelada ou retirada do site → null (404).
 * Pausada ou encerrada → abre, mas sem aceitar inscrições (links já compartilhados não quebram).
 */
export async function getPublicJob(slug: string) {
  const j = await db.job.findFirst({ where: { slug, publishedOnline: true, status: { in: ["OPEN", "PAUSED", "CLOSED"] } }, select: publicSelect });
  if (!j) return null;
  const store = await db.store.findUnique({ where: { id: j.store.id }, select: { status: true } });
  return { job: shape(j), accepting: j.status === "OPEN" && store?.status === "ACTIVE" };
}

export async function getPublicSite() {
  const s = await getCompanySettings();
  return {
    companyName: s.companyName || "NEXO RH",
    title: s.siteTitle || `Trabalhe na ${s.companyName || "nossa empresa"}`,
    intro: s.siteIntro || "Confira as vagas abertas nas nossas lojas e candidate-se em poucos minutos.",
    contactEmail: s.siteContactEmail || s.contactEmail || null,
    contactWhatsapp: s.siteContactWhatsapp || null,
    privacyPolicy: s.privacyPolicy,
    privacyVersion: s.privacyVersion,
    retentionMonths: Math.round(s.retentionDays / 30),
  };
}

export async function publicHomeData() {
  const [recent, openCount, stores] = await Promise.all([
    db.job.findMany({ where: listedWhere, select: publicSelect, orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }], take: 6 }),
    db.job.count({ where: listedWhere }),
    db.store.findMany({
      where: { status: "ACTIVE", jobs: { some: listedWhere } },
      select: { id: true, name: true, city: true, state: true, _count: { select: { jobs: { where: listedWhere } } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return { recent: recent.map(shape), openCount, stores };
}

// ───────── Proteção contra robôs e spam ─────────

function formKey() {
  const base = process.env.FORM_SECRET || process.env.DATABASE_URL;
  if (!base) throw new Error("FORM_SECRET/DATABASE_URL ausente");
  return createHash("sha256").update(`nexo-form:${base}`).digest();
}

/** Token assinado com a hora em que o formulário foi aberto. */
export function issueFormToken(now = Date.now()): string {
  const ts = String(now);
  return `${ts}.${createHmac("sha256", formKey()).update(ts).digest("base64url")}`;
}

export const MIN_FILL_MS = 4000;
const MAX_FORM_AGE_MS = 3 * 60 * 60 * 1000;

/** null = ok; senão o motivo (registrado só no servidor). */
export function checkFormToken(token: string | undefined, now = Date.now()): string | null {
  const [ts, sig] = (token ?? "").split(".");
  if (!ts || !sig) return "sem token";
  const expected = createHmac("sha256", formKey()).update(ts).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "token inválido";
  const age = now - Number(ts);
  if (!(age >= MIN_FILL_MS)) return "rápido demais";
  if (age > MAX_FORM_AGE_MS) return "formulário expirado";
  return null;
}

const hashKey = (v: string) => createHash("sha256").update(`nexo-rl:${v}`).digest("hex").slice(0, 32);

/** Conta e limita envios por chave em uma janela. Lança erro amigável ao estourar. */
async function rateLimit(rules: { bucket: string; max: number; windowMs: number }[]) {
  const now = Date.now();
  for (const r of rules) {
    const n = await db.rateLimitHit.count({ where: { bucket: r.bucket, createdAt: { gte: new Date(now - r.windowMs) } } });
    if (n >= r.max) throw new AppError("RATE_LIMITED", "Recebemos muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo.");
  }
  await db.rateLimitHit.createMany({ data: rules.map((r) => ({ bucket: r.bucket })) });
  // Limpeza oportunista: nada com mais de 2 dias é necessário.
  if (Math.random() < 0.05) await db.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(now - 2 * 86400000) } } });
}

// ───────── Inscrição ─────────

const applySchema = z.object({
  fullName: z.string().trim().min(5, "Informe seu nome completo.").max(120).refine((v) => v.includes(" "), "Informe nome e sobrenome."),
  phone: z.string().transform((v, ctx) => {
    const e = toE164BR(v);
    if (!e) {
      ctx.addIssue({ code: "custom", message: "Telefone inválido. Use DDD + número, ex.: (47) 99999-0000." });
      return z.NEVER;
    }
    return e;
  }),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email("E-mail inválido."))]).optional().transform((v) => v || null),
  city: z.string().trim().min(2, "Informe a cidade onde mora.").max(80),
  state: z.enum(UFS, "Selecione o estado."),
  salaryExpectation: z.string().transform((v, ctx) => {
    const n = parseMoneyBR(v ?? "");
    if (n === null || Number.isNaN(n) || n < 100 || n > 1_000_000) {
      ctx.addIssue({ code: "custom", message: "Informe a pretensão salarial em reais, ex.: 2.000,00." });
      return z.NEVER;
    }
    return n;
  }),
  currentlyEmployed: z.enum(["sim", "nao"], "Responda se está trabalhando atualmente.").transform((v) => v === "sim"),
  experience: z.string().trim().max(5000).optional().transform((v) => v || null),
  message: z.string().trim().max(2000).optional().transform((v) => v || null),
  consent: z.literal("on", "É preciso autorizar o uso dos seus dados para se candidatar."),
  talentPool: z.string().optional().transform((v) => v === "on"),
});
export type ApplyInput = z.input<typeof applySchema>;

export type ApplyMeta = { ip: string | null; userAgent: string | null; token?: string; honeypot?: string };

/**
 * Processa uma inscrição do site: valida, confere a vaga, evita duplicidade, grava currículo e
 * consentimento, coloca na etapa Inscritos e avisa quem cuida da vaga. Tudo ou nada.
 */
export async function submitApplication(slug: string, raw: ApplyInput, resume: ResumeFile | null, meta: ApplyMeta) {
  // 1) Dados (erros de preenchimento voltam primeiro: nada é gravado até aqui).
  const parsed = applySchema.safeParse(raw);
  const fieldErrors = parsed.success ? {} : fieldErrorsOf(parsed.error);
  if (!resume) fieldErrors.resume = ["Anexe seu currículo em PDF."];
  if (!parsed.success || !resume) throw new ValidationError(fieldErrors);
  const d = parsed.data;

  // 2) Robôs: campo invisível preenchido ou formulário enviado rápido/antigo demais.
  //    A resposta é genérica para não ensinar o robô.
  const botReason = meta.honeypot ? "campo invisível preenchido" : checkFormToken(meta.token);
  if (botReason) {
    console.warn("[portal] envio bloqueado:", botReason);
    throw new AppError("VALIDATION", "Não foi possível enviar. Recarregue a página e tente novamente.");
  }

  // 3) Limites de envio (por IP e por telefone)
  const ipKey = hashKey(`ip:${meta.ip ?? "desconhecido"}`);
  await rateLimit([
    { bucket: `apply:ip:${ipKey}`, max: 8, windowMs: 10 * 60 * 1000 },
    { bucket: `apply:ip-dia:${ipKey}`, max: 30, windowMs: 86400000 },
    { bucket: `apply:tel:${hashKey(d.phone)}`, max: 5, windowMs: 86400000 },
  ]);

  // 4) A vaga precisa estar publicada e aberta no momento do envio.
  const job = await db.job.findFirst({
    where: { slug, ...listedWhere },
    select: { id: true, title: true, storeId: true, recruiterId: true, positionId: true, store: { select: { name: true, managerId: true } } },
  });
  if (!job) throw new AppError("CONFLICT", "Esta vaga não está mais recebendo inscrições.");
  if (!storageReady()) throw new AppError("INTERNAL", "As inscrições estão temporariamente indisponíveis. Tente novamente mais tarde.");

  const settings = await getCompanySettings();
  await ensureDefaultRules();
  const retentionUntil = addDays(new Date(), settings.retentionDays);
  const policyVersion = settings.privacyVersion ?? "sem-versao";

  const result = await withUploadedResume(resume, (file) =>
    db.$transaction(async (tx) => {
      // 5) Duplicidade: o mesmo telefone (ou e-mail) reaproveita o cadastro existente.
      const existing =
        (await tx.candidate.findFirst({ where: { anonymizedAt: null, OR: [{ phoneE164: d.phone }, { whatsappE164: d.phone }] }, orderBy: { createdAt: "asc" } })) ??
        (d.email ? await tx.candidate.findFirst({ where: { anonymizedAt: null, email: d.email }, orderBy: { createdAt: "asc" } }) : null);

      const candidate = existing
        ? await tx.candidate.update({
            where: { id: existing.id },
            // Só completa o que estiver vazio: não sobrescreve o que o recrutador já conferiu.
            data: {
              phoneE164: existing.phoneE164 ?? d.phone, whatsappE164: existing.whatsappE164 ?? d.phone, email: existing.email ?? d.email,
              city: existing.city ?? d.city, state: existing.state ?? d.state, experience: existing.experience ?? d.experience,
              desiredStoreId: existing.desiredStoreId ?? job.storeId, desiredPositionId: existing.desiredPositionId ?? job.positionId,
              inTalentPool: existing.inTalentPool || d.talentPool, retentionUntil,
            },
          })
        : await tx.candidate.create({
            data: {
              fullName: d.fullName, phoneE164: d.phone, whatsappE164: d.phone, email: d.email, city: d.city, state: d.state,
              experience: d.experience, desiredStoreId: job.storeId, desiredPositionId: job.positionId, source: "ONLINE_FORM",
              inTalentPool: d.talentPool, retentionUntil,
            },
          });

      const attachment = await attachResume(tx, null, candidate.id, file!);

      // 6) Candidatura: uma por pessoa e vaga. Se já existir, atualiza os dados enviados e o currículo.
      const applied = await tx.recruitmentStage.findUniqueOrThrow({ where: { key: "applied" } });
      const prev = await tx.candidateJob.findUnique({ where: { candidateId_jobId: { candidateId: candidate.id, jobId: job.id } } });
      const applicationData = {
        salaryExpectation: d.salaryExpectation, currentlyEmployed: d.currentlyEmployed, resumeId: attachment.id,
        applicantMessage: d.message, ipAddress: meta.ip, userAgent: meta.userAgent,
      };
      const application = prev
        ? await tx.candidateJob.update({ where: { id: prev.id }, data: applicationData })
        : await tx.candidateJob.create({
            data: { candidateId: candidate.id, jobId: job.id, stageId: applied.id, recruiterId: job.recruiterId, source: "ONLINE_FORM", ...applicationData },
          });
      if (!prev) {
        await tx.stageHistory.create({ data: { candidateJobId: application.id, toStageId: applied.id, note: "Inscrição pelo site" } });
        // Depois de registrar a etapa: entra na fila a mensagem de "inscrição recebida".
        await onStageEntered(tx, application.id, "applied");
      }

      // 7) Consentimento com a versão da política aceita
      await tx.candidateConsent.createMany({
        data: [
          { candidateId: candidate.id, candidateJobId: application.id, purpose: "RECRUITMENT_PROCESS" as const, policyVersion, source: "ONLINE_FORM" as const, ipAddress: meta.ip, userAgent: meta.userAgent },
          { candidateId: candidate.id, candidateJobId: application.id, purpose: "WHATSAPP_CONTACT" as const, policyVersion, source: "ONLINE_FORM" as const, ipAddress: meta.ip, userAgent: meta.userAgent },
          ...(d.talentPool
            ? [{ candidateId: candidate.id, candidateJobId: application.id, purpose: "TALENT_POOL" as const, policyVersion, source: "ONLINE_FORM" as const, ipAddress: meta.ip, userAgent: meta.userAgent }]
            : []),
        ],
      });

      await audit(tx, {
        actorId: null, action: prev ? "application.update" : "application.create", entityType: "CandidateJob", entityId: application.id,
        storeId: job.storeId, ipAddress: meta.ip,
        summary: prev ? `${candidate.fullName} reenviou a inscrição na vaga ${job.title} pelo site` : `${candidate.fullName} se inscreveu na vaga ${job.title} pelo site`,
      });

      // 8) Notificação: responsável pela vaga; sem responsável, gestor da loja e gestão de RH.
      let recipients = job.recruiterId ? [job.recruiterId] : [];
      if (!recipients.length) {
        const hr = await tx.user.findMany({ where: { status: "ACTIVE", role: { key: { in: ["HR_MANAGER", "ADMIN"] } } }, select: { id: true } });
        recipients = [...new Set([...(job.store.managerId ? [job.store.managerId] : []), ...hr.map((u) => u.id)])];
      }
      const active = await tx.user.findMany({ where: { id: { in: recipients }, status: "ACTIVE" }, select: { id: true } });
      if (active.length) {
        await tx.notification.createMany({
          data: active.map((u) => ({
            userId: u.id, type: "NEW_APPLICATION" as const,
            title: prev ? `Inscrição atualizada: ${candidate.fullName}` : `Nova inscrição: ${candidate.fullName}`,
            body: `${job.title} · ${job.store.name}`, link: `/candidatos/${candidate.id}`,
          })),
        });
      }
      return { candidateId: candidate.id, applicationId: application.id, reused: !!existing, reapplied: !!prev };
    }),
  );
  return result;
}

// ───────── Pedidos de privacidade (LGPD) ─────────

const privacySchema = z
  .object({
    fullName: z.string().trim().min(5, "Informe seu nome completo.").max(120),
    phone: z.string().optional().transform((v, ctx) => {
      if (!v?.trim()) return null;
      const e = toE164BR(v);
      if (!e) {
        ctx.addIssue({ code: "custom", message: "Telefone inválido." });
        return z.NEVER;
      }
      return e;
    }),
    email: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email("E-mail inválido."))]).optional().transform((v) => v || null),
    message: z.string().trim().max(2000).optional().transform((v) => v || null),
  })
  .refine((v) => v.phone || v.email, { path: ["phone"], message: "Informe o telefone ou o e-mail usado na inscrição." });

export async function createPrivacyRequest(raw: z.input<typeof privacySchema>, meta: ApplyMeta) {
  const botReason = meta.honeypot ? "campo invisível" : checkFormToken(meta.token);
  if (botReason) throw new AppError("VALIDATION", "Não foi possível enviar. Recarregue a página e tente novamente.");
  const parsed = privacySchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const ipKey = hashKey(`ip:${meta.ip ?? "desconhecido"}`);
  await rateLimit([{ bucket: `privacy:ip:${ipKey}`, max: 5, windowMs: 86400000 }]);
  // Só vincula se telefone E e-mail informados baterem com o mesmo cadastro, ou se só um foi informado e bater.
  const match = await db.candidate.findFirst({
    where: { anonymizedAt: null, AND: [...(d.phone ? [{ OR: [{ phoneE164: d.phone }, { whatsappE164: d.phone }] }] : []), ...(d.email ? [{ email: d.email }] : [])] },
    select: { id: true },
  });
  return db.$transaction(async (tx) => {
    const req = await tx.privacyRequest.create({ data: { fullName: d.fullName, phoneE164: d.phone, email: d.email, message: d.message, candidateId: match?.id ?? null, ipAddress: meta.ip } });
    const managers = await tx.user.findMany({ where: { status: "ACTIVE", role: { key: { in: ["ADMIN", "HR_MANAGER"] } } }, select: { id: true } });
    if (managers.length) {
      await tx.notification.createMany({
        data: managers.map((u) => ({ userId: u.id, type: "SYSTEM" as const, title: "Pedido de exclusão de dados (LGPD)", body: d.fullName, link: "/site-de-vagas/privacidade" })),
      });
    }
    await audit(tx, { actorId: null, action: "privacy.request", entityType: "PrivacyRequest", entityId: req.id, ipAddress: meta.ip, summary: `Pedido de exclusão de dados recebido pelo site` });
    return req;
  });
}
