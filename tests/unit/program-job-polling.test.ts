import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProgramJob: vi.fn(),
  updateProgramJob: vi.fn(),
  updateProgramRecord: vi.fn(),
  getJobStatus: vi.fn(),
}));

vi.mock("@/lib/db/programs-repository", () => ({
  createProgramJob: vi.fn(),
  createProgramRecord: vi.fn(),
  getProgramById: vi.fn(),
  getProgramJob: mocks.getProgramJob,
  listPendingProgramJobs: vi.fn(),
  listPrograms: vi.fn(),
  updateProgramJob: mocks.updateProgramJob,
  updateProgramRecord: mocks.updateProgramRecord,
}));

vi.mock("@/lib/db/businesses-repository", () => ({
  getBusinessById: vi.fn(),
  updateBusinessRecord: vi.fn(),
}));

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent: vi.fn(),
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
  getCapabilityFlags: vi.fn(async () => ({
    demoModeEnabled: false,
    adsApiEnabled: true,
  })),
}));

vi.mock("@/lib/yelp/ads-client", () => ({
  YelpAdsClient: class {
    getJobStatus = mocks.getJobStatus;
  },
}));

describe("program job polling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProgramJob.mockResolvedValue({
      id: "job_1",
      tenantId: "tenant_1",
      businessId: "business_1",
      programId: "program_1",
      upstreamJobId: "yelp_job_1",
      type: "EDIT_PROGRAM",
      status: "PROCESSING",
      completedAt: null,
      errorJson: null,
      requestJson: { ad_categories: ["hvac", "plumbing"] },
      business: { readinessJson: {} },
      program: { id: "program_1", status: "ACTIVE" },
    });
    mocks.getJobStatus.mockRejectedValue(new Error("temporary network error"));
  });

  it("keeps a status-lookup failure retryable without hiding the live program", async () => {
    const { pollProgramJobWorkflow } =
      await import("@/features/ads-programs/service");

    await pollProgramJobWorkflow("tenant_1", "job_1");

    expect(mocks.updateProgramJob).toHaveBeenCalledWith(
      "job_1",
      expect.objectContaining({
        status: "PROCESSING",
        completedAt: null,
        errorJson: expect.objectContaining({ source: "status_poll" }),
      }),
    );
    expect(mocks.updateProgramRecord).not.toHaveBeenCalled();
  });
});
