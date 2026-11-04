-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('PENDING', 'BLOCKED', 'SENT', 'SKIPPED', 'CANCELED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('API', 'MANUAL_LINK');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "candidateJobId" TEXT,
ADD COLUMN     "channel" "MessageChannel" NOT NULL DEFAULT 'API',
ADD COLUMN     "stageKey" TEXT;

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "templateId" TEXT,
    "offsetMinutes" INTEGER,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_dispatches" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "candidateJobId" TEXT NOT NULL,
    "interviewId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "stageKey" TEXT,
    "status" "DispatchStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "body" TEXT,
    "messageId" TEXT,
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "automation_rules_event_key" ON "automation_rules"("event");

-- CreateIndex
CREATE INDEX "automation_rules_templateId_idx" ON "automation_rules"("templateId");

-- CreateIndex
CREATE INDEX "automation_rules_updatedById_idx" ON "automation_rules"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "message_dispatches_dedupeKey_key" ON "message_dispatches"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "message_dispatches_messageId_key" ON "message_dispatches"("messageId");

-- CreateIndex
CREATE INDEX "message_dispatches_status_dueAt_idx" ON "message_dispatches"("status", "dueAt");

-- CreateIndex
CREATE INDEX "message_dispatches_candidateJobId_idx" ON "message_dispatches"("candidateJobId");

-- CreateIndex
CREATE INDEX "message_dispatches_interviewId_idx" ON "message_dispatches"("interviewId");

-- CreateIndex
CREATE INDEX "message_dispatches_ruleId_idx" ON "message_dispatches"("ruleId");

-- CreateIndex
CREATE INDEX "message_dispatches_sentById_idx" ON "message_dispatches"("sentById");

-- CreateIndex
CREATE INDEX "messages_candidateJobId_idx" ON "messages"("candidateJobId");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_candidateJobId_fkey" FOREIGN KEY ("candidateJobId") REFERENCES "candidate_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_candidateJobId_fkey" FOREIGN KEY ("candidateJobId") REFERENCES "candidate_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Segurança: a Data API do Supabase fica sem acesso, só o papel da aplicação lê e grava.
ALTER TABLE "automation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_dispatches" ENABLE ROW LEVEL SECURITY;
CREATE POLICY nexo_app_all ON "automation_rules" FOR ALL USING (current_user = 'nexo_app') WITH CHECK (current_user = 'nexo_app');
CREATE POLICY nexo_app_all ON "message_dispatches" FOR ALL USING (current_user = 'nexo_app') WITH CHECK (current_user = 'nexo_app');

