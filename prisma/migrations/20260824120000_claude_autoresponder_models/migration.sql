ALTER TABLE "LeadAutomationBusinessOverride"
ALTER COLUMN "aiModel" SET DEFAULT 'claude-sonnet-4-6';

UPDATE "LeadAutomationBusinessOverride"
SET "aiModel" = CASE "aiModel"
  WHEN 'gpt-5-nano' THEN 'claude-haiku-4-5'
  WHEN 'gpt-5-mini' THEN 'claude-sonnet-4-6'
  WHEN 'gpt-5.2' THEN 'claude-opus-4-6'
  ELSE "aiModel"
END
WHERE "aiModel" IN ('gpt-5-nano', 'gpt-5-mini', 'gpt-5.2');

UPDATE "SystemSetting"
SET "valueJson" = jsonb_set(
  "valueJson",
  '{aiModel}',
  to_jsonb(
    CASE "valueJson"->>'aiModel'
      WHEN 'gpt-5-nano' THEN 'claude-haiku-4-5'
      WHEN 'gpt-5-mini' THEN 'claude-sonnet-4-6'
      WHEN 'gpt-5.2' THEN 'claude-opus-4-6'
      ELSE 'claude-sonnet-4-6'
    END::text
  ),
  true
)
WHERE "key" = 'leadAutoresponder'
  AND "valueJson"->>'aiModel' IN ('gpt-5-nano', 'gpt-5-mini', 'gpt-5.2');

CREATE TABLE "AiGenerationUsage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "businessId" TEXT,
  "leadId" TEXT,
  "correlationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'ANTHROPIC',
  "operation" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "resultStatus" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "cacheCreationInputTokens" INTEGER NOT NULL DEFAULT 0,
  "cacheReadInputTokens" INTEGER NOT NULL DEFAULT 0,
  "latencyMs" INTEGER NOT NULL DEFAULT 0,
  "providerCostMicroUsd" INTEGER NOT NULL DEFAULT 0,
  "billableCostMicroUsd" INTEGER NOT NULL DEFAULT 0,
  "rateSnapshotJson" JSONB NOT NULL,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiGenerationUsage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AiGenerationUsage"
ADD CONSTRAINT "AiGenerationUsage_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "AiGenerationUsage_tenantId_correlationId_key"
ON "AiGenerationUsage"("tenantId", "correlationId");

CREATE INDEX "AiGenerationUsage_tenantId_createdAt_idx"
ON "AiGenerationUsage"("tenantId", "createdAt");

CREATE INDEX "AiGenerationUsage_tenantId_businessId_createdAt_idx"
ON "AiGenerationUsage"("tenantId", "businessId", "createdAt");

CREATE INDEX "AiGenerationUsage_tenantId_resultStatus_createdAt_idx"
ON "AiGenerationUsage"("tenantId", "resultStatus", "createdAt");
