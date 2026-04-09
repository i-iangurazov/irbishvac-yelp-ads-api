-- CreateEnum
CREATE TYPE "LeadAutomationCadence" AS ENUM ('INITIAL', 'FOLLOW_UP_24H', 'FOLLOW_UP_7D');

-- AlterEnum
ALTER TYPE "LeadAutomationSkipReason" ADD VALUE IF NOT EXISTS 'FOLLOW_UP_DISABLED';
ALTER TYPE "LeadAutomationSkipReason" ADD VALUE IF NOT EXISTS 'CUSTOMER_REPLIED';
ALTER TYPE "LeadAutomationSkipReason" ADD VALUE IF NOT EXISTS 'HUMAN_TAKEOVER';
ALTER TYPE "LeadAutomationSkipReason" ADD VALUE IF NOT EXISTS 'LIFECYCLE_STOPPED';
ALTER TYPE "LeadAutomationSkipReason" ADD VALUE IF NOT EXISTS 'MISSING_THREAD_CONTEXT';

-- AlterTable
ALTER TABLE "LeadAutomationRule"
ADD COLUMN "cadence" "LeadAutomationCadence" NOT NULL DEFAULT 'INITIAL';

-- AlterTable
ALTER TABLE "LeadAutomationBusinessOverride"
ADD COLUMN "followUp24hEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "followUp24hDelayHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN "followUp7dEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "followUp7dDelayDays" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "LeadAutomationAttempt"
ADD COLUMN "cadence" "LeadAutomationCadence" NOT NULL DEFAULT 'INITIAL',
ADD COLUMN "dueAt" TIMESTAMP(3);

-- DropIndex
DROP INDEX "LeadAutomationAttempt_leadId_key";

-- CreateIndex
CREATE UNIQUE INDEX "LeadAutomationAttempt_leadId_cadence_key" ON "LeadAutomationAttempt"("leadId", "cadence");
CREATE INDEX "LeadAutomationAttempt_tenantId_cadence_status_dueAt_idx" ON "LeadAutomationAttempt"("tenantId", "cadence", "status", "dueAt");
CREATE INDEX "LeadAutomationRule_tenantId_cadence_isEnabled_priority_idx" ON "LeadAutomationRule"("tenantId", "cadence", "isEnabled", "priority");
CREATE INDEX "LeadAutomationRule_tenantId_businessId_locationId_serviceC_idx" ON "LeadAutomationRule"("tenantId", "businessId", "locationId", "serviceCategoryId", "cadence");
