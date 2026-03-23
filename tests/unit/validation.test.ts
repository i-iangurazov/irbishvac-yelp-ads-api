import { describe, expect, it } from "vitest";

import { createProgramFormSchema, currentBudgetOperationSchema, scheduledBudgetOperationSchema } from "@/features/ads-programs/schemas";
import { reportRequestFormSchema } from "@/features/reporting/schemas";

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
      adCategories: ["HVAC"]
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
      adCategories: []
    });

    expect(result.success).toBe(true);
  });

  it("rejects daily reports longer than 31 days", () => {
    const result = reportRequestFormSchema.safeParse({
      granularity: "DAILY",
      businessIds: ["business_1"],
      startDate: "2026-01-01",
      endDate: "2026-02-15",
      metrics: ["impressions"]
    });

    expect(result.success).toBe(false);
  });

  it("rejects budget operations below the CPC minimum", () => {
    const result = currentBudgetOperationSchema.safeParse({
      operation: "CURRENT_BUDGET",
      currentBudgetDollars: "20.00"
    });

    expect(result.success).toBe(false);
  });

  it("rejects scheduled budget changes in the past", () => {
    const result = scheduledBudgetOperationSchema.safeParse({
      operation: "SCHEDULED_BUDGET",
      scheduledBudgetDollars: "30.00",
      scheduledBudgetEffectiveDate: "2026-03-01"
    });

    expect(result.success).toBe(false);
  });
});
