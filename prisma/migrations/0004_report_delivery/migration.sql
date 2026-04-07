CREATE TYPE "ReportScheduleCadence" AS ENUM ('WEEKLY', 'MONTHLY');

CREATE TYPE "ReportScheduleRunScope" AS ENUM ('ACCOUNT', 'LOCATION');

CREATE TYPE "ReportScheduleGenerationStatus" AS ENUM ('PENDING', 'REQUESTED', 'PROCESSING', 'READY', 'FAILED', 'SKIPPED');

CREATE TYPE "ReportScheduleDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "ReportSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "name" TEXT NOT NULL,
    "cadence" "ReportScheduleCadence" NOT NULL,
    "timezone" TEXT NOT NULL,
    "sendDayOfWeek" INTEGER,
    "sendDayOfMonth" INTEGER,
    "sendHour" INTEGER NOT NULL,
    "sendMinute" INTEGER NOT NULL DEFAULT 0,
    "deliverPerLocation" BOOLEAN NOT NULL DEFAULT false,
    "recipientEmailsJson" JSONB NOT NULL DEFAULT '[]',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "lastSuccessfulGenerationAt" TIMESTAMP(3),
    "lastSuccessfulDeliveryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportScheduleRun" (
    "id" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "reportRequestId" TEXT,
    "locationId" TEXT,
    "scope" "ReportScheduleRunScope" NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "generationStatus" "ReportScheduleGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryStatus" "ReportScheduleDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "recipientEmailsJson" JSONB NOT NULL DEFAULT '[]',
    "dashboardUrl" TEXT,
    "summaryJson" JSONB,
    "generationStartedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),
    "deliveryStartedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastAttemptedAt" TIMESTAMP(3),
    "errorSummary" TEXT,
    "errorJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportScheduleRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportScheduleRun_runKey_key" ON "ReportScheduleRun"("runKey");
CREATE INDEX "ReportSchedule_tenantId_isEnabled_cadence_idx" ON "ReportSchedule"("tenantId", "isEnabled", "cadence");
CREATE INDEX "ReportSchedule_businessId_idx" ON "ReportSchedule"("businessId");
CREATE INDEX "ReportScheduleRun_tenantId_generationStatus_deliveryStatus_idx" ON "ReportScheduleRun"("tenantId", "generationStatus", "deliveryStatus");
CREATE INDEX "ReportScheduleRun_scheduleId_scheduledFor_idx" ON "ReportScheduleRun"("scheduleId", "scheduledFor");
CREATE INDEX "ReportScheduleRun_reportRequestId_locationId_idx" ON "ReportScheduleRun"("reportRequestId", "locationId");

ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReportScheduleRun" ADD CONSTRAINT "ReportScheduleRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportScheduleRun" ADD CONSTRAINT "ReportScheduleRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ReportSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportScheduleRun" ADD CONSTRAINT "ReportScheduleRun_reportRequestId_fkey" FOREIGN KEY ("reportRequestId") REFERENCES "ReportRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportScheduleRun" ADD CONSTRAINT "ReportScheduleRun_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
