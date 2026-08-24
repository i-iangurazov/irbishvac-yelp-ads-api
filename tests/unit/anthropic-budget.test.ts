import { beforeEach, describe, expect, it, vi } from "vitest";

const getAiUsageTotals = vi.fn();
const reserveAiGenerationUsage = vi.fn();
const createAiGenerationUsage = vi.fn();
const settleAiGenerationUsage = vi.fn();

vi.mock("@/lib/db/ai-usage-repository", () => ({
  getAiUsageTotals,
  reserveAiGenerationUsage,
  createAiGenerationUsage,
  settleAiGenerationUsage,
}));

import {
  calculateAnthropicCostMicroUsd,
  getAnthropicMonthlySpendState,
  reserveAnthropicGeneration,
  settleAnthropicGeneration,
} from "@/features/autoresponder/anthropic-budget";

const limits = {
  monthlyBudgetUsd: 50,
  monthlyMessageLimit: 500,
  monthlyTokenLimit: 1_000_000,
  warningPercent: 80,
  agencyMarkupPercent: 25,
};

describe("Anthropic usage metering and hard limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates provider cost from the immutable model rate snapshot", () => {
    expect(
      calculateAnthropicCostMicroUsd("claude-sonnet-4-6", {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheCreationInputTokens: 1_000_000,
        cacheReadInputTokens: 1_000_000,
      }),
    ).toBe(22_050_000);
  });

  it("reports messages, tokens, provider cost, billable cost and warnings", async () => {
    getAiUsageTotals.mockResolvedValue({
      _count: { _all: 400 },
      _sum: {
        inputTokens: 300_000,
        outputTokens: 100_000,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        providerCostMicroUsd: 40_000_000,
        billableCostMicroUsd: 50_000_000,
      },
    });

    await expect(
      getAnthropicMonthlySpendState({ tenantId: "tenant_a", limits }),
    ).resolves.toMatchObject({
      messages: 400,
      tokens: 400_000,
      usedUsd: 40,
      billableUsd: 50,
      warning: true,
      hardLimitReached: false,
    });
  });

  it("records a blocked generation and throws before provider use", async () => {
    reserveAiGenerationUsage.mockResolvedValue({
      reserved: false,
      reason: "DOLLAR_LIMIT",
      totals: {
        messages: 12,
        tokens: 40_000,
        providerCostMicroUsd: 50_000_000,
      },
    });

    await expect(
      reserveAnthropicGeneration({
        tenantId: "tenant_a",
        businessId: "business_a",
        leadId: "lead_a",
        correlationId: "correlation_a",
        operation: "autoresponder.reply",
        model: "claude-sonnet-4-6",
        limits,
      }),
    ).rejects.toMatchObject({
      name: "AnthropicHardLimitError",
      limitType: "DOLLAR_LIMIT",
    });
    expect(createAiGenerationUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_a",
        resultStatus: "BLOCKED",
        failureReason: "DOLLAR_LIMIT",
      }),
    );
  });

  it("settles a reservation with actual tokens, latency and marked-up billable cost", async () => {
    await settleAnthropicGeneration({
      tenantId: "tenant_a",
      correlationId: "correlation_a",
      model: "claude-sonnet-4-6",
      limits,
      usage: {
        inputTokens: 1_000,
        outputTokens: 200,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      latencyMs: 812,
      resultStatus: "SUCCESS",
    });

    expect(settleAiGenerationUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_a",
        inputTokens: 1_000,
        outputTokens: 200,
        latencyMs: 812,
        providerCostMicroUsd: 6_000,
        billableCostMicroUsd: 7_500,
        rateSnapshotJson: expect.objectContaining({
          model: "claude-sonnet-4-6",
          agencyMarkupPercent: 25,
        }),
      }),
    );
  });
});
