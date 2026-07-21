import { describe, expect, it } from "vitest";

import {
  dailyBudgetDollarsToMonthlyBudgetCents,
  monthlyBudgetCentsToDailyBudgetCents,
  monthlyBudgetCentsToDailyBudgetDollars,
  monthlyBudgetDollarsToDailyBudgetDollars,
  monthlyBudgetDollarsFromDailyInput,
} from "@/lib/yelp/budget";

describe("Yelp budget cadence", () => {
  it("converts a daily operator budget to Yelp's 30-day monthly payload", () => {
    expect(dailyBudgetDollarsToMonthlyBudgetCents("1065")).toBe(3_195_000);
    expect(monthlyBudgetDollarsFromDailyInput("1065")).toBe("31950");
  });

  it("derives a rounded daily average from an upstream monthly budget", () => {
    expect(monthlyBudgetCentsToDailyBudgetCents(3_195_000)).toBe(106_500);
    expect(monthlyBudgetCentsToDailyBudgetDollars(3_195_000)).toBe("1065");
    expect(monthlyBudgetDollarsToDailyBudgetDollars("31950")).toBe("1065");
  });

  it("keeps invalid input available for form validation", () => {
    expect(monthlyBudgetDollarsFromDailyInput("invalid")).toBe("invalid");
  });
});
