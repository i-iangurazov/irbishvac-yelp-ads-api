-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "LeadConversationAutomationMode" AS ENUM ('REVIEW_ONLY', 'BOUNDED_AUTO_REPLY', 'HUMAN_HANDOFF');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "LeadConversationIntent" AS ENUM (
    'MISSING_DETAILS_PROVIDED',
    'BASIC_ACKNOWLEDGMENT',
    'SIMPLE_NEXT_STEP_CLARIFICATION',
    'BOOKING_INTENT',
    'QUOTE_PRICING_REQUEST',
    'AVAILABILITY_TIMING_REQUEST',
    'COMPLAINT_ESCALATION',
    'UNSUPPORTED_AMBIGUOUS',
    'HUMAN_ONLY'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "LeadConversationDecision" AS ENUM ('AUTO_REPLY', 'REVIEW_ONLY', 'HUMAN_HANDOFF');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "LeadConversationConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "LeadConversationStopReason" AS ENUM (
    'CONVERSATION_DISABLED',
    'LIFECYCLE_STOPPED',
    'MODE_REVIEW_ONLY',
    'MODE_HUMAN_HANDOFF',
    'INTENT_NOT_ALLOWED',
    'LOW_CONFIDENCE',
    'MAX_AUTOMATED_TURNS_REACHED',
    'HUMAN_TAKEOVER',
    'CUSTOMER_ESCALATION',
    'PRICING_RISK',
    'AVAILABILITY_RISK',
    'UNCLEAR_SERVICE',
    'MISSING_THREAD_CONTEXT',
    'SEND_FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "LeadAutomationBusinessOverride"
ADD COLUMN IF NOT EXISTS "conversationAutomationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "conversationMode" "LeadConversationAutomationMode" NOT NULL DEFAULT 'REVIEW_ONLY',
ADD COLUMN IF NOT EXISTS "conversationAllowedIntentsJson" JSONB NOT NULL DEFAULT '["MISSING_DETAILS_PROVIDED","BASIC_ACKNOWLEDGMENT","SIMPLE_NEXT_STEP_CLARIFICATION"]',
ADD COLUMN IF NOT EXISTS "conversationMaxAutomatedTurns" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN IF NOT EXISTS "conversationReviewFallbackEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "conversationEscalateToIssueQueue" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE IF NOT EXISTS "LeadConversationAutomationState" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "mode" "LeadConversationAutomationMode" NOT NULL DEFAULT 'REVIEW_ONLY',
  "automatedTurnCount" INTEGER NOT NULL DEFAULT 0,
  "lastAutomatedReplyAt" TIMESTAMP(3),
  "lastProcessedEventKey" TEXT,
  "lastInboundAt" TIMESTAMP(3),
  "lastIntent" "LeadConversationIntent",
  "lastDecision" "LeadConversationDecision",
  "lastStopReason" "LeadConversationStopReason",
  "blockedAt" TIMESTAMP(3),
  "escalatedAt" TIMESTAMP(3),
  "humanTakeoverAt" TIMESTAMP(3),
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LeadConversationAutomationState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeadConversationAutomationState_leadId_key" UNIQUE ("leadId"),
  CONSTRAINT "LeadConversationAutomationState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeadConversationAutomationState_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "YelpLead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LeadConversationAutomationTurn" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "stateId" TEXT,
  "sourceEventKey" TEXT NOT NULL,
  "sourceExternalEventId" TEXT,
  "mode" "LeadConversationAutomationMode" NOT NULL,
  "intent" "LeadConversationIntent" NOT NULL,
  "decision" "LeadConversationDecision" NOT NULL,
  "confidence" "LeadConversationConfidence" NOT NULL DEFAULT 'LOW',
  "stopReason" "LeadConversationStopReason",
  "templateId" TEXT,
  "channel" "LeadAutomationChannel" NOT NULL DEFAULT 'YELP_THREAD',
  "renderedSubject" TEXT,
  "renderedBody" TEXT,
  "errorSummary" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "LeadConversationAutomationTurn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeadConversationAutomationTurn_tenantId_sourceEventKey_key" UNIQUE ("tenantId", "sourceEventKey"),
  CONSTRAINT "LeadConversationAutomationTurn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeadConversationAutomationTurn_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "YelpLead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeadConversationAutomationTurn_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "LeadConversationAutomationState"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "LeadConversationAutomationTurn_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LeadAutomationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeadConversationAutomationState_tenantId_mode_updatedAt_idx"
ON "LeadConversationAutomationState"("tenantId", "mode", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeadConversationAutomationState_tenantId_escalatedAt_idx"
ON "LeadConversationAutomationState"("tenantId", "escalatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeadConversationAutomationTurn_tenantId_leadId_createdAt_idx"
ON "LeadConversationAutomationTurn"("tenantId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeadConversationAutomationTurn_tenantId_decision_createdAt_idx"
ON "LeadConversationAutomationTurn"("tenantId", "decision", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeadConversationAutomationTurn_tenantId_stopReason_createdAt_idx"
ON "LeadConversationAutomationTurn"("tenantId", "stopReason", "createdAt");
