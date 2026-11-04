import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Migrações: em máquinas com acesso normal à internet, `npx prisma migrate deploy` funciona.
// Em ambientes com rede restrita, use `npm run db:migrate` (motor Wasm oficial da Prisma).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: { url: env("DATABASE_URL") },
});
