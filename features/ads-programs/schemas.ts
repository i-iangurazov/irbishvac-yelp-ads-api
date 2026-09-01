import { ProgramType } from "@prisma/client";
import { z } from "zod";

import { parseCurrencyToCents } from "@/lib/utils/format";
import { YELP_MONTHLY_BUDGET_CAP_CENTS } from "@/features/ads-programs/budget-policy";
import {
  campaignLayers,
  isSeptemberCampaignLayer,
  isTemporaryAugustCampaignLayer,
  requiresSeptemberServiceTargeting,
  resolveSeptemberCategoryAliases,
  septemberBoostAllowedCategoryAliases,
  septemberBoostScopes,
  septemberCampaigns,
  temporaryAugustCampaigns,
} from "@/features/ads-programs/layers";

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
  .regex(
    /^\S+$/,
    "Use Yelp category aliases without spaces, for example plumbing or movers.",
  );

export const programTypeLabels: Record<ProgramType, string> = {
  BP: "Brand Package",
  EP: "Enhanced Profile",
  CPC: "Cost Per Click",
  RCA: "Remove Competitor Ads",
  CTA: "Call To Action",
  SLIDESHOW: "Slideshow",
  BH: "Business Highlights",
  VL: "Verified License",
  LOGO: "Business Logo",
  PORTFOLIO: "Yelp Portfolio",
};

const programFormBaseSchema = z.object({
  businessId: z.string().min(1),
  programType: z.nativeEnum(ProgramType),
  currency: currencySchema,
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  monthlyBudgetDollars: optionalCurrencyInput,
  isAutobid: z.boolean().default(true),
  maxBidDollars: optionalCurrencyInput,
  pacingMethod: z.enum(["paced", "unpaced"]).default("paced"),
  feePeriod: z
    .enum(["CALENDAR_MONTH", "ROLLING_MONTH"])
    .default("CALENDAR_MONTH"),
  campaignLayer: z.enum(campaignLayers).default("GENERAL"),
  adCategories: z.array(yelpCategoryAliasSchema).default([]),
  scheduledBudgetEffectiveDate: z.string().optional(),
  scheduledBudgetDollars: optionalCurrencyInput,
  notes: z.string().max(1000).optional(),
});

function validateProgramForm(
  value: z.infer<typeof programFormBaseSchema>,
  ctx: z.RefinementCtx,
  mode: "create" | "edit",
) {
  if (value.programType === "CPC") {
    const budgetCents = safeCurrencyToCents(value.monthlyBudgetDollars);

    if (!budgetCents || budgetCents < 2_500) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["monthlyBudgetDollars"],
        message: "Estimated monthly spend must be at least $25.00.",
      });
    }

    if (budgetCents && budgetCents > YELP_MONTHLY_BUDGET_CAP_CENTS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["monthlyBudgetDollars"],
        message: "A single Yelp campaign cannot exceed $60,000 per month.",
      });
    }

    if (!value.isAutobid) {
      const maxBidCents = safeCurrencyToCents(value.maxBidDollars);

      if (!maxBidCents || maxBidCents < 50) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maxBidDollars"],
          message: "Max bid must be at least $0.50 when autobid is off.",
        });
      }
    }
  }

  if (value.campaignLayer !== "GENERAL" && value.programType !== "CPC") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["campaignLayer"],
      message: "Campaign layers are available for CPC programs only.",
    });
  }

  if (isTemporaryAugustCampaignLayer(value.campaignLayer)) {
    const temporaryCampaign = temporaryAugustCampaigns[value.campaignLayer];
    const budgetCents = safeCurrencyToCents(value.monthlyBudgetDollars);
    const expectedBudgetCents = safeCurrencyToCents(
      temporaryCampaign.monthlyBudgetDollars,
    );

    if (
      value.adCategories.length !== 1 ||
      value.adCategories[0] !== temporaryCampaign.categoryAlias
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adCategories"],
        message: `This temporary layer must target only the ${temporaryCampaign.categoryAlias} alias.`,
      });
    }

    if (budgetCents !== expectedBudgetCents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["monthlyBudgetDollars"],
        message: `This approved temporary layer must use the $${temporaryCampaign.dailyBudgetDollars}/day budget.`,
      });
    }

    if (value.endDate !== temporaryCampaign.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "Temporary August layers must end on August 31, 2026.",
      });
    }
  }

  if (isSeptemberCampaignLayer(value.campaignLayer)) {
    const campaign = septemberCampaigns[value.campaignLayer];
    const expectedCategoryAliases = resolveSeptemberCategoryAliases(
      value.campaignLayer,
    );
    const budgetCents = safeCurrencyToCents(value.monthlyBudgetDollars);
    const expectedBudgetCents = safeCurrencyToCents(
      campaign.monthlyBudgetDollars,
    );

    if (
      value.campaignLayer === "SEPTEMBER_END_OF_MONTH_BOOST"
        ? value.adCategories.length === 0 ||
          value.adCategories.some(
            (alias) =>
              !septemberBoostAllowedCategoryAliases.includes(alias),
          )
        : value.adCategories.length !== expectedCategoryAliases.length ||
          !expectedCategoryAliases.every((alias) =>
            value.adCategories.includes(alias),
          )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adCategories"],
        message:
          "This September layer must use its approved Yelp category scope.",
      });
    }

    if (budgetCents !== expectedBudgetCents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["monthlyBudgetDollars"],
        message: `This September layer has a locked $${Number(campaign.monthlyBudgetDollars).toLocaleString("en-US")} monthly budget.`,
      });
    }

    const invalidStartDate =
      mode === "create"
        ? value.startDate !== campaign.startDate
        : !value.startDate || value.startDate > campaign.startDate;

    if (invalidStartDate || value.endDate !== campaign.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [invalidStartDate ? "startDate" : "endDate"],
        message:
          mode === "create"
            ? `This September layer must run from ${campaign.startDate} through ${campaign.endDate}.`
            : `An adopted campaign must already be running by ${campaign.startDate} and end on ${campaign.endDate}.`,
      });
    }
  }

  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End date must be on or after the start date.",
    });
  }

  if (value.scheduledBudgetEffectiveDate && !value.scheduledBudgetDollars) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduledBudgetDollars"],
      message: "Enter the future scheduled budget amount.",
    });
  }

  if (
    mode === "create" &&
    (value.scheduledBudgetEffectiveDate || value.scheduledBudgetDollars)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduledBudgetEffectiveDate"],
      message:
        "Yelp Ads future budget changes are documented on edit after the program already exists.",
    });
  }
}

export const createProgramFormSchema = programFormBaseSchema.superRefine(
  (value, ctx) => validateProgramForm(value, ctx, "create"),
);

export const editProgramFormSchema = programFormBaseSchema
  .extend({
    programId: z.string().min(1),
  })
  .superRefine((value, ctx) => validateProgramForm(value, ctx, "edit"));

export const terminateProgramFormSchema = z.object({
  programId: z.string().min(1),
  endDate: z.string().optional(),
  reason: z.string().max(500).optional(),
});

export const temporaryAugustCampaignReconcileSchema = z
  .object({
    businessId: z.string().min(1),
    campaignLayer: z.enum([
      "AUGUST_PLUMBING_TEMP",
      "AUGUST_COMMERCIAL_HVAC_TEMP",
    ]),
    dryRun: z.boolean().default(true),
    confirmation: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      !value.dryRun &&
      value.confirmation !== "APPLY_APPROVED_TEMPORARY_CAMPAIGN"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmation"],
        message:
          "Live reconciliation requires the exact approved confirmation phrase.",
      });
    }
  });

export const septemberCampaignReconcileSchema = z
  .object({
    businessId: z.string().min(1),
    campaignLayer: z.enum([
      "SEPTEMBER_HVAC_INSTALLATION",
      "SEPTEMBER_HVAC_REPAIR",
      "SEPTEMBER_HVAC_MAINTENANCE",
      "SEPTEMBER_COMMERCIAL_HVAC",
      "SEPTEMBER_PLUMBING",
      "SEPTEMBER_END_OF_MONTH_BOOST",
    ]),
    mainProgramId: z.string().min(1),
    adoptUpstreamProgramId: z.string().min(1).optional(),
    blockedKeywords: z.array(z.string().min(1).max(80)).max(100).default([]),
    boostScopes: z.array(z.enum(septemberBoostScopes)).default([]),
    serviceTargetingConfirmed: z.boolean().default(false),
    dryRun: z.boolean().default(true),
    confirmation: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const requiresServiceTargeting = requiresSeptemberServiceTargeting(
      value.campaignLayer,
      value.boostScopes,
    );

    if (
      value.campaignLayer === "SEPTEMBER_END_OF_MONTH_BOOST" &&
      value.boostScopes.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["boostScopes"],
        message:
          "Select at least one approved End-of-Month Boost service direction.",
      });
    }

    if (
      value.campaignLayer !== "SEPTEMBER_END_OF_MONTH_BOOST" &&
      value.boostScopes.length > 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["boostScopes"],
        message: "Boost service directions are valid only for the boost layer.",
      });
    }

    if (
      !value.dryRun &&
      value.confirmation !== "APPLY_APPROVED_SEPTEMBER_CAMPAIGN"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmation"],
        message:
          "Live reconciliation requires the exact approved September confirmation phrase.",
      });
    }

    if (
      !value.dryRun &&
      requiresServiceTargeting &&
      (!value.serviceTargetingConfirmed || value.blockedKeywords.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blockedKeywords"],
        message:
          "Live HVAC reconciliation requires an approved non-empty negative-keyword policy and explicit service-targeting confirmation.",
      });
    }
  });

function validateMinimumBudget(
  path: string[],
  value: string | undefined,
  ctx: z.RefinementCtx,
) {
  const cents = safeCurrencyToCents(value);

  if (!cents || cents < 2_500) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "Estimated monthly spend must be at least $25.00.",
    });
  }
}

function validateMinimumMaxBid(
  path: string[],
  value: string | undefined,
  ctx: z.RefinementCtx,
) {
  const cents = safeCurrencyToCents(value);

  if (!cents || cents < 50) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "Max bid must be at least $0.50.",
    });
  }
}

function isPastDate(value: string) {
  const input = new Date(`${value}T00:00:00.000Z`);
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  return input.getTime() < today.getTime();
}

export const currentBudgetOperationSchema = z
  .object({
    operation: z.literal("CURRENT_BUDGET"),
    currentBudgetDollars: z.string().min(1),
    internalNote: optionalShortText,
  })
  .superRefine((value, ctx) =>
    validateMinimumBudget(
      ["currentBudgetDollars"],
      value.currentBudgetDollars,
      ctx,
    ),
  );

export const scheduledBudgetOperationSchema = z
  .object({
    operation: z.literal("SCHEDULED_BUDGET"),
    scheduledBudgetDollars: z.string().min(1),
    scheduledBudgetEffectiveDate: z.string().min(1),
    internalNote: optionalShortText,
  })
  .superRefine((value, ctx) => {
    validateMinimumBudget(
      ["scheduledBudgetDollars"],
      value.scheduledBudgetDollars,
      ctx,
    );

    if (isPastDate(value.scheduledBudgetEffectiveDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledBudgetEffectiveDate"],
        message: "Scheduled budget date must be today or later.",
      });
    }
  });

export const bidStrategyOperationSchema = z
  .object({
    operation: z.literal("BID_STRATEGY"),
    pacingMethod: z.enum(["paced", "unpaced"]),
    maxBidDollars: optionalCurrencyInput,
    internalNote: optionalShortText,
  })
  .superRefine((value, ctx) => {
    if (value.maxBidDollars) {
      validateMinimumMaxBid(["maxBidDollars"], value.maxBidDollars, ctx);
    }
  });

export const programBudgetOperationSchema = z.union([
  currentBudgetOperationSchema,
  scheduledBudgetOperationSchema,
  bidStrategyOperationSchema,
]);

export const programCategoryTargetingOperationSchema = z.object({
  campaignLayer: z.enum(campaignLayers).default("GENERAL"),
  adCategories: z
    .array(yelpCategoryAliasSchema)
    .min(1, "Select at least one explicit Yelp category."),
  internalNote: optionalShortText,
});

export type CreateProgramFormValues = z.infer<typeof createProgramFormSchema>;
export type EditProgramFormValues = z.infer<typeof editProgramFormSchema>;
export type TerminateProgramFormValues = z.infer<
  typeof terminateProgramFormSchema
>;
export type CurrentBudgetOperationValues = z.infer<
  typeof currentBudgetOperationSchema
>;
export type ScheduledBudgetOperationValues = z.infer<
  typeof scheduledBudgetOperationSchema
>;
export type BidStrategyOperationValues = z.infer<
  typeof bidStrategyOperationSchema
>;
export type ProgramBudgetOperationValues = z.infer<
  typeof programBudgetOperationSchema
>;
export type ProgramCategoryTargetingOperationValues = z.infer<
  typeof programCategoryTargetingOperationSchema
>;
