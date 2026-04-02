-- CreateEnum
CREATE TYPE "RecordSourceSystem" AS ENUM ('YELP', 'CRM', 'INTERNAL', 'DERIVED');

-- CreateEnum
CREATE TYPE "YelpLeadReplyState" AS ENUM ('UNKNOWN', 'UNREAD', 'READ', 'REPLIED');

-- CreateEnum
CREATE TYPE "InternalLeadStatus" AS ENUM ('UNMAPPED', 'NEW', 'BOOKED', 'SCHEDULED', 'JOB_IN_PROGRESS', 'COMPLETED', 'CANCELED', 'LOST');

-- CreateEnum
CREATE TYPE "SyncRunType" AS ENUM ('YELP_LEADS_WEBHOOK', 'YELP_LEADS_BACKFILL', 'YELP_REPORTING_REQUEST', 'YELP_REPORTING_POLL', 'CRM_LEAD_ENRICHMENT', 'LOCATION_MAPPING', 'SERVICE_MAPPING');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ReportingFreshnessState" AS ENUM ('PENDING', 'INCOMPLETE', 'FINAL');

-- AlterTable
ALTER TABLE "Business"
ADD COLUMN "locationId" TEXT,
ADD COLUMN "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'YELP';

-- AlterTable
ALTER TABLE "Program"
ADD COLUMN "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'YELP';

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "externalCrmLocationId" TEXT,
    "timezone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'INTERNAL',
    "metadataJson" JSONB,
    "rawSnapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'INTERNAL',
    "yelpAliasesJson" JSONB NOT NULL DEFAULT '[]',
    "crmCodesJson" JSONB NOT NULL DEFAULT '[]',
    "mappingRulesJson" JSONB NOT NULL DEFAULT '[]',
    "metadataJson" JSONB,
    "rawSnapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YelpLead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "locationId" TEXT,
    "serviceCategoryId" TEXT,
    "externalLeadId" TEXT NOT NULL,
    "externalBusinessId" TEXT,
    "externalConversationId" TEXT,
    "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'YELP',
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "createdAtYelp" TIMESTAMP(3) NOT NULL,
    "latestInteractionAt" TIMESTAMP(3),
    "replyState" "YelpLeadReplyState" NOT NULL DEFAULT 'UNKNOWN',
    "readAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "internalStatus" "InternalLeadStatus" NOT NULL DEFAULT 'UNMAPPED',
    "mappedServiceLabel" TEXT,
    "metadataJson" JSONB,
    "rawSnapshotJson" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YelpLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YelpLeadEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "externalEventId" TEXT,
    "eventType" TEXT NOT NULL,
    "actorType" TEXT,
    "occurredAt" TIMESTAMP(3),
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isReply" BOOLEAN NOT NULL DEFAULT false,
    "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'YELP',
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YelpLeadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YelpWebhookEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "syncRunId" TEXT,
    "eventKey" TEXT NOT NULL,
    "deliveryId" TEXT,
    "topic" TEXT NOT NULL,
    "status" "SyncRunStatus" NOT NULL DEFAULT 'QUEUED',
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'YELP',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "headersJson" JSONB,
    "payloadJson" JSONB NOT NULL,
    "errorJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YelpWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YelpReportingJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "locationId" TEXT,
    "granularity" "ReportGranularity" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'REQUESTED',
    "upstreamJobId" TEXT,
    "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'YELP',
    "requestScopeJson" JSONB,
    "requestJson" JSONB,
    "responseJson" JSONB,
    "freshnessAsOf" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YelpReportingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YelpReportingSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportingJobId" TEXT NOT NULL,
    "businessId" TEXT,
    "locationId" TEXT,
    "serviceCategoryId" TEXT,
    "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'YELP',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "freshnessState" "ReportingFreshnessState" NOT NULL DEFAULT 'PENDING',
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "payloadJson" JSONB NOT NULL,
    "metricsSummaryJson" JSONB,
    "rawStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YelpReportingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLeadMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "locationId" TEXT,
    "externalCrmLeadId" TEXT NOT NULL,
    "externalOpportunityId" TEXT,
    "externalJobId" TEXT,
    "matchMethod" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'CRM',
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" JSONB,
    "rawSnapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLeadMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmStatusEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "crmLeadMappingId" TEXT,
    "locationId" TEXT,
    "externalStatusEventId" TEXT,
    "status" "InternalLeadStatus" NOT NULL,
    "substatus" TEXT,
    "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'CRM',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "locationId" TEXT,
    "leadId" TEXT,
    "reportingJobId" TEXT,
    "type" "SyncRunType" NOT NULL,
    "status" "SyncRunStatus" NOT NULL DEFAULT 'QUEUED',
    "sourceSystem" "RecordSourceSystem" NOT NULL,
    "capabilityKey" TEXT,
    "correlationId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "statsJson" JSONB,
    "requestJson" JSONB,
    "responseJson" JSONB,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncError" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "syncRunId" TEXT NOT NULL,
    "sourceSystem" "RecordSourceSystem" NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT,
    "message" TEXT NOT NULL,
    "isRetryable" BOOLEAN NOT NULL DEFAULT true,
    "detailsJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Location_tenantId_name_idx" ON "Location"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Location_tenantId_isActive_idx" ON "Location"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Location_tenantId_externalCrmLocationId_key" ON "Location"("tenantId", "externalCrmLocationId");

-- CreateIndex
CREATE INDEX "ServiceCategory_tenantId_name_idx" ON "ServiceCategory"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_tenantId_slug_key" ON "ServiceCategory"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "YelpLead_tenantId_createdAtYelp_idx" ON "YelpLead"("tenantId", "createdAtYelp");

-- CreateIndex
CREATE INDEX "YelpLead_tenantId_internalStatus_idx" ON "YelpLead"("tenantId", "internalStatus");

-- CreateIndex
CREATE INDEX "YelpLead_businessId_locationId_serviceCategoryId_idx" ON "YelpLead"("businessId", "locationId", "serviceCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "YelpLead_tenantId_externalLeadId_key" ON "YelpLead"("tenantId", "externalLeadId");

-- CreateIndex
CREATE INDEX "YelpLeadEvent_tenantId_leadId_occurredAt_idx" ON "YelpLeadEvent"("tenantId", "leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "YelpLeadEvent_tenantId_externalEventId_idx" ON "YelpLeadEvent"("tenantId", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "YelpLeadEvent_tenantId_eventKey_key" ON "YelpLeadEvent"("tenantId", "eventKey");

-- CreateIndex
CREATE INDEX "YelpWebhookEvent_tenantId_topic_receivedAt_idx" ON "YelpWebhookEvent"("tenantId", "topic", "receivedAt");

-- CreateIndex
CREATE INDEX "YelpWebhookEvent_tenantId_deliveryId_idx" ON "YelpWebhookEvent"("tenantId", "deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "YelpWebhookEvent_tenantId_eventKey_key" ON "YelpWebhookEvent"("tenantId", "eventKey");

-- CreateIndex
CREATE INDEX "YelpReportingJob_tenantId_status_granularity_idx" ON "YelpReportingJob"("tenantId", "status", "granularity");

-- CreateIndex
CREATE INDEX "YelpReportingJob_businessId_locationId_idx" ON "YelpReportingJob"("businessId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "YelpReportingJob_tenantId_upstreamJobId_key" ON "YelpReportingJob"("tenantId", "upstreamJobId");

-- CreateIndex
CREATE INDEX "YelpReportingSnapshot_tenantId_windowStart_windowEnd_idx" ON "YelpReportingSnapshot"("tenantId", "windowStart", "windowEnd");

-- CreateIndex
CREATE INDEX "YelpReportingSnapshot_businessId_locationId_serviceCategory_idx" ON "YelpReportingSnapshot"("businessId", "locationId", "serviceCategoryId");

-- CreateIndex
CREATE INDEX "CrmLeadMapping_tenantId_locationId_idx" ON "CrmLeadMapping"("tenantId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLeadMapping_leadId_key" ON "CrmLeadMapping"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLeadMapping_tenantId_externalCrmLeadId_key" ON "CrmLeadMapping"("tenantId", "externalCrmLeadId");

-- CreateIndex
CREATE INDEX "CrmStatusEvent_tenantId_leadId_occurredAt_idx" ON "CrmStatusEvent"("tenantId", "leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "CrmStatusEvent_tenantId_status_idx" ON "CrmStatusEvent"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CrmStatusEvent_tenantId_externalStatusEventId_key" ON "CrmStatusEvent"("tenantId", "externalStatusEventId");

-- CreateIndex
CREATE INDEX "SyncRun_tenantId_type_status_idx" ON "SyncRun"("tenantId", "type", "status");

-- CreateIndex
CREATE INDEX "SyncRun_tenantId_startedAt_idx" ON "SyncRun"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "SyncRun_businessId_locationId_leadId_reportingJobId_idx" ON "SyncRun"("businessId", "locationId", "leadId", "reportingJobId");

-- CreateIndex
CREATE INDEX "SyncError_tenantId_occurredAt_idx" ON "SyncError"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "SyncError_syncRunId_idx" ON "SyncError"("syncRunId");

-- CreateIndex
CREATE INDEX "Business_locationId_idx" ON "Business"("locationId");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpLead" ADD CONSTRAINT "YelpLead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpLead" ADD CONSTRAINT "YelpLead_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpLead" ADD CONSTRAINT "YelpLead_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpLead" ADD CONSTRAINT "YelpLead_serviceCategoryId_fkey" FOREIGN KEY ("serviceCategoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpLeadEvent" ADD CONSTRAINT "YelpLeadEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpLeadEvent" ADD CONSTRAINT "YelpLeadEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "YelpLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpWebhookEvent" ADD CONSTRAINT "YelpWebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpWebhookEvent" ADD CONSTRAINT "YelpWebhookEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "YelpLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpWebhookEvent" ADD CONSTRAINT "YelpWebhookEvent_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "SyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpReportingJob" ADD CONSTRAINT "YelpReportingJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpReportingJob" ADD CONSTRAINT "YelpReportingJob_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpReportingJob" ADD CONSTRAINT "YelpReportingJob_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpReportingSnapshot" ADD CONSTRAINT "YelpReportingSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpReportingSnapshot" ADD CONSTRAINT "YelpReportingSnapshot_reportingJobId_fkey" FOREIGN KEY ("reportingJobId") REFERENCES "YelpReportingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpReportingSnapshot" ADD CONSTRAINT "YelpReportingSnapshot_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpReportingSnapshot" ADD CONSTRAINT "YelpReportingSnapshot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpReportingSnapshot" ADD CONSTRAINT "YelpReportingSnapshot_serviceCategoryId_fkey" FOREIGN KEY ("serviceCategoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadMapping" ADD CONSTRAINT "CrmLeadMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadMapping" ADD CONSTRAINT "CrmLeadMapping_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "YelpLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadMapping" ADD CONSTRAINT "CrmLeadMapping_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmStatusEvent" ADD CONSTRAINT "CrmStatusEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmStatusEvent" ADD CONSTRAINT "CrmStatusEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "YelpLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmStatusEvent" ADD CONSTRAINT "CrmStatusEvent_crmLeadMappingId_fkey" FOREIGN KEY ("crmLeadMappingId") REFERENCES "CrmLeadMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmStatusEvent" ADD CONSTRAINT "CrmStatusEvent_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "YelpLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_reportingJobId_fkey" FOREIGN KEY ("reportingJobId") REFERENCES "YelpReportingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncError" ADD CONSTRAINT "SyncError_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncError" ADD CONSTRAINT "SyncError_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "SyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
