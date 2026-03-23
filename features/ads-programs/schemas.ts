import { ProgramType } from "@prisma/client";
import { z } from "zod";

import { parseCurrencyToCents } from "@/lib/utils/format";

const currencySchema = z.string().length(3).default("USD");

function safeCurrencyToCents(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    return parseCurrencyToCents(value);
  } catch {
    return undefined;
  }
}

const optionalCurrencyInput = z.string().optional();
const optionalShortText = z.string().max(1000).optional();
const yelpCategoryAliasSchema = z
  .string()
  .min(1)
  .regex(/^\S+$/, "Use Yelp category aliases without spaces, for example plumbing or movers.");

export const programTypeLabels: Record<ProgramType, string> = {
  BP: "Brand Package",
  EP: "Enhanced Profile",
  CPC: "Cost Per Click",
  RCA: "Request a Call",
  CTA: "Call To Action",
  SLIDESHOW: "Slideshow",
  BH: "Business Highlights",
  VL: "Verified License",
  LOGO: "Business Logo",
  PORTFOLIO: "Yelp Portfolio"
};

const programFormBaseSchema = z.object({
  businessId: z.string().min(1),
  programType: z.nativeEnum(ProgramType),
  currency: currencySchema,
  startDate: z.string().optional(),
  monthlyBudgetDollars: optionalCurrencyInput,
  isAutobid: z.boolean().default(true),
  maxBidDollars: optionalCurrencyInput,
  pacingMethod: z.enum(["paced", "unpaced"]).default("paced"),
  feePeriod: z.enum(["CALENDAR_MONTH", "ROLLING_MONTH"]).default("CALENDAR_MONTH"),
  adCategories: z.array(yelpCategoryAliasSchema).default([]),
  scheduledBudgetEffectiveDate: z.string().optional(),
  scheduledBudgetDollars: optionalCurrencyInput,
  notes: z.string().max(1000).optional()
});

function validateProgramForm(
  value: z.infer<typeof programFormBaseSchema>,
  ctx: z.RefinementCtx,
  mode: "create" | "edit"
) {
    if (value.programType === "CPC") {
      const budgetCents = safeCurrencyToCents(value.monthlyBudgetDollars);

      if (!budgetCents || budgetCents < 2_500) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["monthlyBudgetDollars"],
          message: "CPC monthly budget must be at least $25.00."
        });
      }

      if (!value.isAutobid) {
        const maxBidCents = safeCurrencyToCents(value.maxBidDollars);

        if (!maxBidCents || maxBidCents < 50) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["maxBidDollars"],
            message: "Max bid must be at least $0.50 when autobid is off."
          });
        }
      }

    }

    if (value.scheduledBudgetEffectiveDate && !value.scheduledBudgetDollars) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledBudgetDollars"],
        message: "Enter the future scheduled budget amount."
      });
    }

    if (mode === "create" && (value.scheduledBudgetEffectiveDate || value.scheduledBudgetDollars)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledBudgetEffectiveDate"],
        message: "Yelp Ads future budget changes are documented on edit after the program already exists."
      });
    }
}

export const createProgramFormSchema = programFormBaseSchema.superRefine((value, ctx) => validateProgramForm(value, ctx, "create"));

export const editProgramFormSchema = programFormBaseSchema
  .extend({
    programId: z.string().min(1)
  })
  .superRefine((value, ctx) => validateProgramForm(value, ctx, "edit"));

export const terminateProgramFormSchema = z.object({
  programId: z.string().min(1),
  endDate: z.string().optional(),
  reason: z.string().max(500).optional()
});

function validateMinimumBudget(path: string[], value: string | undefined, ctx: z.RefinementCtx) {
  const cents = safeCurrencyToCents(value);

  if (!cents || cents < 2_500) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "Budget must be at least $25.00."
    });
  }
}

function validateMinimumMaxBid(path: string[], value: string | undefined, ctx: z.RefinementCtx) {
  const cents = safeCurrencyToCents(value);

  if (!cents || cents < 50) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "Max bid must be at least $0.50."
    });
  }
}

function isPastDate(value: string) {
  const input = new Date(`${value}T00:00:00.000Z`);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  return input.getTime() < today.getTime();
}

export const currentBudgetOperationSchema = z
  .object({
    operation: z.literal("CURRENT_BUDGET"),
    currentBudgetDollars: z.string().min(1),
    internalNote: optionalShortText
  })
  .superRefine((value, ctx) => validateMinimumBudget(["currentBudgetDollars"], value.currentBudgetDollars, ctx));

export const scheduledBudgetOperationSchema = z
  .object({
    operation: z.literal("SCHEDULED_BUDGET"),
    scheduledBudgetDollars: z.string().min(1),
    scheduledBudgetEffectiveDate: z.string().min(1),
    internalNote: optionalShortText
  })
  .superRefine((value, ctx) => {
    validateMinimumBudget(["scheduledBudgetDollars"], value.scheduledBudgetDollars, ctx);

    if (isPastDate(value.scheduledBudgetEffectiveDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledBudgetEffectiveDate"],
        message: "Scheduled budget date must be today or later."
      });
    }
  });

export const bidStrategyOperationSchema = z
  .object({
    operation: z.literal("BID_STRATEGY"),
    pacingMethod: z.enum(["paced", "unpaced"]),
    maxBidDollars: optionalCurrencyInput,
    internalNote: optionalShortText
  })
  .superRefine((value, ctx) => {
    if (value.maxBidDollars) {
      validateMinimumMaxBid(["maxBidDollars"], value.maxBidDollars, ctx);
    }
  });

export const programBudgetOperationSchema = z.union([
  currentBudgetOperationSchema,
  scheduledBudgetOperationSchema,
  bidStrategyOperationSchema
]);

export type CreateProgramFormValues = z.infer<typeof createProgramFormSchema>;
export type EditProgramFormValues = z.infer<typeof editProgramFormSchema>;
export type TerminateProgramFormValues = z.infer<typeof terminateProgramFormSchema>;
export type CurrentBudgetOperationValues = z.infer<typeof currentBudgetOperationSchema>;
export type ScheduledBudgetOperationValues = z.infer<typeof scheduledBudgetOperationSchema>;
export type BidStrategyOperationValues = z.infer<typeof bidStrategyOperationSchema>;
export type ProgramBudgetOperationValues = z.infer<typeof programBudgetOperationSchema>;
