-- CreateEnum
CREATE TYPE "ExternalSideEffectStatus" AS ENUM ('CLAIMED', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "ExternalSideEffect" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" "ExternalSideEffectStatus" NOT NULL DEFAULT 'CLAIMED',
    "businessId" TEXT,
    "leadId" TEXT,
    "automationAttemptId" TEXT,
    "conversationActionId" TEXT,
    "reportScheduleRunId" TEXT,
    "providerMessageId" TEXT,
    "requestJson" JSONB,
    "responseJson" JSONB,
    "errorSummary" TEXT,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalSideEffect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSideEffect_tenantId_idempotencyKey_key" ON "ExternalSideEffect"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ExternalSideEffect_tenantId_provider_operation_status_idx" ON "ExternalSideEffect"("tenantId", "provider", "operation", "status");

-- CreateIndex
CREATE INDEX "ExternalSideEffect_tenantId_leadId_operation_idx" ON "ExternalSideEffect"("tenantId", "leadId", "operation");

-- CreateIndex
CREATE INDEX "ExternalSideEffect_tenantId_reportScheduleRunId_operation_idx" ON "ExternalSideEffect"("tenantId", "reportScheduleRunId", "operation");

-- CreateIndex
CREATE INDEX "ExternalSideEffect_tenantId_createdAt_idx" ON "ExternalSideEffect"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "ExternalSideEffect" ADD CONSTRAINT "ExternalSideEffect_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
