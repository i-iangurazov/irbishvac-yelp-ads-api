import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { requireApiPermission, updateSeptemberBoostFocusWorkflow } = vi.hoisted(
  () => ({
    requireApiPermission: vi.fn(),
    updateSeptemberBoostFocusWorkflow: vi.fn(),
  }),
);

vi.mock("@/features/ads-programs/service", () => ({
  updateSeptemberBoostFocusWorkflow,
}));

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission,
  handleRouteError: vi.fn((error) => {
    throw error;
  }),
}));

describe("September Boost focus route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiPermission.mockResolvedValue({
      id: "actor-a",
      tenantId: "tenant-a",
    });
    updateSeptemberBoostFocusWorkflow.mockResolvedValue({
      verified: true,
      upstreamProgramId: "boost-a",
    });
  });

  it("uses only the authenticated tenant and actor for a focus change", async () => {
    const { POST } =
      await import("@/app/api/programs/september-boost/focus/route");
    const payload = {
      tenantId: "tenant-b",
      boostScopes: ["HVAC_REPAIR", "PLUMBING"],
    };
    const response = await POST(
      new Request("http://localhost/api/programs/september-boost/focus", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );

    expect(requireApiPermission).toHaveBeenCalledWith("programs:write");
    expect(updateSeptemberBoostFocusWorkflow).toHaveBeenCalledWith(
      "tenant-a",
      "actor-a",
      payload,
    );
    expect(response.status).toBe(200);
  });

  it("does not call the workflow when write permission is denied", async () => {
    requireApiPermission.mockResolvedValueOnce(
      NextResponse.json({ message: "Forbidden" }, { status: 403 }),
    );
    const { POST } =
      await import("@/app/api/programs/september-boost/focus/route");
    const response = await POST(
      new Request("http://localhost/api/programs/september-boost/focus", {
        method: "POST",
        body: JSON.stringify({ boostScopes: ["HVAC_REPAIR"] }),
      }),
    );

    expect(response.status).toBe(403);
    expect(updateSeptemberBoostFocusWorkflow).not.toHaveBeenCalled();
  });
});
