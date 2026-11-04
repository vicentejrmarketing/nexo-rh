-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "mediaId" TEXT,
ADD COLUMN     "mediaMime" TEXT;

-- AlterTable
ALTER TABLE "message_templates" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "variables" JSONB;

-- AlterTable
ALTER TABLE "whatsapp_integration" ADD COLUMN     "lastWebhookAt" TIMESTAMP(3),
ADD COLUMN     "qualityRating" TEXT,
ADD COLUMN     "verifiedName" TEXT;
