import { describe, expect, it } from "vitest";

import {
  createProgramFormSchema,
  currentBudgetOperationSchema,
  programCategoryTargetingOperationSchema,
  scheduledBudgetOperationSchema,
  septemberCampaignReconcileSchema,
} from "@/features/ads-programs/schemas";
import { deleteBusinessFormSchema } from "@/features/businesses/schemas";
import { reportRequestFormSchema } from "@/features/reporting/schemas";
import { monthlyBudgetDollarsFromDailyInput } from "@/lib/yelp/budget";

describe("validation", () => {
  it("rejects CPC requests under the minimum budget", () => {
    const result = createProgramFormSchema.safeParse({
      businessId: "business_1",
      programType: "CPC",
      currency: "USD",
      monthlyBudgetDollars: "10.00",
      isAutobid: true,
      maxBidDollars: "",
      pacingMethod: "paced",
      feePeriod: "CALENDAR_MONTH",
      adCategories: ["HVAC"],
    });

    expect(result.success).toBe(false);
  });

  it("allows CPC create without explicit ad categories", () => {
    const result = createProgramFormSchema.safeParse({
      businessId: "business_1",
      programType: "CPC",
      currency: "USD",
      monthlyBudgetDollars: "300.00",
      isAutobid: true,
      maxBidDollars: "",
      pacingMethod: "paced",
      feePeriod: "CALENDAR_MONTH",
      adCategories: [],
    });

    expect(result.success).toBe(true);
  });

  it("allows an approved September layer to start after September 1", () => {
    const base = {
      businessId: "business_1",
      programType: "CPC" as const,
      currency: "USD",
      startDate: "2026-09-02",
      endDate: "2026-09-30",
      monthlyBudgetDollars: "12000",
      isAutobid: true,
      pacingMethod: "paced" as const,
      feePeriod: "CALENDAR_MONTH" as const,
      campaignLayer: "SEPTEMBER_HVAC_INSTALLATION" as const,
      adCategories: ["hvac"],
    };

    expect(createProgramFormSchema.safeParse(base).success).toBe(true);
    expect(
      createProgramFormSchema.safeParse({
        ...base,
        startDate: "2026-10-01",
      }).success,
    ).toBe(false);
  });

  it("rejects daily reports longer than 31 days", () => {
    const result = reportRequestFormSchema.safeParse({
      granularity: "DAILY",
      businessIds: ["business_1"],
      startDate: "2026-01-01",
      endDate: "2026-02-15",
      metrics: ["impressions"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects budget operations below the CPC minimum", () => {
    const result = currentBudgetOperationSchema.safeParse({
      operation: "CURRENT_BUDGET",
      currentBudgetDollars: "20.00",
    });

    expect(result.success).toBe(false);
  });

  it("applies the CPC minimum to the estimated monthly spend from daily input", () => {
    const belowMinimum = currentBudgetOperationSchema.safeParse({
      operation: "CURRENT_BUDGET",
      currentBudgetDollars: monthlyBudgetDollarsFromDailyInput("0.83"),
    });
    const atMinimum = currentBudgetOperationSchema.safeParse({
      operation: "CURRENT_BUDGET",
      currentBudgetDollars: monthlyBudgetDollarsFromDailyInput("0.84"),
    });

    expect(belowMinimum.success).toBe(false);
    expect(atMinimum.success).toBe(true);
  });

  it("rejects scheduled budget changes in the past", () => {
    const result = scheduledBudgetOperationSchema.safeParse({
      operation: "SCHEDULED_BUDGET",
      scheduledBudgetDollars: "30.00",
      scheduledBudgetEffectiveDate: "2026-03-01",
    });

    expect(result.success).toBe(false);
  });

  it("requires explicit aliases for category-targeting edits", () => {
    expect(
      programCategoryTargetingOperationSchema.safeParse({
        adCategories: [],
      }).success,
    ).toBe(false);
    expect(
      programCategoryTargetingOperationSchema.safeParse({
        adCategories: ["hvac", "plumbing", "waterheaterinstallrepair"],
        internalNote: "Restore listing-wide targeting.",
      }).success,
    ).toBe(true);
  });

  it("requires approved service targeting for live September HVAC changes", () => {
    const base = {
      businessId: "business_1",
      campaignLayer: "SEPTEMBER_HVAC_INSTALLATION",
      mainProgramId: "main_program",
      dryRun: false,
      confirmation: "APPLY_APPROVED_SEPTEMBER_CAMPAIGN",
    };

    expect(septemberCampaignReconcileSchema.safeParse(base).success).toBe(
      false,
    );
    expect(
      septemberCampaignReconcileSchema.safeParse({
        ...base,
        serviceTargetingConfirmed: true,
        blockedKeywords: ["AC Repair"],
      }).success,
    ).toBe(true);
    const deferred = septemberCampaignReconcileSchema.safeParse({
      ...base,
      serviceTargetingConfirmed: true,
      deferServiceTargeting: true,
      blockedKeywords: ["AC Repair"],
    });
    expect(deferred.success).toBe(true);
    if (deferred.success) {
      expect(deferred.data.deferServiceTargeting).toBe(true);
    }
  });

  it("allows a read-only September dry run without targeting approval", () => {
    expect(
      septemberCampaignReconcileSchema.safeParse({
        businessId: "business_1",
        campaignLayer: "SEPTEMBER_HVAC_REPAIR",
        mainProgramId: "main_program",
        dryRun: true,
      }).success,
    ).toBe(true);
  });

  it("requires an allowlisted direction for the September boost", () => {
    const base = {
      businessId: "business_1",
      campaignLayer: "SEPTEMBER_END_OF_MONTH_BOOST",
      mainProgramId: "main_program",
      dryRun: true,
    };

    expect(septemberCampaignReconcileSchema.safeParse(base).success).toBe(
      false,
    );
    expect(
      septemberCampaignReconcileSchema.safeParse({
        ...base,
        boostScopes: ["PLUMBING", "WATER_HEATER"],
      }).success,
    ).toBe(true);
    expect(
      septemberCampaignReconcileSchema.safeParse({
        ...base,
        boostScopes: ["COMMERCIAL_HVAC"],
      }).success,
    ).toBe(false);
  });

  it("requires keyword targeting when a live boost includes HVAC", () => {
    const base = {
      businessId: "business_1",
      campaignLayer: "SEPTEMBER_END_OF_MONTH_BOOST",
      mainProgramId: "main_program",
      boostScopes: ["HVAC_REPAIR"],
      dryRun: false,
      confirmation: "APPLY_APPROVED_SEPTEMBER_CAMPAIGN",
    };

    expect(septemberCampaignReconcileSchema.safeParse(base).success).toBe(
      false,
    );
    expect(
      septemberCampaignReconcileSchema.safeParse({
        ...base,
        serviceTargetingConfirmed: true,
        blockedKeywords: ["ac maintenance"],
      }).success,
    ).toBe(true);
  });

  it("requires confirmation text for business deletion", () => {
    const result = deleteBusinessFormSchema.safeParse({
      businessId: "business_1",
      confirmationText: "",
    });

    expect(result.success).toBe(false);
  });
});
