-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('CLT', 'INTERNSHIP', 'TEMPORARY', 'APPRENTICE', 'PJ', 'PART_TIME');

-- CreateEnum
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('OPEN', 'DONE', 'REJECTED');

-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'CANCELED';

-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN     "siteBannerKey" TEXT,
ADD COLUMN     "siteContactEmail" TEXT,
ADD COLUMN     "siteContactWhatsapp" TEXT,
ADD COLUMN     "siteIntro" TEXT,
ADD COLUMN     "siteLogoKey" TEXT,
ADD COLUMN     "siteTitle" TEXT;

-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "area" TEXT;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "contractType" "ContractType" NOT NULL DEFAULT 'CLT',
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "responsibilities" TEXT,
ADD COLUMN     "showSalary" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "candidate_consents" ADD COLUMN     "candidateJobId" TEXT;

-- AlterTable
ALTER TABLE "candidate_jobs" ADD COLUMN     "applicantMessage" TEXT,
ADD COLUMN     "currentlyEmployed" BOOLEAN,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "resumeId" TEXT,
ADD COLUMN     "salaryExpectation" DECIMAL(10,2),
ADD COLUMN     "userAgent" TEXT;

-- CreateTable
CREATE TABLE "privacy_requests" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phoneE164" TEXT,
    "email" TEXT,
    "message" TEXT,
    "candidateId" TEXT,
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'OPEN',
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_hits" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "privacy_requests_status_createdAt_idx" ON "privacy_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "privacy_requests_candidateId_idx" ON "privacy_requests"("candidateId");

-- CreateIndex
CREATE INDEX "privacy_requests_handledById_idx" ON "privacy_requests"("handledById");

-- CreateIndex
CREATE INDEX "rate_limit_hits_bucket_createdAt_idx" ON "rate_limit_hits"("bucket", "createdAt");

-- CreateIndex
CREATE INDEX "jobs_publishedOnline_status_publishedAt_idx" ON "jobs"("publishedOnline", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "candidate_consents_candidateJobId_idx" ON "candidate_consents"("candidateJobId");

-- CreateIndex
CREATE INDEX "candidate_jobs_resumeId_idx" ON "candidate_jobs"("resumeId");

-- AddForeignKey
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_consents" ADD CONSTRAINT "candidate_consents_candidateJobId_fkey" FOREIGN KEY ("candidateJobId") REFERENCES "candidate_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_jobs" ADD CONSTRAINT "candidate_jobs_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Segurança: a Data API do Supabase fica sem acesso, só o papel da aplicação lê e grava.
ALTER TABLE "privacy_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limit_hits" ENABLE ROW LEVEL SECURITY;
CREATE POLICY nexo_app_all ON "privacy_requests" FOR ALL USING (current_user = 'nexo_app') WITH CHECK (current_user = 'nexo_app');
CREATE POLICY nexo_app_all ON "rate_limit_hits" FOR ALL USING (current_user = 'nexo_app') WITH CHECK (current_user = 'nexo_app');
