ALTER TYPE "LeadAutomationChannel" ADD VALUE IF NOT EXISTS 'YELP_THREAD';

CREATE TYPE "LeadConversationActionType" AS ENUM ('SEND_MESSAGE', 'MARK_READ', 'MARK_REPLIED');

CREATE TYPE "LeadConversationActionStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TYPE "LeadConversationInitiator" AS ENUM ('AUTOMATION', 'OPERATOR', 'SYSTEM');

CREATE TABLE "LeadConversationAction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "automationAttemptId" TEXT,
    "actorId" TEXT,
    "initiator" "LeadConversationInitiator" NOT NULL,
    "actionType" "LeadConversationActionType" NOT NULL,
    "channel" "LeadAutomationChannel" NOT NULL,
    "status" "LeadConversationActionStatus" NOT NULL DEFAULT 'PENDING',
    "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'INTERNAL',
    "recipient" TEXT,
    "renderedSubject" TEXT,
    "renderedBody" TEXT,
    "providerMessageId" TEXT,
    "providerStatus" TEXT,
    "providerMetadataJson" JSONB,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadConversationAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadConversationAction_tenantId_leadId_createdAt_idx" ON "LeadConversationAction"("tenantId", "leadId", "createdAt");
CREATE INDEX "LeadConversationAction_tenantId_status_createdAt_idx" ON "LeadConversationAction"("tenantId", "status", "createdAt");
CREATE INDEX "LeadConversationAction_tenantId_automationAttemptId_idx" ON "LeadConversationAction"("tenantId", "automationAttemptId");

ALTER TABLE "LeadConversationAction" ADD CONSTRAINT "LeadConversationAction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadConversationAction" ADD CONSTRAINT "LeadConversationAction_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "YelpLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadConversationAction" ADD CONSTRAINT "LeadConversationAction_automationAttemptId_fkey" FOREIGN KEY ("automationAttemptId") REFERENCES "LeadAutomationAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
