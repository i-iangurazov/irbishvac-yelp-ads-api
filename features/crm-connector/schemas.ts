import { z } from "zod";

const emptyToUndefined = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

export const serviceTitanConnectorFormSchema = z.object({
  label: z.string().min(2).max(80).default("ServiceTitan Connector"),
  environment: z.enum(["INTEGRATION", "PRODUCTION"]).default("PRODUCTION"),
  tenantId: z.string().min(1).max(120),
  appKey: z.string().min(1).max(500),
  clientId: z.string().min(1).max(500),
  clientSecret: emptyToUndefined(z.string().min(1).max(2000)),
  apiBaseUrl: z.string().url(),
  authBaseUrl: z.string().url(),
  isEnabled: z.boolean().default(false)
});

export const serviceTitanReferenceSyncSchema = z.object({
  scope: z.enum(["ALL", "LOCATIONS", "SERVICES"]).default("ALL")
});

export const serviceTitanLifecycleSyncSchema = z.object({
  mode: z.enum(["DUE", "RECENT"]).default("DUE"),
  lookbackDays: z.coerce.number().int().min(1).max(30).default(7),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const businessLocationAssignmentSchema = z.object({
  businessId: z.string().min(1),
  locationId: z.string().optional().or(z.literal("")).transform((value) => (value ? value : null))
});

export const locationConnectorMappingSchema = z.object({
  locationId: z.string().min(1),
  externalCrmLocationId: z.string().optional().or(z.literal("")).transform((value) => (value ? value : null))
});

export const serviceConnectorMappingSchema = z.object({
  serviceCategoryId: z.string().min(1),
  crmCodes: z
    .string()
    .max(4000)
    .transform((value) =>
      value
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
});

export type ServiceTitanConnectorFormValues = z.infer<typeof serviceTitanConnectorFormSchema>;
export type ServiceTitanLifecycleSyncValues = z.infer<typeof serviceTitanLifecycleSyncSchema>;
