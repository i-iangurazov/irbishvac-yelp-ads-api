import { describe, expect, it, vi } from "vitest";

const runBusinessesYelpSync = vi.fn();

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission: vi.fn(async () => ({
    id: "user_1",
    tenantId: "tenant_1",
    role: { code: "ADMIN" },
  })),
  handleRouteError: vi.fn((error) => {
    throw error;
  }),
}));

vi.mock("@/features/businesses/service", () => ({
  runBusinessesYelpSync,
}));

describe("businesses Yelp sync route", () => {
  it("runs the tenant business sync workflow", async () => {
    runBusinessesYelpSync.mockResolvedValueOnce({
      source: "PARTNER_SUPPORT_MIGRATION_INFO",
      checked: 2,
      active: 1,
      migrated: 1,
      notFound: 0,
      noAccess: 0,
      errors: 0,
      results: [],
    });

    const { POST } = await import("@/app/api/businesses/sync/route");
    const response = await POST();

    expect(response.status).toBe(200);
    expect(runBusinessesYelpSync).toHaveBeenCalledWith("tenant_1", "user_1");
  });
});
