-- AlterTable
ALTER TABLE "LeadAutomationTemplate"
ADD COLUMN "businessId" TEXT;

-- AlterTable
ALTER TABLE "LeadAutomationRule"
ADD COLUMN "businessId" TEXT;

-- CreateTable
CREATE TABLE "LeadAutomationBusinessOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultChannel" "LeadAutomationChannel" NOT NULL DEFAULT 'YELP_THREAD',
    "emailFallbackEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiAssistEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiModel" TEXT NOT NULL DEFAULT 'gpt-5-nano',
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadAutomationBusinessOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadAutomationTemplate_tenantId_businessId_channel_isEnab_idx" ON "LeadAutomationTemplate"("tenantId", "businessId", "channel", "isEnabled");

-- CreateIndex
CREATE INDEX "LeadAutomationRule_tenantId_businessId_locationId_serv_idx" ON "LeadAutomationRule"("tenantId", "businessId", "locationId", "serviceCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadAutomationBusinessOverride_tenantId_businessId_key" ON "LeadAutomationBusinessOverride"("tenantId", "businessId");

-- CreateIndex
CREATE INDEX "LeadAutomationBusinessOverride_tenantId_businessId_idx" ON "LeadAutomationBusinessOverride"("tenantId", "businessId");

-- AddForeignKey
ALTER TABLE "LeadAutomationTemplate" ADD CONSTRAINT "LeadAutomationTemplate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAutomationRule" ADD CONSTRAINT "LeadAutomationRule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAutomationBusinessOverride" ADD CONSTRAINT "LeadAutomationBusinessOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAutomationBusinessOverride" ADD CONSTRAINT "LeadAutomationBusinessOverride_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
