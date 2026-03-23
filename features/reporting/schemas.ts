import { z } from "zod";

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
