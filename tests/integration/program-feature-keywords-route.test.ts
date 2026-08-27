import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const {
  deleteProgramFeatureWorkflow,
  getProgramFeatureOverview,
  requireApiPermission,
  updateProgramFeatureWorkflow,
} = vi.hoisted(() => ({
  deleteProgramFeatureWorkflow: vi.fn(),
  getProgramFeatureOverview: vi.fn(),
  requireApiPermission: vi.fn(),
  updateProgramFeatureWorkflow: vi.fn(),
}));

vi.mock("@/features/program-features/service", () => ({
  deleteProgramFeatureWorkflow,
  getProgramFeatureOverview,
  updateProgramFeatureWorkflow,
}));

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission,
  handleRouteError: vi.fn((error) => {
    throw error;
  }),
}));

describe("program feature keyword routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiPermission.mockResolvedValue({
      id: "actor-a",
      tenantId: "tenant-a",
    });
    getProgramFeatureOverview.mockResolvedValue({
      program: { id: "program-b" },
    });
    updateProgramFeatureWorkflow.mockResolvedValue({
      negativeKeywords: { blockedKeywords: ["jobs"] },
    });
    deleteProgramFeatureWorkflow.mockResolvedValue({
      negativeKeywords: { blockedKeywords: [] },
    });
  });

  it("uses the authenticated tenant for reads", async () => {
    const { GET } =
      await import("@/app/api/programs/[programId]/features/route");
    const response = await GET(
      new Request("http://localhost/api/programs/program-b/features"),
      {
        params: Promise.resolve({ programId: "program-b" }),
      },
    );

    expect(requireApiPermission).toHaveBeenCalledWith("features:read");
    expect(getProgramFeatureOverview).toHaveBeenCalledWith(
      "tenant-a",
      "program-b",
    );
    expect(response.status).toBe(200);
  });

  it("uses the authenticated tenant and actor for writes", async () => {
    const { PUT } =
      await import("@/app/api/programs/[programId]/features/route");
    const body = {
      tenantId: "tenant-b",
      type: "NEGATIVE_KEYWORD_TARGETING",
      blockedKeywords: ["jobs"],
    };
    const response = await PUT(
      new Request("http://localhost/api/programs/program-b/features", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ programId: "program-b" }) },
    );

    expect(requireApiPermission).toHaveBeenCalledWith("features:write");
    expect(updateProgramFeatureWorkflow).toHaveBeenCalledWith(
      "tenant-a",
      "actor-a",
      "program-b",
      body,
    );
    expect(response.status).toBe(200);
  });

  it("clears only the supported negative-keyword feature", async () => {
    const { DELETE } =
      await import("@/app/api/programs/[programId]/features/route");
    const response = await DELETE(
      new Request("http://localhost/api/programs/program-b/features", {
        method: "DELETE",
        body: JSON.stringify({ featureType: "NEGATIVE_KEYWORD_TARGETING" }),
      }),
      { params: Promise.resolve({ programId: "program-b" }) },
    );

    expect(deleteProgramFeatureWorkflow).toHaveBeenCalledWith(
      "tenant-a",
      "actor-a",
      "program-b",
      "NEGATIVE_KEYWORD_TARGETING",
    );
    expect(response.status).toBe(200);
  });

  it("stops before the workflow when write permission is denied", async () => {
    requireApiPermission.mockResolvedValueOnce(
      NextResponse.json({ message: "Forbidden" }, { status: 403 }),
    );
    const { PUT } =
      await import("@/app/api/programs/[programId]/features/route");
    const response = await PUT(
      new Request("http://localhost/api/programs/program-b/features", {
        method: "PUT",
        body: JSON.stringify({
          type: "NEGATIVE_KEYWORD_TARGETING",
          blockedKeywords: [],
        }),
      }),
      { params: Promise.resolve({ programId: "program-b" }) },
    );

    expect(response.status).toBe(403);
    expect(updateProgramFeatureWorkflow).not.toHaveBeenCalled();
  });
});
