CREATE TYPE "OperationalMetricKind" AS ENUM ('COUNTER', 'DISTRIBUTION', 'GAUGE');

ALTER TABLE "YelpLead"
ADD COLUMN "latestWebhookStatus" "SyncRunStatus",
ADD COLUMN "latestWebhookReceivedAt" TIMESTAMP(3),
ADD COLUMN "latestWebhookErrorSummary" TEXT;

CREATE TABLE "OperationalMetricRollup" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "metricKey" TEXT NOT NULL,
  "kind" "OperationalMetricKind" NOT NULL DEFAULT 'COUNTER',
  "bucketStart" TIMESTAMP(3) NOT NULL,
  "bucketMinutes" INTEGER NOT NULL DEFAULT 60,
  "dimensionKey" TEXT NOT NULL DEFAULT 'all',
  "dimensionsJson" JSONB,
  "totalValue" INTEGER NOT NULL DEFAULT 0,
  "sampleCount" INTEGER NOT NULL DEFAULT 0,
  "lastValue" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperationalMetricRollup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalMetricRollup_tenantId_metricKey_bucketStart_dimensionKey_key"
ON "OperationalMetricRollup"("tenantId", "metricKey", "bucketStart", "dimensionKey");

CREATE INDEX "YelpLead_tenantId_latestWebhookStatus_latestInteractionAt_idx"
ON "YelpLead"("tenantId", "latestWebhookStatus", "latestInteractionAt");

CREATE INDEX "OperationalMetricRollup_tenantId_bucketStart_idx"
ON "OperationalMetricRollup"("tenantId", "bucketStart");

CREATE INDEX "OperationalMetricRollup_tenantId_metricKey_bucketStart_idx"
ON "OperationalMetricRollup"("tenantId", "metricKey", "bucketStart");

ALTER TABLE "OperationalMetricRollup"
ADD CONSTRAINT "OperationalMetricRollup_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
