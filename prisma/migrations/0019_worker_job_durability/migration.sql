-- CreateEnum
CREATE TYPE "WorkerJobKind" AS ENUM (
  'INTERNAL_RECONCILE_PROGRAM_JOBS',
  'INTERNAL_RECONCILE_LEAD_WEBHOOKS',
  'INTERNAL_RECONCILE_SCHEDULED_REPORTS',
  'INTERNAL_RECONCILE_REPORTS',
  'INTERNAL_RECONCILE_REPORT_DELIVERIES',
  'INTERNAL_RECONCILE_AUTORESPONDER_FOLLOWUPS',
  'INTERNAL_RECONCILE_SERVICETITAN_LIFECYCLE',
  'AUTORESPONDER_FOLLOWUPS',
  'OPERATIONS_RETENTION',
  'OPERATIONS_ALERTS'
);

-- CreateEnum
CREATE TYPE "WorkerJobStatus" AS ENUM (
  'QUEUED',
  'CLAIMED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'DEAD_LETTERED',
  'SKIPPED'
);

-- CreateTable
CREATE TABLE "WorkerJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "jobKey" TEXT NOT NULL,
  "kind" "WorkerJobKind" NOT NULL,
  "status" "WorkerJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "claimExpiresAt" TIMESTAMP(3),
  "claimedBy" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "deadLetteredAt" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "lastErrorSummary" TEXT,
  "lastErrorJson" JSONB,
  "payloadJson" JSONB,
  "resultJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkerJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerJob_jobKey_key" ON "WorkerJob"("jobKey");

-- CreateIndex
CREATE INDEX "WorkerJob_tenantId_kind_status_idx" ON "WorkerJob"("tenantId", "kind", "status");

-- CreateIndex
CREATE INDEX "WorkerJob_kind_status_nextAttemptAt_idx" ON "WorkerJob"("kind", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WorkerJob_status_nextAttemptAt_idx" ON "WorkerJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WorkerJob_claimExpiresAt_idx" ON "WorkerJob"("claimExpiresAt");

-- AddForeignKey
ALTER TABLE "WorkerJob" ADD CONSTRAINT "WorkerJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
