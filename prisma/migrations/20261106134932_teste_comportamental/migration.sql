-- CreateEnum
CREATE TYPE "BehavioralTestStatus" AS ENUM ('SENT', 'COMPLETED', 'CANCELED');

-- CreateTable
CREATE TABLE "behavioral_tests" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "candidateJobId" TEXT,
    "version" TEXT NOT NULL,
    "status" "BehavioralTestStatus" NOT NULL DEFAULT 'SENT',
    "tokenNonce" TEXT,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "answers" JSONB,
    "result" JSONB,
    "overall" INTEGER,
    "profile" TEXT,
    "createdById" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "behavioral_tests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "behavioral_tests_tokenHash_key" ON "behavioral_tests"("tokenHash");

-- CreateIndex
CREATE INDEX "behavioral_tests_candidateId_createdAt_idx" ON "behavioral_tests"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "behavioral_tests_candidateJobId_idx" ON "behavioral_tests"("candidateJobId");

-- CreateIndex
CREATE INDEX "behavioral_tests_status_sentAt_idx" ON "behavioral_tests"("status", "sentAt");

-- CreateIndex
CREATE INDEX "behavioral_tests_createdById_idx" ON "behavioral_tests"("createdById");

-- AddForeignKey
ALTER TABLE "behavioral_tests" ADD CONSTRAINT "behavioral_tests_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavioral_tests" ADD CONSTRAINT "behavioral_tests_candidateJobId_fkey" FOREIGN KEY ("candidateJobId") REFERENCES "candidate_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavioral_tests" ADD CONSTRAINT "behavioral_tests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Segurança: a Data API do Supabase fica sem acesso, só o papel da aplicação lê e grava.
ALTER TABLE "behavioral_tests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY nexo_app_all ON "behavioral_tests" FOR ALL USING (current_user = 'nexo_app') WITH CHECK (current_user = 'nexo_app');


-- Permissões do módulo Teste Comportamental (relatório só para Administrador e Gestor de RH)
INSERT INTO "permissions" ("id", "key", "module", "description") VALUES
  ('perm_behavioral_send', 'behavioral.send', 'Teste Comportamental', 'Gerar e enviar testes comportamentais'),
  ('perm_behavioral_view', 'behavioral.view', 'Teste Comportamental', 'Ver resultados e relatórios dos testes comportamentais')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p ON p."key" = 'behavioral.send'
WHERE r."key" IN ('ADMIN', 'HR_MANAGER', 'RECRUITER')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p ON p."key" = 'behavioral.view'
WHERE r."key" IN ('ADMIN', 'HR_MANAGER')
ON CONFLICT DO NOTHING;
