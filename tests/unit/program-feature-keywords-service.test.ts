import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createProgramFeatureSnapshot: vi.fn(),
  getProgramById: vi.fn(),
  listProgramFeatures: vi.fn(),
  recordAuditEvent: vi.fn(),
  getCapabilityFlags: vi.fn(),
  ensureYelpAccess: vi.fn(),
  getProgramFeatures: vi.fn(),
  updateNegativeKeywords: vi.fn(),
  deleteProgramFeatures: vi.fn(),
}));

vi.mock("@/lib/db/programs-repository", () => ({
  createProgramFeatureSnapshot: mocks.createProgramFeatureSnapshot,
  getProgramById: mocks.getProgramById,
  listProgramFeatures: mocks.listProgramFeatures,
}));

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock("@/lib/yelp/runtime", () => ({
  getCapabilityFlags: mocks.getCapabilityFlags,
  ensureYelpAccess: mocks.ensureYelpAccess,
}));

vi.mock("@/lib/yelp/features-client", () => ({
  YelpFeaturesClient: class {
    getProgramFeatures = mocks.getProgramFeatures;
    updateNegativeKeywords = mocks.updateNegativeKeywords;
    deleteProgramFeatures = mocks.deleteProgramFeatures;
  },
}));

function providerResponse(blockedKeywords: string[]) {
  return {
    correlationId: "correlation-read",
    data: {
      program_id: "yelp-program-1",
      program_type: "CPC",
      features: {
        NEGATIVE_KEYWORD_TARGETING: {
          suggested_keywords: ["hvac jobs", "free hvac"],
          blocked_keywords: blockedKeywords,
        },
      },
    },
  };
}

describe("negative-keyword provider workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProgramById.mockResolvedValue({
      id: "program-1",
      tenantId: "tenant-a",
      businessId: "business-1",
      upstreamProgramId: "yelp-program-1",
      status: "ACTIVE",
    });
    mocks.listProgramFeatures.mockResolvedValue([]);
    mocks.getCapabilityFlags.mockResolvedValue({
      demoModeEnabled: false,
      programFeatureApiEnabled: true,
    });
    mocks.ensureYelpAccess.mockResolvedValue({ credential: { label: "test" } });
    mocks.createProgramFeatureSnapshot.mockImplementation(async (input) => ({
      id: "snapshot-1",
      capturedAt: new Date("2026-08-27T12:00:00.000Z"),
      ...input,
    }));
  });

  it("stores success only after an exact Yelp read-back", async () => {
    mocks.getProgramFeatures
      .mockResolvedValueOnce(providerResponse(["careers"]))
      .mockResolvedValueOnce(providerResponse(["hvac jobs", "free hvac"]));
    mocks.updateNegativeKeywords.mockResolvedValue({
      ...providerResponse(["hvac jobs", "free hvac"]),
      correlationId: "correlation-write",
    });

    const { updateProgramFeatureWorkflow } =
      await import("@/features/program-features/service");
    const result = await updateProgramFeatureWorkflow(
      "tenant-a",
      "actor-1",
      "program-1",
      {
        type: "NEGATIVE_KEYWORD_TARGETING",
        blockedKeywords: ["hvac jobs", "free hvac"],
      },
    );

    expect(mocks.getProgramById).toHaveBeenCalledWith("program-1", "tenant-a");
    expect(mocks.updateNegativeKeywords).toHaveBeenCalledWith(
      "yelp-program-1",
      ["hvac jobs", "free hvac"],
    );
    expect(mocks.getProgramFeatures).toHaveBeenCalledTimes(2);
    expect(mocks.createProgramFeatureSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        programId: "program-1",
        type: "NEGATIVE_KEYWORD_TARGETING",
        valueJson: expect.objectContaining({
          blockedKeywords: ["hvac jobs", "free hvac"],
          source: "YELP_READ_BACK",
        }),
      }),
    );
    expect(mocks.getProgramFeatures.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.createProgramFeatureSnapshot.mock.invocationCallOrder[0],
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        actionType: "feature.negative_keyword_targeting.update",
        status: "SUCCESS",
        correlationId: "correlation-write",
        before: { blockedKeywords: ["careers"] },
      }),
    );
    expect(result.negativeKeywords.blockedKeywords).toEqual([
      "hvac jobs",
      "free hvac",
    ]);
  });

  it("records a failed audit and no local success when Yelp read-back differs", async () => {
    mocks.getProgramFeatures
      .mockResolvedValueOnce(providerResponse([]))
      .mockResolvedValueOnce(providerResponse(["hvac jobs"]));
    mocks.updateNegativeKeywords.mockResolvedValue({
      ...providerResponse(["hvac jobs", "free hvac"]),
      correlationId: "correlation-write",
    });

    const { updateProgramFeatureWorkflow } =
      await import("@/features/program-features/service");

    await expect(
      updateProgramFeatureWorkflow("tenant-a", "actor-1", "program-1", {
        type: "NEGATIVE_KEYWORD_TARGETING",
        blockedKeywords: ["hvac jobs", "free hvac"],
      }),
    ).rejects.toThrow("read-back did not match");

    expect(mocks.createProgramFeatureSnapshot).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        actionType: "feature.negative_keyword_targeting.update",
        status: "FAILED",
      }),
    );
  });

  it("clears only the negative-keyword feature and verifies the empty Yelp state", async () => {
    mocks.getProgramFeatures
      .mockResolvedValueOnce(providerResponse(["careers"]))
      .mockResolvedValueOnce(providerResponse([]));
    mocks.deleteProgramFeatures.mockResolvedValue({
      ...providerResponse([]),
      correlationId: "correlation-delete",
    });

    const { deleteProgramFeatureWorkflow } =
      await import("@/features/program-features/service");
    await deleteProgramFeatureWorkflow(
      "tenant-a",
      "actor-1",
      "program-1",
      "NEGATIVE_KEYWORD_TARGETING",
    );

    expect(mocks.deleteProgramFeatures).toHaveBeenCalledWith("yelp-program-1", [
      "NEGATIVE_KEYWORD_TARGETING",
    ]);
    expect(mocks.createProgramFeatureSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        isDeleted: true,
        valueJson: expect.objectContaining({
          blockedKeywords: [],
          source: "YELP_READ_BACK",
        }),
      }),
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "feature.negative_keyword_targeting.clear",
        status: "SUCCESS",
        before: { blockedKeywords: ["careers"] },
      }),
    );
  });

  it("accepts Yelp's documented null disabled state after clearing", async () => {
    mocks.getProgramFeatures
      .mockResolvedValueOnce(providerResponse(["careers"]))
      .mockResolvedValueOnce({
        correlationId: "correlation-read",
        data: {
          program_id: "yelp-program-1",
          program_type: "CPC",
          features: { NEGATIVE_KEYWORD_TARGETING: null },
        },
      });
    mocks.deleteProgramFeatures.mockResolvedValue({
      correlationId: "correlation-delete",
      data: {
        program_id: "yelp-program-1",
        program_type: "CPC",
        features: { NEGATIVE_KEYWORD_TARGETING: null },
      },
    });

    const { deleteProgramFeatureWorkflow } =
      await import("@/features/program-features/service");

    await expect(
      deleteProgramFeatureWorkflow(
        "tenant-a",
        "actor-1",
        "program-1",
        "NEGATIVE_KEYWORD_TARGETING",
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        negativeKeywords: expect.objectContaining({ blockedKeywords: [] }),
      }),
    );

    expect(mocks.createProgramFeatureSnapshot).toHaveBeenCalledTimes(1);
  });
});
