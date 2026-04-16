import { beforeEach, describe, expect, it, vi } from "vitest";

const incrementOperationalMetricCounter = vi.fn();

vi.mock("@/lib/db/metrics-repository", () => ({
  incrementOperationalMetricCounter
}));

describe("provider request budgets", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("records provider and operation counters before external calls", async () => {
    incrementOperationalMetricCounter
      .mockResolvedValueOnce({ totalValue: 12 })
      .mockResolvedValueOnce({ totalValue: 3 });

    const { claimProviderRequestBudget } = await import("@/features/operations/provider-budget-service");
    const result = await claimProviderRequestBudget({
      tenantId: "tenant_1",
      provider: "YELP",
      operation: "lead.thread.send",
      businessId: "business_1"
    });

    expect(result).toMatchObject({
      provider: "YELP",
      operation: "lead.thread.send",
      used: 12,
      limit: 600
    });
    expect(incrementOperationalMetricCounter).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        metricKey: "provider.yelp.requests",
        dimensions: {
          provider: "YELP"
        }
      })
    );
    expect(incrementOperationalMetricCounter).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        metricKey: "provider.yelp.requests",
        dimensions: {
          provider: "YELP",
          operation: "lead.thread.send",
          businessId: "business_1"
        }
      })
    );
  });

  it("rejects calls after the provider hourly budget is exceeded", async () => {
    incrementOperationalMetricCounter
      .mockResolvedValueOnce({ totalValue: 601 })
      .mockResolvedValueOnce({ totalValue: 9 })
      .mockResolvedValueOnce({ totalValue: 1 });

    const { claimProviderRequestBudget } = await import("@/features/operations/provider-budget-service");

    await expect(
      claimProviderRequestBudget({
        tenantId: "tenant_1",
        provider: "YELP",
        operation: "report.poll"
      })
    ).rejects.toThrow("YELP request budget exceeded");
    expect(incrementOperationalMetricCounter).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metricKey: "provider.rate_budget.rejected",
        dimensions: {
          provider: "YELP",
          operation: "report.poll"
        }
      })
    );
  });
});
