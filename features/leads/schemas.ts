import { z } from "zod";

const emptyToUndefined = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

export const leadFiltersSchema = z.object({
  businessId: emptyToUndefined(z.string().min(1)),
  status: emptyToUndefined(z.enum(["QUEUED", "PROCESSING", "COMPLETED", "PARTIAL", "FAILED", "SKIPPED", "NOT_RECEIVED"])),
  attention: emptyToUndefined(z.enum(["NEEDS_ATTENTION"])),
  mappingState: emptyToUndefined(z.enum(["UNRESOLVED", "MATCHED", "MANUAL_OVERRIDE", "CONFLICT", "ERROR"])),
  internalStatus: emptyToUndefined(
    z.enum(["UNMAPPED", "ACTIVE", "NEW", "CONTACTED", "BOOKED", "SCHEDULED", "JOB_IN_PROGRESS", "COMPLETED", "CANCELED", "CLOSED_WON", "CLOSED_LOST", "LOST"])
  ),
  from: emptyToUndefined(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  to: emptyToUndefined(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  page: emptyToUndefined(z.coerce.number().int().min(1)),
  pageSize: emptyToUndefined(z.coerce.number().int().refine((value) => [25, 50, 100].includes(value), "Invalid page size"))
});

export type LeadFiltersInput = z.infer<typeof leadFiltersSchema>;

export const leadBackfillSchema = z.object({
  businessId: z.string().min(1)
});

export type LeadBackfillInput = z.infer<typeof leadBackfillSchema>;

export const leadMessageChannelSchema = z.enum(["YELP_THREAD", "EMAIL"]);

export const leadReplyDraftRequestSchema = z.object({
  channel: leadMessageChannelSchema.default("YELP_THREAD"),
  variantCount: z.coerce.number().int().min(1).max(3).default(3)
});

export type LeadReplyDraftRequestInput = z.infer<typeof leadReplyDraftRequestSchema>;

export const leadReplyDraftUsageSchema = z.object({
  requestId: z.string().trim().min(1),
  draftId: emptyToUndefined(z.string().trim().min(1)),
  action: z.enum(["DISCARDED"])
});

export type LeadReplyDraftUsageInput = z.infer<typeof leadReplyDraftUsageSchema>;

export const leadSummaryRequestSchema = z.object({
  refresh: z.boolean().default(false)
});

export type LeadSummaryRequestInput = z.infer<typeof leadSummaryRequestSchema>;

export const leadSummaryUsageSchema = z.object({
  requestId: z.string().trim().min(1),
  action: z.enum(["DISMISSED"])
});

export type LeadSummaryUsageInput = z.infer<typeof leadSummaryUsageSchema>;

export const leadReplyAiMetadataSchema = z
  .object({
    requestId: z.string().trim().min(1),
    draftId: z.string().trim().min(1),
    edited: z.boolean().default(false),
    warningCodes: z.array(z.string().trim().min(1)).max(10).default([])
  })
  .optional();

export const leadReplyFormSchema = z.object({
  channel: leadMessageChannelSchema,
  subject: z.string().trim().max(200).optional().or(z.literal("")),
  body: z.string().trim().min(1).max(5000),
  aiDraft: leadReplyAiMetadataSchema
});

export type LeadReplyFormInput = z.infer<typeof leadReplyFormSchema>;

export const leadMarkRepliedSchema = z.object({
  replyType: z.enum(["EMAIL", "PHONE"]).default("PHONE")
});

export type LeadMarkRepliedInput = z.infer<typeof leadMarkRepliedSchema>;
