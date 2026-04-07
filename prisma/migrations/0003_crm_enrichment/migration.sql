ALTER TYPE "InternalLeadStatus" ADD VALUE 'CONTACTED';
ALTER TYPE "InternalLeadStatus" ADD VALUE 'CLOSED_WON';
ALTER TYPE "InternalLeadStatus" ADD VALUE 'CLOSED_LOST';

CREATE TYPE "CrmLeadMappingState" AS ENUM ('UNRESOLVED', 'MATCHED', 'MANUAL_OVERRIDE', 'CONFLICT', 'ERROR');

ALTER TABLE "CrmLeadMapping"
ADD COLUMN "state" "CrmLeadMappingState" NOT NULL DEFAULT 'UNRESOLVED',
ADD COLUMN "issueSummary" TEXT,
ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
ALTER COLUMN "externalCrmLeadId" DROP NOT NULL,
ALTER COLUMN "matchedAt" DROP NOT NULL;

CREATE INDEX "CrmLeadMapping_tenantId_state_idx" ON "CrmLeadMapping"("tenantId", "state");
