-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CHANGES_REQUESTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AdmissionDocKind" AS ENUM ('ID_DOCUMENT', 'PROOF_OF_ADDRESS', 'SELFIE', 'WORK_CARD', 'VOTER_ID', 'MILITARY');

-- CreateEnum
CREATE TYPE "AdmissionFileStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "admissions" (
    "id" TEXT NOT NULL,
    "candidateJobId" TEXT NOT NULL,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'PENDING',
    "tokenNonce" TEXT,
    "tokenHash" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "linkCreatedAt" TIMESTAMP(3),
    "linkCreatedById" TEXT,
    "lastOpenedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "email" TEXT,
    "race" TEXT,
    "uniformSize" TEXT,
    "education" TEXT,
    "pisNis" TEXT,
    "maritalStatus" TEXT,
    "children" JSONB,
    "spouseName" TEXT,
    "spouseCpf" TEXT,
    "spouseBirthDate" TEXT,
    "needsTransport" BOOLEAN,
    "busesPerDay" INTEGER,
    "transportDailyCost" DECIMAL(10,2),
    "bankAccount" TEXT,
    "bankBranch" TEXT,
    "pixKey" TEXT,
    "privacyAcceptedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_files" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "kind" "AdmissionDocKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "AdmissionFileStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admissions_candidateJobId_key" ON "admissions"("candidateJobId");

-- CreateIndex
CREATE UNIQUE INDEX "admissions_tokenHash_key" ON "admissions"("tokenHash");

-- CreateIndex
CREATE INDEX "admissions_status_idx" ON "admissions"("status");

-- CreateIndex
CREATE INDEX "admissions_linkCreatedById_idx" ON "admissions"("linkCreatedById");

-- CreateIndex
CREATE UNIQUE INDEX "admission_files_storageKey_key" ON "admission_files"("storageKey");

-- CreateIndex
CREATE INDEX "admission_files_admissionId_kind_idx" ON "admission_files"("admissionId", "kind");

-- CreateIndex
CREATE INDEX "admission_files_reviewedById_idx" ON "admission_files"("reviewedById");

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_candidateJobId_fkey" FOREIGN KEY ("candidateJobId") REFERENCES "candidate_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_linkCreatedById_fkey" FOREIGN KEY ("linkCreatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_files" ADD CONSTRAINT "admission_files_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_files" ADD CONSTRAINT "admission_files_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Segurança: a Data API do Supabase fica sem acesso, só o papel da aplicação lê e grava.
ALTER TABLE "admissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_files" ENABLE ROW LEVEL SECURITY;
CREATE POLICY nexo_app_all ON "admissions" FOR ALL USING (current_user = 'nexo_app') WITH CHECK (current_user = 'nexo_app');
CREATE POLICY nexo_app_all ON "admission_files" FOR ALL USING (current_user = 'nexo_app') WITH CHECK (current_user = 'nexo_app');


-- Permissões novas do módulo Contratados (todos veem, gestão para Administrador, Gestor de RH e Recrutador)
INSERT INTO "permissions" ("id", "key", "module", "description") VALUES
  ('perm_admission_view', 'admission.view', 'Contratados', 'Ver contratados e documentos de admissão'),
  ('perm_admission_manage', 'admission.manage', 'Contratados', 'Gerar link de documentos e conferir a admissão')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p ON p."key" = 'admission.view'
WHERE r."key" IN ('ADMIN', 'HR_MANAGER', 'RECRUITER', 'STORE_MANAGER')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p ON p."key" = 'admission.manage'
WHERE r."key" IN ('ADMIN', 'HR_MANAGER', 'RECRUITER')
ON CONFLICT DO NOTHING;
