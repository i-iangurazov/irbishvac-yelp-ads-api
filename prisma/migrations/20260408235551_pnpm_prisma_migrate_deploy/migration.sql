-- DropIndex
DROP INDEX "LeadAutomationRule_tenantId_businessId_locationId_serv_idx";

-- DropIndex
DROP INDEX "LeadAutomationRule_tenantId_isEnabled_priority_idx";

-- DropIndex
DROP INDEX "LeadAutomationRule_tenantId_locationId_serviceCategoryId_idx";

-- AlterTable
ALTER TABLE "CrmLeadMapping" ALTER COLUMN "matchedAt" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "LeadAutomationAttempt_tenantId_businessId_locationId_serviceCat" RENAME TO "LeadAutomationAttempt_tenantId_businessId_locationId_servic_idx";

-- RenameIndex
ALTER INDEX "LeadAutomationRule_tenantId_businessId_locationId_serviceC_idx" RENAME TO "LeadAutomationRule_tenantId_businessId_locationId_serviceCa_idx";

-- RenameIndex
ALTER INDEX "LeadAutomationTemplate_tenantId_businessId_channel_isEnab_idx" RENAME TO "LeadAutomationTemplate_tenantId_businessId_channel_isEnable_idx";

-- RenameIndex
ALTER INDEX "OperatorIssue_businessId_locationId_leadId_reportRequestId_idx" RENAME TO "OperatorIssue_businessId_locationId_leadId_reportRequestId__idx";
