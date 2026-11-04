import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { authorize, type Actor } from "@/server/authz/authorize";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/modules/users/schemas";

// ───────── Cargos ─────────

const positionSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cargo.").max(80, "Nome muito longo."),
  description: z.string().trim().max(500).optional().transform((v) => v || null),
});

export async function listPositions(opts: { activeOnly?: boolean } = {}) {
  return db.position.findMany({
    where: opts.activeOnly ? { active: true } : {},
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, description: true, active: true, _count: { select: { jobs: true, desiredByCandidates: true } } },
  });
}

export async function savePosition(actor: Actor, id: string | null, raw: { name: string; description?: string }) {
  authorize(actor, "settings.manage");
  const parsed = positionSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  try {
    return await db.$transaction(async (tx) => {
      const before = id ? await tx.position.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundError("Cargo não encontrado.");
      const pos = id
        ? await tx.position.update({ where: { id }, data: parsed.data })
        : await tx.position.create({ data: parsed.data });
      await audit(tx, {
        actorId: actor.id, action: id ? "position.update" : "position.create", entityType: "Position", entityId: pos.id,
        summary: id ? `Atualizou o cargo ${pos.name}` : `Criou o cargo ${pos.name}`,
        before: before ? { name: before.name } : undefined, after: { name: pos.name },
      });
      return pos;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ValidationError({ name: ["Já existe um cargo com este nome."] });
    throw e;
  }
}

export async function setPositionActive(actor: Actor, id: string, active: boolean) {
  authorize(actor, "settings.manage");
  const pos = await db.position.findUnique({ where: { id } });
  if (!pos) throw new NotFoundError("Cargo não encontrado.");
  await db.$transaction(async (tx) => {
    await tx.position.update({ where: { id }, data: { active } });
    await audit(tx, { actorId: actor.id, action: active ? "position.activate" : "position.deactivate", entityType: "Position", entityId: id, summary: `${active ? "Reativou" : "Desativou"} o cargo ${pos.name}` });
  });
}

export async function deletePosition(actor: Actor, id: string) {
  authorize(actor, "settings.manage");
  const pos = await db.position.findUnique({ where: { id }, select: { name: true, _count: { select: { jobs: true, desiredByCandidates: true } } } });
  if (!pos) throw new NotFoundError("Cargo não encontrado.");
  if (pos._count.jobs + pos._count.desiredByCandidates > 0) {
    throw new ForbiddenError("Este cargo já é usado em vagas ou candidatos. Desative-o em vez de excluir.");
  }
  await db.$transaction(async (tx) => {
    await tx.position.delete({ where: { id } });
    await audit(tx, { actorId: actor.id, action: "position.delete", entityType: "Position", entityId: id, summary: `Excluiu o cargo ${pos.name}` });
  });
}

// ───────── Dados da empresa e LGPD ─────────

export const PRIVACY_TEMPLATE = `POLÍTICA DE PRIVACIDADE DO PROCESSO SELETIVO — MODELO PENDENTE DE REVISÃO JURÍDICA

1. Quem trata os seus dados: [razão social], CNPJ [CNPJ], responsável pelo processo seletivo.
2. Quais dados: nome, contatos (telefone, WhatsApp, e-mail), cidade, estado, cargo e loja de interesse, experiência profissional, apresentação e currículo.
3. Para quê: avaliar a sua candidatura, entrar em contato sobre o processo seletivo e, com o seu consentimento, manter o seu cadastro no nosso banco de talentos para futuras vagas.
4. Base legal: consentimento do titular (art. 7º, I, da LGPD) e procedimentos preliminares relacionados a contrato de trabalho (art. 7º, V).
5. Por quanto tempo: até [prazo] sem atividade no banco de talentos. Depois disso os dados são anonimizados.
6. Com quem compartilhamos: apenas com a equipe de recrutamento e com fornecedores de tecnologia necessários ao processo (hospedagem e envio de mensagens).
7. Seus direitos: confirmar, acessar, corrigir, pedir a exclusão dos seus dados e revogar o consentimento a qualquer momento, pelo contato [e-mail de contato].
8. Mensagens: você pode pedir para não receber mais mensagens respondendo SAIR.`;

const companySchema = z.object({
  companyName: z.string().trim().max(120),
  legalName: z.string().trim().max(160).optional().transform((v) => v || null),
  taxId: z.string().trim().max(20).optional().transform((v) => v || null),
  contactEmail: z.union([z.literal(""), z.email("E-mail inválido.")]).optional().transform((v) => v || null),
  contactPhone: z.string().trim().max(30).optional().transform((v) => v || null),
  privacyPolicy: z.string().trim().max(20000).optional().transform((v) => v || null),
  retentionMonths: z.coerce.number().int("Use um número inteiro de meses.").min(6, "Mínimo de 6 meses.").max(60, "Máximo de 60 meses."),
  stalledDays: z.coerce.number().int().min(1, "Mínimo de 1 dia.").max(60, "Máximo de 60 dias."),
});

export async function getCompanySettings() {
  return db.companySettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
}

export async function updateCompanySettings(actor: Actor, raw: Record<string, string>) {
  authorize(actor, "settings.manage");
  const parsed = companySchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsOf(parsed.error));
  const { retentionMonths, ...data } = parsed.data;
  const current = await getCompanySettings();
  // Mudou o texto da política → nova versão (os consentimentos registram a versão aceita).
  const policyChanged = (current.privacyPolicy ?? "") !== (data.privacyPolicy ?? "");
  const privacyVersion = policyChanged ? new Date().toISOString().slice(0, 16).replace("T", " ") : current.privacyVersion;
  await db.$transaction(async (tx) => {
    await tx.companySettings.update({ where: { id: "default" }, data: { ...data, privacyVersion, retentionDays: retentionMonths * 30 } });
    await audit(tx, {
      actorId: actor.id, action: "settings.company", entityType: "CompanySettings", entityId: "default",
      summary: policyChanged ? `Atualizou os dados da empresa e publicou a política de privacidade versão ${privacyVersion}` : "Atualizou os dados da empresa",
    });
  });
}
