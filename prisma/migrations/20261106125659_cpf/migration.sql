-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "cpf" TEXT;

-- CreateIndex
CREATE INDEX "candidates_cpf_idx" ON "candidates"("cpf");
