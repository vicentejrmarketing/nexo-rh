import { execFileSync } from "node:child_process";
import path from "node:path";
import { db } from "@/server/db/client";
import { loadActorById } from "@/server/auth/current-user";
import { hashPassword } from "@/server/auth/password";
import type { RoleKey } from "@/server/authz/catalog";

const ROOT = path.resolve(__dirname, "../..");

/** Zera o banco de teste e roda o seed (perfis, permissões, etapas e 1º admin). */
export async function resetDatabase() {
  const url = process.env.DATABASE_URL!;
  if (!/_test\b/.test(url)) throw new Error("Recusado: resetDatabase só roda em banco *_test");
  const tables: { tablename: string }[] = await db.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  execFileSync(path.join(ROOT, "node_modules/.bin/tsx"), ["prisma/seed.ts"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url, ADMIN_EMAIL: "admin@teste.local", ADMIN_INITIAL_PASSWORD: "SenhaInicial2026", ADMIN_NAME: "Admin Teste" },
    stdio: "pipe",
  });
}

export async function adminActor() {
  const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@teste.local" } });
  return (await loadActorById(admin.id))!;
}

export async function makeStore(name: string) {
  return db.store.create({ data: { name, city: "São Paulo", state: "SP" } });
}

/** Cria um usuário direto no banco (sem passar pelo serviço) e devolve o Actor correspondente. */
export async function makeActor(roleKey: RoleKey, storeIds: string[], email = `${roleKey.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@teste.local`) {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  const user = await db.user.create({
    data: {
      name: `Pessoa ${roleKey}`, email, roleId: role.id, mustChangePassword: false,
      passwordHash: await hashPassword("SenhaValida2026"),
      stores: { create: storeIds.map((storeId) => ({ storeId })) },
    },
  });
  return (await loadActorById(user.id))!;
}
