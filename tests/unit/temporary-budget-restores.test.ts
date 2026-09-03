import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  findFirst: vi.fn(),
  updateProgramBudgetWorkflow: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    program: { findMany: mocks.findMany, update: mocks.update },
    user: { findFirst: mocks.findFirst },
  },
}));

vi.mock("@/features/ads-programs/service", () => ({
  updateProgramBudgetWorkflow: mocks.updateProgramBudgetWorkflow,
}));

function program(
  upstreamProgramId: string,
  campaignLayer: string,
  budgetCents = 1_650_000,
) {
  return {
    id: `local-${upstreamProgramId}`,
    tenantId: "tenant-1",
    upstreamProgramId,
    budgetCents,
    jobs: [],
    configurationJson: {
      campaignLayer,
      temporaryBudgetOverride: {
        approvalReference: "Emil temporary budget request, 2026-09-03",
        monthlyBudgetDollars: "16500",
        restoreDate: "2026-09-07",
        restoreMonthlyBudgetDollars: "12000",
        restoreMode: "INTERNAL_SCHEDULER",
        status: "INTERNAL_SCHEDULED",
      },
    },
  };
}

describe("temporary Yelp budget restore worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([
      program("DLJGvx-T0QQt8IXx8xUCCA", "SEPTEMBER_HVAC_INSTALLATION"),
      program("chZwdNae5UHK2asYXSiizg", "SEPTEMBER_HVAC_REPAIR"),
    ]);
    mocks.findFirst.mockResolvedValue({ id: "actor-1" });
    mocks.updateProgramBudgetWorkflow.mockResolvedValue({ jobId: "job-1" });
    mocks.update.mockResolvedValue({});
  });

  it("does not restore before the approved Pacific date", async () => {
    const { reconcileDueTemporaryBudgetRestores } =
      await import("@/features/ads-programs/temporary-budget-restores");

    const results = await reconcileDueTemporaryBudgetRestores(
      new Date("2026-09-06T12:00:00Z"),
    );

    expect(results.every((result) => result.status === "NOT_DUE")).toBe(true);
    expect(mocks.updateProgramBudgetWorkflow).not.toHaveBeenCalled();
  });

  it("submits only the exact approved restoration when it becomes due", async () => {
    const { reconcileDueTemporaryBudgetRestores } =
      await import("@/features/ads-programs/temporary-budget-restores");

    const results = await reconcileDueTemporaryBudgetRestores(
      new Date("2026-09-07T12:00:00Z"),
    );

    expect(results.every((result) => result.status === "SUBMITTED")).toBe(true);
    expect(mocks.updateProgramBudgetWorkflow).toHaveBeenCalledTimes(2);
    expect(mocks.updateProgramBudgetWorkflow).toHaveBeenCalledWith(
      "tenant-1",
      "actor-1",
      "local-DLJGvx-T0QQt8IXx8xUCCA",
      expect.objectContaining({
        operation: "CURRENT_BUDGET",
        currentBudgetDollars: "12000",
      }),
      expect.objectContaining({
        approvedSeptemberOverride: expect.objectContaining({
          campaignLayer: "SEPTEMBER_HVAC_INSTALLATION",
          monthlyBudgetDollars: "12000",
        }),
      }),
    );
  });
});
