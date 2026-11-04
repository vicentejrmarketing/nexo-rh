// Seed: apenas dados estruturais — perfis, permissões, etapas do funil, configurações
// da empresa e o primeiro administrador. Nenhum candidato, vaga ou número fictício.
// Idempotente: pode ser executado várias vezes.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, StageKind } from "../src/generated/prisma/client";
import { PERMISSIONS, ROLES, ROLE_KEYS, type PermissionKey } from "../src/server/authz/catalog";
import { hashPassword, passwordProblems } from "../src/server/auth/password";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const STAGES: { key: string; name: string; kind: StageKind }[] = [
  { key: "applied", name: "Inscritos", kind: "OPEN" },
  { key: "contacted", name: "Contato iniciado", kind: "OPEN" },
  { key: "online_interview", name: "Entrevista online", kind: "OPEN" },
  { key: "onsite_interview", name: "Entrevista presencial", kind: "OPEN" },
  { key: "trial", name: "Em teste", kind: "OPEN" },
  { key: "approved", name: "Aprovados", kind: "OPEN" },
  { key: "hired", name: "Contratados", kind: "HIRED" },
  { key: "rejected", name: "Reprovados", kind: "REJECTED" },
  { key: "withdrawn", name: "Desistentes", kind: "WITHDRAWN" },
];

async function main() {
  // Permissões
  for (const [key, def] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({
      where: { key },
      update: { module: def.module, description: def.description },
      create: { key, module: def.module, description: def.description },
    });
  }
  const perms = new Map((await db.permission.findMany()).map((p) => [p.key, p.id]));

  // Perfis: na primeira execução recebem a matriz padrão; depois o administrador a controla.
  for (const key of ROLE_KEYS) {
    const def = ROLES[key];
    const existing = await db.role.findUnique({ where: { key } });
    if (existing) {
      await db.role.update({ where: { key }, data: { name: def.name, description: def.description, allStores: def.allStores } });
      continue;
    }
    await db.role.create({
      data: {
        key,
        name: def.name,
        description: def.description,
        allStores: def.allStores,
        permissions: { create: def.permissions.map((p: PermissionKey) => ({ permissionId: perms.get(p)! })) },
      },
    });
  }
  // O Administrador sempre tem todas as permissões, inclusive as criadas em versões futuras.
  const admin = await db.role.findUniqueOrThrow({ where: { key: "ADMIN" } });
  await db.rolePermission.createMany({
    data: [...perms.values()].map((permissionId) => ({ roleId: admin.id, permissionId })),
    skipDuplicates: true,
  });

  // Etapas do funil (só cria as que faltam; nomes e ordem editáveis depois)
  for (const [i, s] of STAGES.entries()) {
    await db.recruitmentStage.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, name: s.name, kind: s.kind, order: (i + 1) * 10 },
    });
  }

  await db.companySettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  await db.whatsAppIntegration.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });

  // Primeiro administrador — só quando ainda não existe nenhum usuário.
  const userCount = await db.user.count();
  if (userCount === 0) {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const name = process.env.ADMIN_NAME?.trim() || "Administrador";
    const password = process.env.ADMIN_INITIAL_PASSWORD;
    if (!email || !password) {
      throw new Error("Defina ADMIN_EMAIL e ADMIN_INITIAL_PASSWORD para criar o primeiro administrador.");
    }
    const problems = passwordProblems(password, { email });
    if (problems.length) throw new Error(`ADMIN_INITIAL_PASSWORD fraca: ${problems.join(" ")}`);
    const user = await db.user.create({
      data: { name, email, passwordHash: await hashPassword(password), roleId: admin.id, mustChangePassword: true },
    });
    await db.activityLog.create({
      data: { action: "user.create", entityType: "User", entityId: user.id, summary: `Primeiro administrador criado: ${email}` },
    });
    console.log(`Administrador criado: ${email} (troca de senha obrigatória no primeiro acesso)`);
  }
  console.log("Seed concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
