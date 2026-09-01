import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createProgramJob: vi.fn(),
  getProgramById: vi.fn(),
  listPrograms: vi.fn(),
  updateProgramJob: vi.fn(),
  editProgram: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db/programs-repository", () => ({
  createProgramJob: mocks.createProgramJob,
  createProgramRecord: vi.fn(),
  getProgramById: mocks.getProgramById,
  getProgramJob: vi.fn(),
  listPendingProgramJobs: vi.fn(),
  listPrograms: mocks.listPrograms,
  updateProgramJob: mocks.updateProgramJob,
  updateProgramRecord: vi.fn(),
}));

vi.mock("@/lib/db/businesses-repository", () => ({
  getBusinessById: vi.fn(),
  updateBusinessRecord: vi.fn(),
}));

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock("@/lib/yelp/runtime", () => ({
  ensureYelpAccess: vi.fn(async () => ({
    credential: {
      label: "test",
      baseUrl: "https://partner-api.yelp.com",
      isEnabled: true,
      username: "username",
      secret: "secret",
    },
  })),
  getCapabilityFlags: vi.fn(),
}));

vi.mock("@/lib/yelp/ads-client", () => ({
  YelpAdsClient: class {
    editProgram = mocks.editProgram;
  },
}));

describe("program category-targeting workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProgramById.mockResolvedValue({
      id: "program-main",
      tenantId: "tenant_1",
      businessId: "business_1",
      type: "CPC",
      status: "ACTIVE",
      upstreamProgramId: "yelp-main",
      adCategoriesJson: ["hvac"],
      configurationJson: { syncImportedFromYelp: true },
      jobs: [],
      business: {
        categoriesJson: [
          { alias: "hvac", label: "HVAC" },
          { alias: "plumbing", label: "Plumbing" },
          {
            alias: "waterheaterinstallrepair",
            label: "Water Heater Installation/Repair",
          },
        ],
      },
    });
    mocks.listPrograms.mockResolvedValue([
      {
        id: "program-main",
        type: "CPC",
        status: "ACTIVE",
        upstreamProgramId: "yelp-main",
        adCategoriesJson: ["hvac"],
      },
      {
        id: "program-hvac-layer",
        type: "CPC",
        status: "ACTIVE",
        upstreamProgramId: "yelp-hvac-layer",
        adCategoriesJson: ["hvac"],
      },
    ]);
    mocks.createProgramJob.mockResolvedValue({ id: "job_1" });
    mocks.editProgram.mockResolvedValue({
      correlationId: "correlation_1",
      data: { job_id: "yelp_job_1" },
    });
  });

  it("sends only explicit ad_categories to Yelp and records the operation", async () => {
    const { updateProgramCategoryTargetingWorkflow } =
      await import("@/features/ads-programs/service");
    const categories = ["hvac", "plumbing", "waterheaterinstallrepair"];

    const result = await updateProgramCategoryTargetingWorkflow(
      "tenant_1",
      "actor_1",
      "program-main",
      {
        adCategories: categories,
        internalNote: "Restore listing-wide targeting.",
      },
    );

    expect(mocks.editProgram).toHaveBeenCalledWith("yelp-main", {
      ad_categories: categories,
    });
    expect(mocks.createProgramJob).toHaveBeenCalledWith(
      "tenant_1",
      "business_1",
      expect.objectContaining({
        programId: "program-main",
        type: "EDIT_PROGRAM",
        status: "QUEUED",
        requestJson: expect.objectContaining({
          ad_categories: categories,
          _operation: "CATEGORY_TARGETING",
        }),
      }),
    );
    expect(mocks.updateProgramJob).toHaveBeenCalledWith("job_1", {
      upstreamJobId: "yelp_job_1",
      status: "QUEUED",
      responseJson: { job_id: "yelp_job_1" },
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "actor_1",
        actionType: "program.category-targeting.update",
        status: "SUCCESS",
      }),
    );
    expect(result).toEqual({ programId: "program-main", jobId: "job_1" });
  });

  it("refuses a second mutation while a Yelp job is still pending", async () => {
    mocks.getProgramById.mockResolvedValueOnce({
      ...(await mocks.getProgramById()),
      jobs: [{ status: "PROCESSING" }],
    });

    const { updateProgramCategoryTargetingWorkflow } =
      await import("@/features/ads-programs/service");

    await expect(
      updateProgramCategoryTargetingWorkflow(
        "tenant_1",
        "actor_1",
        "program-main",
        {
          adCategories: ["hvac", "plumbing", "waterheaterinstallrepair"],
        },
      ),
    ).rejects.toThrow("Wait for the current Yelp job to finish");

    expect(mocks.createProgramJob).not.toHaveBeenCalled();
    expect(mocks.editProgram).not.toHaveBeenCalled();
  });

  it("locks managed September category and budget changes to reconciliation", async () => {
    mocks.getProgramById.mockResolvedValue({
      ...(await mocks.getProgramById()),
      configurationJson: {
        campaignLayer: "SEPTEMBER_HVAC_INSTALLATION",
      },
    });
    const {
      updateProgramBudgetWorkflow,
      updateProgramCategoryTargetingWorkflow,
    } = await import("@/features/ads-programs/service");

    await expect(
      updateProgramCategoryTargetingWorkflow(
        "tenant_1",
        "actor_1",
        "program-main",
        {
          campaignLayer: "SEPTEMBER_HVAC_INSTALLATION",
          adCategories: ["hvac"],
        },
      ),
    ).rejects.toThrow("locked to the audited campaign plan");
    await expect(
      updateProgramBudgetWorkflow("tenant_1", "actor_1", "program-main", {
        operation: "CURRENT_BUDGET",
        currentBudgetDollars: "12000",
      }),
    ).rejects.toThrow("locked to the audited campaign plan");

    expect(mocks.createProgramJob).not.toHaveBeenCalled();
    expect(mocks.editProgram).not.toHaveBeenCalled();
  });
});
