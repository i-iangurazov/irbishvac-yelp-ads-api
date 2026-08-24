import { describe, expect, it } from "vitest";

import { readLeadAutoresponderSettings } from "@/features/autoresponder/config";
import { hasProtectedAiPlanChanges } from "@/features/autoresponder/plan-policy";

describe("autoresponder AI plan protection", () => {
  const current = readLeadAutoresponderSettings({
    aiAllowedModels: ["claude-haiku-4-5", "claude-sonnet-4-6"],
    aiModel: "claude-sonnet-4-6",
    aiMonthlyBudgetUsd: 100,
    aiMonthlyMessageLimit: 500,
    aiMonthlyTokenLimit: 2_000_000,
    aiUsageWarningPercent: 80,
    aiAgencyMarkupPercent: 25,
  });

  it("allows operational changes that preserve the platform plan", () => {
    expect(
      hasProtectedAiPlanChanges(current, {
        ...current,
        isEnabled: !current.isEnabled,
        aiModel: "claude-haiku-4-5",
        conversationMode: "BOUNDED_AUTO_REPLY",
      }),
    ).toBe(false);
  });

  it("detects every protected plan change", () => {
    expect(
      hasProtectedAiPlanChanges(current, {
        ...current,
        aiAllowedModels: ["claude-opus-4-6"],
      }),
    ).toBe(true);
    expect(
      hasProtectedAiPlanChanges(current, {
        ...current,
        aiMonthlyBudgetUsd: 101,
      }),
    ).toBe(true);
    expect(
      hasProtectedAiPlanChanges(current, {
        ...current,
        aiMonthlyMessageLimit: 501,
      }),
    ).toBe(true);
    expect(
      hasProtectedAiPlanChanges(current, {
        ...current,
        aiMonthlyTokenLimit: 2_001_000,
      }),
    ).toBe(true);
    expect(
      hasProtectedAiPlanChanges(current, {
        ...current,
        aiUsageWarningPercent: 81,
      }),
    ).toBe(true);
    expect(
      hasProtectedAiPlanChanges(current, {
        ...current,
        aiAgencyMarkupPercent: 26,
      }),
    ).toBe(true);
  });

  it("does not treat allowlist ordering as a plan change", () => {
    expect(
      hasProtectedAiPlanChanges(current, {
        ...current,
        aiAllowedModels: [...current.aiAllowedModels].reverse(),
      }),
    ).toBe(false);
  });
});
