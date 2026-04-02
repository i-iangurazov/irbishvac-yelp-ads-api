import { CredentialKind, RoleCode } from "@prisma/client";
import { z } from "zod";

export const capabilityFlagsSchema = z.object({
  hasAdsApi: z.boolean().default(false),
  hasLeadsApi: z.boolean().default(false),
  hasReportingApi: z.boolean().default(false),
  hasConversionsApi: z.boolean().default(false),
  hasPartnerSupportApi: z.boolean().default(false),
  hasCrmIntegration: z.boolean().default(false),
  adsApiEnabled: z.boolean().default(false),
  programFeatureApiEnabled: z.boolean().default(false),
  reportingApiEnabled: z.boolean().default(false),
  dataIngestionApiEnabled: z.boolean().default(false),
  businessMatchApiEnabled: z.boolean().default(false),
  demoModeEnabled: z.boolean().default(false)
});

export const credentialFormSchema = z.object({
  kind: z.nativeEnum(CredentialKind),
  label: z.string().min(2).max(80),
  username: z.string().max(200).optional(),
  secret: z.string().max(2000).optional(),
  baseUrl: z.string().url().or(z.literal("")).optional(),
  isEnabled: z.boolean().default(false),
  testPath: z.string().max(200).optional()
});

export const roleAssignmentSchema = z.object({
  userId: z.string().min(1),
  roleCode: z.nativeEnum(RoleCode)
});

export const credentialKindLabels: Record<CredentialKind, string> = {
  ADS_BASIC_AUTH: "Partner API Basic Auth",
  REPORTING_FUSION: "Fusion API Key",
  BUSINESS_MATCH: "Business Match API",
  DATA_INGESTION: "Data Ingestion API"
};
