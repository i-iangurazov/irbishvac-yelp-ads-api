import { beforeEach, describe, expect, it, vi } from "vitest";

const { listAiGenerationUsage } = vi.hoisted(() => ({
  listAiGenerationUsage: vi.fn(),
}));

vi.mock("@/lib/db/ai-usage-repository", () => ({ listAiGenerationUsage }));

import { exportAiUsageToCsv } from "@/features/autoresponder/usage-export";

describe("Claude usage export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes data by session tenant and emits invoice-safe fields without lead content", async () => {
    listAiGenerationUsage.mockResolvedValue([
      {
        createdAt: new Date("2026-08-15T12:00:00.000Z"),
        businessId: "business_a",
        correlationId: "correlation_a",
        operation: "autoresponder.reply",
        provider: "ANTHROPIC",
        model: "claude-sonnet-4-6",
        resultStatus: "SUCCESS",
        inputTokens: 100,
        outputTokens: 20,
        cacheCreationInputTokens: 10,
        cacheReadInputTokens: 5,
        latencyMs: 500,
        providerCostMicroUsd: 638,
        billableCostMicroUsd: 797,
        rateSnapshotJson: { agencyMarkupPercent: 25 },
        failureReason: null,
      },
    ]);

    const csv = await exportAiUsageToCsv("tenant_a", "2026-08");

    expect(listAiGenerationUsage).toHaveBeenCalledWith({
      tenantId: "tenant_a",
      since: new Date("2026-08-01T00:00:00.000Z"),
      until: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(csv).toContain('"business_a"');
    expect(csv).toContain('"claude-sonnet-4-6"');
    expect(csv).toContain('"0.000638"');
    expect(csv).not.toContain("lead_id");
    expect(csv).not.toContain("customer");
  });

  it("rejects ambiguous date input", async () => {
    await expect(exportAiUsageToCsv("tenant_a", "August 2026")).rejects.toThrow(
      "YYYY-MM",
    );
    expect(listAiGenerationUsage).not.toHaveBeenCalled();
  });
});
