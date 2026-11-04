#!/usr/bin/env node
// Migrações via motor oficial da Prisma em WebAssembly (@prisma/schema-engine-wasm).
//
// Por que existe: o `prisma migrate` padrão baixa um binário nativo de binaries.prisma.sh,
// o que não é possível em ambientes com rede restrita. Este script usa o mesmo motor,
// compilado em Wasm e distribuído pelo npm, e grava o mesmo histórico (_prisma_migrations).
// Em uma máquina com acesso normal, `npx prisma migrate deploy` continua funcionando.
//
// Uso:
//   node scripts/db/migrate.mjs create <nome>   gera prisma/migrations/<timestamp>_<nome>/migration.sql
//                                               (+ schema.snapshot.prisma, base da próxima diferença)
//   node scripts/db/migrate.mjs deploy [--test] aplica migrações pendentes em DATABASE_URL (ou TEST_DATABASE_URL)
//   node scripts/db/migrate.mjs status          lista migrações e diferenças pendentes
import "dotenv/config";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { SchemaEngine } from "@prisma/schema-engine-wasm";
import { PrismaPg } from "@prisma/adapter-pg";
import { bindMigrationAwareSqlAdapterFactory } from "@prisma/driver-adapter-utils";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SCHEMA_PATH = path.join(ROOT, "prisma/schema.prisma");
const MIGRATIONS_DIR = path.join(ROOT, "prisma/migrations");
const SNAPSHOT = "schema.snapshot.prisma";
const filters = { externalTables: [], externalEnums: [] };

function requireUrl(name) {
  const url = process.env[name];
  if (!url) throw new Error(`Defina ${name} no .env`);
  return url;
}

async function schemaContainer() {
  return { files: [{ path: SCHEMA_PATH, content: await readFile(SCHEMA_PATH, "utf8") }] };
}

async function migrationsList() {
  await mkdir(MIGRATIONS_DIR, { recursive: true });
  const entries = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const migrationDirectories = [];
  for (const name of entries) {
    const dir = path.join(MIGRATIONS_DIR, name);
    const file = path.join(dir, "migration.sql");
    let content;
    try {
      content = { tag: "ok", value: await readFile(file, "utf8") };
    } catch (e) {
      content = { tag: "error", value: String(e) };
    }
    migrationDirectories.push({ path: name, migrationFile: { path: path.join(name, "migration.sql"), content } });
  }
  const lockPath = path.join(MIGRATIONS_DIR, "migration_lock.toml");
  let lockContent = null;
  try {
    lockContent = await readFile(lockPath, "utf8");
  } catch {}
  return {
    baseDir: MIGRATIONS_DIR,
    lockfile: { path: lockPath, content: lockContent },
    shadowDbInitScript: "",
    migrationDirectories,
  };
}

async function engineFor(url) {
  // Mesmo invólucro que o CLI da Prisma aplica ao adaptador antes de entregá-lo ao motor.
  const adapter = bindMigrationAwareSqlAdapterFactory(new PrismaPg({ connectionString: url }));
  const datamodels = [[SCHEMA_PATH, await readFile(SCHEMA_PATH, "utf8")]];
  return SchemaEngine.new({ datamodels }, (msg) => {
    if (process.env.MIGRATE_DEBUG) console.error(msg);
  }, adapter);
}

// Toda tabela nova recebe RLS habilitado: a Data API do Supabase (anon/authenticated)
// não lê nada; a aplicação acessa como dona das tabelas e não é afetada.
function withRls(sql) {
  const tables = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((m) => m[1]);
  if (!tables.length) return sql;
  const rls = tables.map((t) => `ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`).join("\n");
  return `${sql.trimEnd()}\n\n-- Segurança: bloqueia a Data API do Supabase (sem policies = nenhum acesso)\n${rls}\n`;
}

async function create(name) {
  if (!name || !/^[a-z0-9_]+$/.test(name)) throw new Error("Nome inválido: use letras minúsculas, números e _");
  // A diferença é calculada entre o schema salvo junto da última migração e o schema atual,
  // sem precisar de banco sombra. O motor só precisa de uma conexão para saber o dialeto.
  const list = await migrationsList();
  const last = list.migrationDirectories.at(-1);
  const engine = await engineFor(requireUrl("DATABASE_URL"));
  let from = { tag: "empty" };
  if (last) {
    const snapPath = path.join(MIGRATIONS_DIR, last.path, SNAPSHOT);
    from = { tag: "schemaDatamodel", files: [{ path: SCHEMA_PATH, content: await readFile(snapPath, "utf8") }] };
  }
  const result = await engine.diff({
    from,
    to: { tag: "schemaDatamodel", ...(await schemaContainer()) },
    script: true,
    exitCode: null,
    filters,
  });
  const sql = (result.stdout ?? "").trim();
  if (!sql || /^-- This is an empty migration\.?$/.test(sql)) {
    console.log("Nenhuma alteração no schema.");
    return;
  }
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const dir = path.join(MIGRATIONS_DIR, `${stamp}_${name}`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "migration.sql"), withRls(sql) + "\n");
  await writeFile(path.join(dir, SNAPSHOT), await readFile(SCHEMA_PATH, "utf8"));
  if (!list.lockfile.content) {
    await writeFile(list.lockfile.path, 'provider = "postgresql"\n');
  }
  console.log(`Migração criada: ${path.relative(ROOT, dir)}/migration.sql`);
}

async function deploy() {
  const url = process.argv.includes("--test") ? requireUrl("TEST_DATABASE_URL") : requireUrl("DATABASE_URL");
  const engine = await engineFor(url);
  const out = await engine.applyMigrations({ migrationsList: await migrationsList(), filters });
  const applied = out.appliedMigrationNames ?? [];
  console.log(applied.length ? `Aplicadas: ${applied.join(", ")}` : "Banco já está atualizado.");
}

async function status() {
  const engine = await engineFor(requireUrl("DATABASE_URL"));
  const out = await engine.diagnoseMigrationHistory({
    migrationsList: await migrationsList(),
    optInToShadowDatabase: false,
    filters,
  });
  console.log(JSON.stringify(out, null, 2));
}

const [cmd, arg] = process.argv.slice(2);
const commands = { create: () => create(arg), deploy, status };
if (!commands[cmd]) {
  console.error("Uso: migrate.mjs create <nome> | deploy | status");
  process.exit(1);
}
commands[cmd]().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
