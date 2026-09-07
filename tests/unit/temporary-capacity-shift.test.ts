import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
  findFirst: vi.fn(),
  auditCreate: vi.fn(),
  updateProgramBudgetWorkflow: vi.fn(),
  ensureYelpAccess: vi.fn(),
  getProgramInfo: vi.fn(),
  resumeProgram: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    program: {
      findMany: mocks.findMany,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      update: mocks.update,
    },
    user: { findFirst: mocks.findFirst },
    auditEvent: { create: mocks.auditCreate },
  },
}));

vi.mock("@/features/ads-programs/service", () => ({
  updateProgramBudgetWorkflow: mocks.updateProgramBudgetWorkflow,
}));

vi.mock("@/lib/yelp/runtime", () => ({
  ensureYelpAccess: mocks.ensureYelpAccess,
}));

vi.mock("@/lib/yelp/ads-client", () => ({
  YelpAdsClient: class {
    getProgramInfo = mocks.getProgramInfo;
    resumeProgram = mocks.resumeProgram;
  },
}));

const approvalReference = "Emil no-work capacity shift, 2026-09-07";
const restoreDate = "2026-09-10";

function budgetProgram(
  upstreamProgramId: string,
  campaignLayer: string,
  budgetCents = 1_950_000,
) {
  return {
    id: `local-${upstreamProgramId}`,
    tenantId: "tenant-1",
    businessId: "business-1",
    upstreamProgramId,
    budgetCents,
    jobs: [],
    configurationJson: {
      campaignLayer,
      temporaryCapacityShift: {
        approvalReference,
        dailyBudgetDollars: "650",
        monthlyBudgetDollars: "19500",
        restoreDate,
        restoreMonthlyBudgetDollars: "12000",
        restoreMode: "INTERNAL_SCHEDULER",
        status: "INTERNAL_SCHEDULED",
      },
    },
  };
}

function plumbingProgram() {
  return {
    id: "local-plumbing",
    tenantId: "tenant-1",
    businessId: "business-1",
    upstreamProgramId: "ZKnDBk9eS2jJa7Xi3a3Cjg",
    budgetCents: 1_500_000,
    jobs: [],
    configurationJson: {
      campaignLayer: "SEPTEMBER_PLUMBING",
      temporaryCapacityShift: {
        approvalReference,
        restoreDate,
        restoreMode: "INTERNAL_RESUME",
        status: "PAUSED",
      },
    },
  };
}

function programs() {
  return [
    budgetProgram("DLJGvx-T0QQt8IXx8xUCCA", "SEPTEMBER_HVAC_INSTALLATION"),
    budgetProgram("chZwdNae5UHK2asYXSiizg", "SEPTEMBER_HVAC_REPAIR"),
    plumbingProgram(),
  ];
}

describe("temporary Yelp capacity-shift restore worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const fixtures = programs();
    mocks.findMany.mockResolvedValue(fixtures);
    mocks.findUniqueOrThrow.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          fixtures.find((program) => program.id === where.id) ?? fixtures[0],
        ),
    );
    mocks.update.mockResolvedValue({});
    mocks.findFirst.mockResolvedValue({ id: "actor-1" });
    mocks.auditCreate.mockResolvedValue({});
    mocks.ensureYelpAccess.mockResolvedValue({
      credential: {
        label: "Ads",
        baseUrl: "https://partner-api.yelp.com",
        isEnabled: true,
        username: "user",
        secret: "secret",
      },
    });
    mocks.updateProgramBudgetWorkflow.mockResolvedValue({ jobId: "job-1" });
  });

  it("does not restore before Thursday in Pacific time", async () => {
    const { reconcileDueTemporaryCapacityShiftRestores } =
      await import("@/features/ads-programs/temporary-capacity-shift");

    const results = await reconcileDueTemporaryCapacityShiftRestores(
      new Date("2026-09-09T12:00:00Z"),
    );

    expect(results).toHaveLength(3);
    expect(results.every((result) => result.status === "NOT_DUE")).toBe(true);
    expect(mocks.ensureYelpAccess).not.toHaveBeenCalled();
    expect(mocks.updateProgramBudgetWorkflow).not.toHaveBeenCalled();
    expect(mocks.resumeProgram).not.toHaveBeenCalled();
  });

  it("restores both HVAC budgets and resumes Plumbing on Thursday", async () => {
    mocks.getProgramInfo.mockImplementation((programId: string) =>
      Promise.resolve({
        data: {
          programs: [
            {
              program_id: programId,
              program_pause_status:
                programId === "ZKnDBk9eS2jJa7Xi3a3Cjg"
                  ? "PAUSED"
                  : "NOT_PAUSED",
              program_metrics: {
                budget:
                  programId === "ZKnDBk9eS2jJa7Xi3a3Cjg"
                    ? 1_500_000
                    : 1_950_000,
              },
            },
          ],
        },
      }),
    );
    mocks.resumeProgram.mockResolvedValue({ correlationId: "corr-1" });

    const { reconcileDueTemporaryCapacityShiftRestores } =
      await import("@/features/ads-programs/temporary-capacity-shift");
    const results = await reconcileDueTemporaryCapacityShiftRestores(
      new Date("2026-09-10T12:00:00Z"),
    );

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
    expect(mocks.resumeProgram).toHaveBeenCalledWith("ZKnDBk9eS2jJa7Xi3a3Cjg");
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: "actor-1" }),
      }),
    );
    expect(results.map((result) => result.status)).toEqual([
      "RESTORE_SUBMITTED",
      "RESTORE_SUBMITTED",
      "RESUME_SUBMITTED",
    ]);
  });

  it("does nothing when Yelp already reflects the restored state", async () => {
    mocks.getProgramInfo.mockImplementation((programId: string) =>
      Promise.resolve({
        data: {
          programs: [
            {
              program_id: programId,
              program_pause_status: "NOT_PAUSED",
              program_metrics: { budget: 1_200_000 },
            },
          ],
        },
      }),
    );

    const { reconcileDueTemporaryCapacityShiftRestores } =
      await import("@/features/ads-programs/temporary-capacity-shift");
    const results = await reconcileDueTemporaryCapacityShiftRestores(
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(results.every((result) => result.status === "COMPLETED")).toBe(true);
    expect(mocks.updateProgramBudgetWorkflow).not.toHaveBeenCalled();
    expect(mocks.resumeProgram).not.toHaveBeenCalled();
  });

  it("skips cleanly before a capacity shift has been applied", async () => {
    const fixtures = programs().map((program) => ({
      ...program,
      configurationJson: {
        campaignLayer: program.configurationJson.campaignLayer,
      },
    }));
    mocks.findMany.mockResolvedValue(fixtures);

    const { reconcileDueTemporaryCapacityShiftRestores } =
      await import("@/features/ads-programs/temporary-capacity-shift");
    const results = await reconcileDueTemporaryCapacityShiftRestores(
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(results.every((result) => result.status === "SKIPPED")).toBe(true);
    expect(mocks.ensureYelpAccess).not.toHaveBeenCalled();
  });
});
