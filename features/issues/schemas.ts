import { z } from "zod";

export const operatorIssueFiltersSchema = z.object({
  issueType: z.string().optional(),
  businessId: z.string().optional(),
  locationId: z.string().optional(),
  severity: z.string().optional(),
  status: z.string().optional().default("OPEN"),
  age: z.enum(["", "1", "3", "7", "14"]).optional().default("")
});

export type OperatorIssueFiltersInput = z.infer<typeof operatorIssueFiltersSchema>;

export const operatorIssueResolutionSchema = z.object({
  reason: z.string().trim().min(2).max(120),
  note: z.string().trim().max(1000).optional().or(z.literal(""))
});

export const operatorIssueNoteSchema = z.object({
  note: z.string().trim().min(2).max(1000)
});

const operatorIssueIdsSchema = z.array(z.string().trim().min(1)).min(1).max(100);

export const operatorIssueBulkActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("retry"),
    issueIds: operatorIssueIdsSchema
  }),
  z.object({
    action: z.literal("resolve"),
    issueIds: operatorIssueIdsSchema,
    reason: operatorIssueResolutionSchema.shape.reason,
    note: operatorIssueResolutionSchema.shape.note
  }),
  z.object({
    action: z.literal("ignore"),
    issueIds: operatorIssueIdsSchema,
    reason: operatorIssueResolutionSchema.shape.reason,
    note: operatorIssueResolutionSchema.shape.note
  }),
  z.object({
    action: z.literal("note"),
    issueIds: operatorIssueIdsSchema,
    note: operatorIssueNoteSchema.shape.note
  })
]);

export type OperatorIssueBulkActionInput = z.infer<typeof operatorIssueBulkActionSchema>;
