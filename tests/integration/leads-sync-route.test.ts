import { describe, expect, it, vi } from "vitest";

const syncBusinessLeadsWorkflow = vi.fn();

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission: vi.fn(async () => ({ id: "user_1", tenantId: "tenant_1", role: { code: "ADMIN" } })),
  handleRouteError: vi.fn((error) => {
    throw error;
  })
}));

vi.mock("@/features/leads/service", () => ({
  syncBusinessLeadsWorkflow
}));

describe("lead sync route", () => {
  it("posts business lead imports through the leads write workflow", async () => {
    syncBusinessLeadsWorkflow.mockResolvedValueOnce({
      status: "COMPLETED",
      importedCount: 5,
      updatedCount: 2,
      failedCount: 0,
      returnedLeadIds: 7,
      hasMore: false,
      pagesFetched: 1,
      pageSize: 20,
      pageLimit: 5
    });

    const { POST } = await import("@/app/api/leads/sync/route");
    const response = await POST(
      new Request("http://localhost/api/leads/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          businessId: "business_1"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(syncBusinessLeadsWorkflow).toHaveBeenCalledWith("tenant_1", "user_1", {
      businessId: "business_1"
    });
  });
});
