import { z } from "zod";

const emptyToUndefined = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

export const crmLeadMappingFormSchema = z
  .object({
    state: z.enum(["UNRESOLVED", "MATCHED", "MANUAL_OVERRIDE", "CONFLICT", "ERROR"]),
    locationId: emptyToUndefined(z.string().min(1)),
    externalCrmLeadId: emptyToUndefined(z.string().min(1)),
    externalOpportunityId: emptyToUndefined(z.string().min(1)),
    externalJobId: emptyToUndefined(z.string().min(1)),
    matchMethod: emptyToUndefined(z.string().min(1)),
    confidenceScore: emptyToUndefined(z.coerce.number().min(0).max(1)),
    issueSummary: emptyToUndefined(z.string().min(3).max(500))
  })
  .superRefine((value, ctx) => {
    const hasReference = Boolean(value.externalCrmLeadId || value.externalOpportunityId || value.externalJobId);

    if ((value.state === "MATCHED" || value.state === "MANUAL_OVERRIDE") && !hasReference) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one CRM entity reference for a resolved mapping.",
        path: ["externalCrmLeadId"]
      });
    }

    if ((value.state === "CONFLICT" || value.state === "ERROR") && !value.issueSummary) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add a short issue summary so operators know what failed.",
        path: ["issueSummary"]
      });
    }
  });

export type CrmLeadMappingFormValues = z.infer<typeof crmLeadMappingFormSchema>;

export const crmLeadStatusFormSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "BOOKED", "SCHEDULED", "JOB_IN_PROGRESS", "COMPLETED", "CANCELED", "CLOSED_WON", "CLOSED_LOST", "LOST"]),
  occurredAt: z.string().min(1),
  substatus: emptyToUndefined(z.string().min(1).max(120)),
  note: emptyToUndefined(z.string().min(1).max(500))
});

export type CrmLeadStatusFormValues = z.infer<typeof crmLeadStatusFormSchema>;
