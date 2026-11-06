-- CreateEnum
CREATE TYPE "BehavioralAnalysisStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "behavioral_tests" ADD COLUMN     "confidence" TEXT,
ADD COLUMN     "jobProfile" JSONB,
ADD COLUMN     "matrixVersion" TEXT,
ADD COLUMN     "review" JSONB,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- CreateTable
CREATE TABLE "behavioral_analyses" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "BehavioralAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "matrixVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "output" JSONB,
    "filtered" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "behavioral_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_behavioral_profiles" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "essentials" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_behavioral_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "behavioral_analyses_testId_status_idx" ON "behavioral_analyses"("testId", "status");

-- CreateIndex
CREATE INDEX "behavioral_analyses_requestedById_idx" ON "behavioral_analyses"("requestedById");

-- CreateIndex
CREATE UNIQUE INDEX "behavioral_analyses_testId_version_key" ON "behavioral_analyses"("testId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "job_behavioral_profiles_jobId_key" ON "job_behavioral_profiles"("jobId");

-- CreateIndex
CREATE INDEX "job_behavioral_profiles_updatedById_idx" ON "job_behavioral_profiles"("updatedById");

-- AddForeignKey
ALTER TABLE "behavioral_tests" ADD CONSTRAINT "behavioral_tests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavioral_analyses" ADD CONSTRAINT "behavioral_analyses_testId_fkey" FOREIGN KEY ("testId") REFERENCES "behavioral_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavioral_analyses" ADD CONSTRAINT "behavioral_analyses_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_behavioral_profiles" ADD CONSTRAINT "job_behavioral_profiles_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_behavioral_profiles" ADD CONSTRAINT "job_behavioral_profiles_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Segurança: a Data API do Supabase fica sem acesso, só o papel da aplicação lê e grava.
ALTER TABLE "behavioral_analyses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job_behavioral_profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY nexo_app_all ON "behavioral_analyses" FOR ALL USING (current_user = 'nexo_app') WITH CHECK (current_user = 'nexo_app');
CREATE POLICY nexo_app_all ON "job_behavioral_profiles" FOR ALL USING (current_user = 'nexo_app') WITH CHECK (current_user = 'nexo_app');

