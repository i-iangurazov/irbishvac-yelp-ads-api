-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('ADMIN', 'OPERATOR', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('ADS_BASIC_AUTH', 'REPORTING_FUSION', 'BUSINESS_MATCH', 'DATA_INGESTION');

-- CreateEnum
CREATE TYPE "ConnectionTestStatus" AS ENUM ('UNTESTED', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('BP', 'EP', 'CPC', 'RCA', 'CTA', 'SLIDESHOW', 'BH', 'VL', 'LOGO', 'PORTFOLIO');

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'QUEUED', 'PROCESSING', 'ACTIVE', 'SCHEDULED', 'ENDED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('CREATE_PROGRAM', 'EDIT_PROGRAM', 'END_PROGRAM', 'SYNC_JOB', 'REQUEST_REPORT', 'FETCH_REPORT', 'TEST_CONNECTION');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "FeatureType" AS ENUM ('LINK_TRACKING', 'NEGATIVE_KEYWORD_TARGETING', 'STRICT_CATEGORY_TARGETING', 'AD_SCHEDULING', 'CUSTOM_LOCATION_TARGETING', 'AD_GOAL', 'CALL_TRACKING', 'BUSINESS_HIGHLIGHTS', 'VERIFIED_LICENSE', 'CUSTOM_RADIUS_TARGETING', 'CUSTOM_AD_TEXT', 'CUSTOM_AD_PHOTO', 'BUSINESS_LOGO', 'YELP_PORTFOLIO');

-- CreateEnum
CREATE TYPE "ReportGranularity" AS ENUM ('DAILY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" "RoleCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "permissionsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialSet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "CredentialKind" NOT NULL,
    "label" TEXT NOT NULL,
    "usernameEncrypted" TEXT,
    "secretEncrypted" TEXT NOT NULL,
    "baseUrl" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastTestStatus" "ConnectionTestStatus" NOT NULL DEFAULT 'UNTESTED',
    "lastTestedAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredentialSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "encryptedYelpBusinessId" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "categoriesJson" JSONB NOT NULL DEFAULT '[]',
    "readinessJson" JSONB NOT NULL DEFAULT '{}',
    "rawSnapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YelpBusinessMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalBusinessId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YelpBusinessMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "ProgramType" NOT NULL,
    "status" "ProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "upstreamProgramId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "budgetCents" INTEGER,
    "maxBidCents" INTEGER,
    "isAutobid" BOOLEAN,
    "pacingMethod" TEXT,
    "feePeriod" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "adCategoriesJson" JSONB,
    "configurationJson" JSONB NOT NULL DEFAULT '{}',
    "summaryJson" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "programId" TEXT,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "correlationId" TEXT NOT NULL,
    "upstreamJobId" TEXT,
    "requestJson" JSONB,
    "responseJson" JSONB,
    "errorJson" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPolledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramFeatureSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "type" "FeatureType" NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "valueJson" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramFeatureSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "createdById" TEXT,
    "granularity" "ReportGranularity" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'REQUESTED',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "upstreamRequestId" TEXT,
    "requestedBusinessIdsJson" JSONB NOT NULL DEFAULT '[]',
    "filtersJson" JSONB,
    "errorJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportRequestId" TEXT NOT NULL,
    "businessId" TEXT,
    "granularity" "ReportGranularity" NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "metricsSummaryJson" JSONB,
    "rawStatus" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "businessId" TEXT,
    "programId" TEXT,
    "reportRequestId" TEXT,
    "actionType" TEXT NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'PENDING',
    "correlationId" TEXT,
    "upstreamReference" TEXT,
    "requestSummaryJson" JSONB,
    "responseSummaryJson" JSONB,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "rawPayloadSummaryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "CredentialSet_tenantId_idx" ON "CredentialSet"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CredentialSet_tenantId_kind_key" ON "CredentialSet"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "Business_tenantId_name_idx" ON "Business"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Business_tenantId_encryptedYelpBusinessId_key" ON "Business"("tenantId", "encryptedYelpBusinessId");

-- CreateIndex
CREATE INDEX "YelpBusinessMapping_tenantId_idx" ON "YelpBusinessMapping"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "YelpBusinessMapping_businessId_externalBusinessId_key" ON "YelpBusinessMapping"("businessId", "externalBusinessId");

-- CreateIndex
CREATE INDEX "Program_tenantId_businessId_idx" ON "Program"("tenantId", "businessId");

-- CreateIndex
CREATE INDEX "Program_tenantId_type_status_idx" ON "Program"("tenantId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramJob_correlationId_key" ON "ProgramJob"("correlationId");

-- CreateIndex
CREATE INDEX "ProgramJob_tenantId_status_idx" ON "ProgramJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProgramJob_programId_idx" ON "ProgramJob"("programId");

-- CreateIndex
CREATE INDEX "ProgramJob_businessId_idx" ON "ProgramJob"("businessId");

-- CreateIndex
CREATE INDEX "ProgramFeatureSnapshot_tenantId_programId_type_idx" ON "ProgramFeatureSnapshot"("tenantId", "programId", "type");

-- CreateIndex
CREATE INDEX "ReportRequest_tenantId_status_granularity_idx" ON "ReportRequest"("tenantId", "status", "granularity");

-- CreateIndex
CREATE INDEX "ReportRequest_businessId_idx" ON "ReportRequest"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportResult_cacheKey_key" ON "ReportResult"("cacheKey");

-- CreateIndex
CREATE INDEX "ReportResult_tenantId_reportRequestId_idx" ON "ReportResult"("tenantId", "reportRequestId");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- CreateIndex
CREATE INDEX "AuditEvent_businessId_idx" ON "AuditEvent"("businessId");

-- CreateIndex
CREATE INDEX "AuditEvent_programId_idx" ON "AuditEvent"("programId");

-- CreateIndex
CREATE INDEX "SystemSetting_tenantId_idx" ON "SystemSetting"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_tenantId_key_key" ON "SystemSetting"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialSet" ADD CONSTRAINT "CredentialSet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YelpBusinessMapping" ADD CONSTRAINT "YelpBusinessMapping_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramJob" ADD CONSTRAINT "ProgramJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramJob" ADD CONSTRAINT "ProgramJob_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramJob" ADD CONSTRAINT "ProgramJob_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramFeatureSnapshot" ADD CONSTRAINT "ProgramFeatureSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramFeatureSnapshot" ADD CONSTRAINT "ProgramFeatureSnapshot_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramFeatureSnapshot" ADD CONSTRAINT "ProgramFeatureSnapshot_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRequest" ADD CONSTRAINT "ReportRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRequest" ADD CONSTRAINT "ReportRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRequest" ADD CONSTRAINT "ReportRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportResult" ADD CONSTRAINT "ReportResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportResult" ADD CONSTRAINT "ReportResult_reportRequestId_fkey" FOREIGN KEY ("reportRequestId") REFERENCES "ReportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportResult" ADD CONSTRAINT "ReportResult_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_reportRequestId_fkey" FOREIGN KEY ("reportRequestId") REFERENCES "ReportRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

