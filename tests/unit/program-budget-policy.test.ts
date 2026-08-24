import { describe, expect, it } from "vitest";

import {
  evaluateMonthlyBudgetChange,
  getMonthlyBudgetPolicyState,
  YELP_MONTHLY_BUDGET_CAP_CENTS,
} from "@/features/ads-programs/budget-policy";

function program(id: string, budgetCents: number, status = "ACTIVE") {
  return {
    id,
    type: "CPC",
    status,
    budgetCents,
    configurationJson: {},
  };
}

describe("Yelp monthly budget policy", () => {
  it("caps every individual CPC campaign at $60,000", () => {
    const programs = [program("one", 6_000_000), program("two", 2_000_000)];

    expect(getMonthlyBudgetPolicyState(programs)).toMatchObject({
      capCents: YELP_MONTHLY_BUDGET_CAP_CENTS,
      highestBudgetCents: 6_000_000,
      overCapPrograms: [],
      isOverCap: false,
    });
    expect(evaluateMonthlyBudgetChange(programs, 6_000_000).isAllowed).toBe(
      true,
    );
    expect(evaluateMonthlyBudgetChange(programs, 6_000_001).isAllowed).toBe(
      false,
    );
  });

  it("allows reductions when existing imported campaigns are already over cap", () => {
    const programs = [program("one", 7_000_000), program("two", 2_000_000)];

    expect(
      evaluateMonthlyBudgetChange(programs, 6_500_000, "one").isAllowed,
    ).toBe(true);
    expect(
      evaluateMonthlyBudgetChange(programs, 7_500_000, "one").isAllowed,
    ).toBe(false);
  });

  it("protects a larger scheduled budget", () => {
    const programs = [
      {
        ...program("one", 2_000_000),
        configurationJson: { scheduledBudgetDollars: "50000" },
      },
    ];

    expect(getMonthlyBudgetPolicyState(programs).highestBudgetCents).toBe(
      5_000_000,
    );
  });
});
