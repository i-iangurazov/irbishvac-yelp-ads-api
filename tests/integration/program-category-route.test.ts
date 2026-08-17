import { beforeEach, describe, expect, it, vi } from "vitest";

const updateProgramCategoryTargetingWorkflow = vi.fn();
const requireApiPermission = vi.fn();

vi.mock("@/features/ads-programs/service", () => ({
  updateProgramCategoryTargetingWorkflow,
}));

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission,
  handleRouteError: vi.fn((error) => {
    throw error;
  }),
}));

describe("program category-targeting route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiPermission.mockResolvedValue({
      id: "actor_1",
      tenantId: "tenant_1",
    });
    updateProgramCategoryTargetingWorkflow.mockResolvedValue({
      programId: "program_1",
      jobId: "job_1",
    });
  });

  it("submits an explicit category-only operation with write permission", async () => {
    const { POST } =
      await import("@/app/api/programs/[programId]/categories/route");
    const payload = {
      adCategories: ["hvac", "plumbing", "waterheaterinstallrepair"],
      internalNote: "Restore listing-wide targeting.",
    };
    const response = await POST(
      new Request("http://localhost/api/programs/program_1/categories", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
      { params: Promise.resolve({ programId: "program_1" }) },
    );

    expect(requireApiPermission).toHaveBeenCalledWith("programs:write");
    expect(updateProgramCategoryTargetingWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "actor_1",
      "program_1",
      payload,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      programId: "program_1",
      jobId: "job_1",
    });
  });
});
