import { beforeEach, describe, expect, it, vi } from "vitest";

const { listAccessibleTenants, requireApiPermission, switchActiveTenant } =
  vi.hoisted(() => ({
    listAccessibleTenants: vi.fn(),
    requireApiPermission: vi.fn(),
    switchActiveTenant: vi.fn(),
  }));

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission,
  handleRouteError: vi.fn((error) => {
    throw error;
  }),
}));

vi.mock("@/lib/auth/service", () => ({ switchActiveTenant }));
vi.mock("@/lib/db/tenant-access-repository", () => ({
  listAccessibleTenants,
}));

describe("tenant switch route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiPermission.mockResolvedValue({
      id: "agency_1",
      tenantId: "tenant_a",
      primaryTenantId: "agency_tenant",
      role: { code: "AGENCY_OPERATOR" },
    });
  });

  it("lists only tenants resolved from authenticated user access", async () => {
    listAccessibleTenants.mockResolvedValueOnce([
      { id: "tenant_a", name: "Client A", slug: "client-a" },
    ]);
    const { GET } = await import("@/app/api/auth/tenant/route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(requireApiPermission).toHaveBeenCalledWith("tenants:switch");
    expect(listAccessibleTenants).toHaveBeenCalledWith({
      userId: "agency_1",
      primaryTenantId: "agency_tenant",
      roleCode: "AGENCY_OPERATOR",
    });
    await expect(response.json()).resolves.toMatchObject({
      activeTenantId: "tenant_a",
      tenants: [{ id: "tenant_a", slug: "client-a" }],
    });
  });

  it("delegates a requested target to the server-side access resolver", async () => {
    switchActiveTenant.mockResolvedValueOnce({
      success: false,
      message: "Tenant access denied.",
    });
    const { POST } = await import("@/app/api/auth/tenant/route");
    const response = await POST(
      new Request("http://localhost/api/auth/tenant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: "tenant_b" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(requireApiPermission).toHaveBeenCalledWith("tenants:switch");
    expect(switchActiveTenant).toHaveBeenCalledWith("tenant_b");
  });
});
