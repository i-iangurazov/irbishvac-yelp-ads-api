import { z } from "zod";

const emptyToUndefined = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

export const leadFiltersSchema = z.object({
  businessId: emptyToUndefined(z.string().min(1)),
  status: emptyToUndefined(z.enum(["QUEUED", "PROCESSING", "COMPLETED", "PARTIAL", "FAILED", "SKIPPED", "NOT_RECEIVED"])),
  mappingState: emptyToUndefined(z.enum(["UNRESOLVED", "MATCHED", "MANUAL_OVERRIDE", "CONFLICT", "ERROR"])),
  internalStatus: emptyToUndefined(
    z.enum(["UNMAPPED", "NEW", "CONTACTED", "BOOKED", "SCHEDULED", "JOB_IN_PROGRESS", "COMPLETED", "CANCELED", "CLOSED_WON", "CLOSED_LOST", "LOST"])
  ),
  from: emptyToUndefined(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  to: emptyToUndefined(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
});

export type LeadFiltersInput = z.infer<typeof leadFiltersSchema>;

export const leadBackfillSchema = z.object({
  businessId: z.string().min(1)
});

export type LeadBackfillInput = z.infer<typeof leadBackfillSchema>;

export const leadMessageChannelSchema = z.enum(["YELP_THREAD", "EMAIL"]);

export const leadReplyFormSchema = z.object({
  channel: leadMessageChannelSchema,
  subject: z.string().trim().max(200).optional().or(z.literal("")),
  body: z.string().trim().min(1).max(5000)
});

export type LeadReplyFormInput = z.infer<typeof leadReplyFormSchema>;
