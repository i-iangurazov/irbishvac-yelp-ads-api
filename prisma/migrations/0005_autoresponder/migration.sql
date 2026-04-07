CREATE TYPE "LeadAutomationChannel" AS ENUM ('EMAIL');

CREATE TYPE "LeadAutomationAttemptStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TYPE "LeadAutomationSkipReason" AS ENUM (
    'AUTORESPONDER_DISABLED',
    'NO_MATCHING_RULE',
    'TEMPLATE_DISABLED',
    'MISSING_CONTACT',
    'OUTSIDE_WORKING_HOURS',
    'CHANNEL_UNSUPPORTED',
    'DUPLICATE'
);

CREATE TABLE "LeadAutomationTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "LeadAutomationChannel" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "subjectTemplate" TEXT,
    "bodyTemplate" TEXT NOT NULL,
    "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'INTERNAL',
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadAutomationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadAutomationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "locationId" TEXT,
    "serviceCategoryId" TEXT,
    "name" TEXT NOT NULL,
    "channel" "LeadAutomationChannel" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "onlyDuringWorkingHours" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT,
    "workingDaysJson" JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'INTERNAL',
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadAutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadAutomationAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "businessId" TEXT,
    "locationId" TEXT,
    "serviceCategoryId" TEXT,
    "ruleId" TEXT,
    "templateId" TEXT,
    "channel" "LeadAutomationChannel",
    "status" "LeadAutomationAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "skipReason" "LeadAutomationSkipReason",
    "sourceSystem" "RecordSourceSystem" NOT NULL DEFAULT 'INTERNAL',
    "recipient" TEXT,
    "renderedSubject" TEXT,
    "renderedBody" TEXT,
    "providerMessageId" TEXT,
    "providerStatus" TEXT,
    "providerMetadataJson" JSONB,
    "errorSummary" TEXT,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadAutomationAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadAutomationTemplate_tenantId_channel_isEnabled_idx" ON "LeadAutomationTemplate"("tenantId", "channel", "isEnabled");
CREATE INDEX "LeadAutomationTemplate_tenantId_name_idx" ON "LeadAutomationTemplate"("tenantId", "name");

CREATE INDEX "LeadAutomationRule_tenantId_isEnabled_priority_idx" ON "LeadAutomationRule"("tenantId", "isEnabled", "priority");
CREATE INDEX "LeadAutomationRule_tenantId_locationId_serviceCategoryId_idx" ON "LeadAutomationRule"("tenantId", "locationId", "serviceCategoryId");

CREATE UNIQUE INDEX "LeadAutomationAttempt_leadId_key" ON "LeadAutomationAttempt"("leadId");
CREATE INDEX "LeadAutomationAttempt_tenantId_status_triggeredAt_idx" ON "LeadAutomationAttempt"("tenantId", "status", "triggeredAt");
CREATE INDEX "LeadAutomationAttempt_tenantId_businessId_locationId_serviceCategory_idx" ON "LeadAutomationAttempt"("tenantId", "businessId", "locationId", "serviceCategoryId");

ALTER TABLE "LeadAutomationTemplate" ADD CONSTRAINT "LeadAutomationTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadAutomationRule" ADD CONSTRAINT "LeadAutomationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadAutomationRule" ADD CONSTRAINT "LeadAutomationRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LeadAutomationTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadAutomationRule" ADD CONSTRAINT "LeadAutomationRule_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadAutomationRule" ADD CONSTRAINT "LeadAutomationRule_serviceCategoryId_fkey" FOREIGN KEY ("serviceCategoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeadAutomationAttempt" ADD CONSTRAINT "LeadAutomationAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadAutomationAttempt" ADD CONSTRAINT "LeadAutomationAttempt_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "YelpLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadAutomationAttempt" ADD CONSTRAINT "LeadAutomationAttempt_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadAutomationAttempt" ADD CONSTRAINT "LeadAutomationAttempt_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadAutomationAttempt" ADD CONSTRAINT "LeadAutomationAttempt_serviceCategoryId_fkey" FOREIGN KEY ("serviceCategoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadAutomationAttempt" ADD CONSTRAINT "LeadAutomationAttempt_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "LeadAutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadAutomationAttempt" ADD CONSTRAINT "LeadAutomationAttempt_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LeadAutomationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
