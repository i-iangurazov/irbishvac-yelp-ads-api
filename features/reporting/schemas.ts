import { z } from "zod";

const emptyToUndefined = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

export const reportMetrics = [
  "impressions",
  "clicks",
  "adSpendCents",
  "calls",
  "websiteLeads",
  "bookings",
  "totalBusinessViews"
] as const;

export const reportRequestFormSchema = z
  .object({
    granularity: z.enum(["DAILY", "MONTHLY"]),
    businessIds: z.array(z.string().min(1)).min(1).max(20),
    startDate: z.string().date(),
    endDate: z.string().date(),
    metrics: z.array(z.enum(reportMetrics)).default(["impressions", "clicks", "adSpendCents"])
  })
  .superRefine((value, ctx) => {
    const start = new Date(value.startDate);
    const end = new Date(value.endDate);

    if (start > end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be on or after the start date."
      });
    }

    const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1;

    if (value.granularity === "DAILY" && diffDays > 31) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "Daily reports may span at most 31 days."
      });
    }

    if (value.granularity === "MONTHLY" && diffDays > 730) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "Monthly reports may span at most 24 months."
      });
    }
  });

export type ReportRequestFormValues = z.infer<typeof reportRequestFormSchema>;

export const reportBreakdownViews = ["location", "service"] as const;
export const reportUnknownBucketValue = "unknown";

export const reportBreakdownFiltersSchema = z
  .object({
    view: emptyToUndefined(z.enum(reportBreakdownViews)),
    from: emptyToUndefined(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    to: emptyToUndefined(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    locationId: emptyToUndefined(z.string().min(1)),
    serviceCategoryId: emptyToUndefined(z.string().min(1))
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to && new Date(value.from) > new Date(value.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "End date must be on or after the start date."
      });
    }
  });

export type ReportBreakdownFiltersInput = z.infer<typeof reportBreakdownFiltersSchema>;
