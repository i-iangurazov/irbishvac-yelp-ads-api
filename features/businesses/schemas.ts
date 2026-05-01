import { z } from "zod";

export const businessCategorySchema = z.object({
  label: z.string().min(1).max(120),
  alias: z.string().min(1).max(120).optional()
});

export const businessSearchSchema = z.object({
  query: z.string().min(2).max(120),
  location: z.string().max(120).optional()
});

export const businessSaveSchema = z.object({
  source: z.enum(["manual", "match"]).default("manual"),
  encrypted_business_id: z.string().min(3).max(255),
  name: z.string().min(2).max(160),
  city: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  country: z.string().max(80).optional(),
  categories: z.array(z.union([z.string().min(1).max(120), businessCategorySchema])).max(20).optional(),
  readiness: z
    .object({
      hasAboutText: z.boolean().optional(),
      hasCategories: z.boolean().optional(),
      missingItems: z.array(z.string()).optional()
    })
    .optional()
});

export const manualBusinessFormSchema = z.object({
  name: z.string().min(2).max(160),
  encrypted_business_id: z.string().min(3).max(255),
  city: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  country: z.string().max(80).default("US"),
  categoriesText: z.string().max(2_000).optional(),
  hasAboutText: z.boolean().default(false)
});

export const readinessPatchSchema = z.object({
  businessId: z.string().min(1),
  specialties: z.string().max(1_500).optional(),
  categories: z.array(z.string().min(1)).max(20).default([]),
  aboutThisBusiness: z.string().max(2_000).optional()
});

export const yelpBusinessSubscriptionActionSchema = z.object({
  action: z.enum(["REQUEST_WEBHOOK", "VERIFY_WEBHOOK"])
});

export const deleteBusinessFormSchema = z.object({
  businessId: z.string().min(1),
  confirmationText: z.string().min(1).max(160)
});
