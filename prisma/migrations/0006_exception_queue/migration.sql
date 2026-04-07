CREATE TYPE "OperatorIssueType" AS ENUM (
    'LEAD_SYNC_FAILURE',
    'UNMAPPED_LEAD',
    'CRM_SYNC_FAILURE',
    'AUTORESPONDER_FAILURE',
    'REPORT_DELIVERY_FAILURE',
    'MAPPING_CONFLICT',
    'STALE_LEAD'
);

CREATE TYPE "OperatorIssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE "OperatorIssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

CREATE TABLE "OperatorIssue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "locationId" TEXT,
    "leadId" TEXT,
    "reportRequestId" TEXT,
    "reportScheduleRunId" TEXT,
    "syncRunId" TEXT,
    "issueType" "OperatorIssueType" NOT NULL,
    "severity" "OperatorIssueSeverity" NOT NULL,
    "status" "OperatorIssueStatus" NOT NULL DEFAULT 'OPEN',
    "dedupeKey" TEXT NOT NULL,
    "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'DERIVED',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detailsJson" JSONB,
    "detectedCount" INTEGER NOT NULL DEFAULT 1,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionReason" TEXT,
    "resolutionNote" TEXT,
    "ignoredAt" TIMESTAMP(3),
    "ignoredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorIssue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperatorIssue_tenantId_dedupeKey_key" ON "OperatorIssue"("tenantId", "dedupeKey");
CREATE INDEX "OperatorIssue_tenantId_status_severity_lastDetectedAt_idx" ON "OperatorIssue"("tenantId", "status", "severity", "lastDetectedAt");
CREATE INDEX "OperatorIssue_businessId_locationId_leadId_reportRequestId_idx" ON "OperatorIssue"("businessId", "locationId", "leadId", "reportRequestId", "reportScheduleRunId", "syncRunId");

ALTER TABLE "OperatorIssue" ADD CONSTRAINT "OperatorIssue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperatorIssue" ADD CONSTRAINT "OperatorIssue_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperatorIssue" ADD CONSTRAINT "OperatorIssue_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperatorIssue" ADD CONSTRAINT "OperatorIssue_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "YelpLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperatorIssue" ADD CONSTRAINT "OperatorIssue_reportRequestId_fkey" FOREIGN KEY ("reportRequestId") REFERENCES "ReportRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperatorIssue" ADD CONSTRAINT "OperatorIssue_reportScheduleRunId_fkey" FOREIGN KEY ("reportScheduleRunId") REFERENCES "ReportScheduleRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperatorIssue" ADD CONSTRAINT "OperatorIssue_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "SyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperatorIssue" ADD CONSTRAINT "OperatorIssue_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperatorIssue" ADD CONSTRAINT "OperatorIssue_ignoredById_fkey" FOREIGN KEY ("ignoredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
