import { describe, expect, it, vi } from "vitest";

const applyBusinessOnboardingAction = vi.fn();
const createClientTenantWorkflow = vi.fn();
const requireApiPermission = vi.fn(async () => ({
  id: "operator_1",
  tenantId: "tenant_a",
  role: { code: "PLATFORM_ADMIN" },
}));

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission,
  handleRouteError: vi.fn((error) => {
    throw error;
  }),
}));

vi.mock("@/features/onboarding/service", () => ({
  applyBusinessOnboardingAction,
  createClientTenantWorkflow,
}));

describe("onboarding routes", () => {
  it("forces activation into the authenticated tenant and URL business scope", async () => {
    applyBusinessOnboardingAction.mockResolvedValueOnce({
      businessId: "business_a",
      status: "READY",
    });
    const { POST } =
      await import("@/app/api/onboarding/businesses/[businessId]/activation/route");
    const response = await POST(
      new Request(
        "http://localhost/api/onboarding/businesses/business_a/activation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            businessId: "business_b",
            tenantId: "tenant_b",
            action: "CHECK",
          }),
        },
      ),
      { params: Promise.resolve({ businessId: "business_a" }) },
    );

    expect(response.status).toBe(200);
    expect(requireApiPermission).toHaveBeenCalledWith("onboarding:manage");
    expect(applyBusinessOnboardingAction).toHaveBeenCalledWith(
      "tenant_a",
      "operator_1",
      expect.objectContaining({
        businessId: "business_a",
        action: "CHECK",
      }),
    );
  });

  it.each([
    ["ACTIVATE", "ACTIVATE REVIEW ONLY"],
    ["PAUSE", undefined],
    ["EMERGENCY_DISABLE", "EMERGENCY DISABLE"],
    ["CLEAR_EMERGENCY", "CLEAR EMERGENCY DISABLE"],
  ])(
    "keeps %s lifecycle mutations inside the authenticated tenant and URL business",
    async (action, confirmation) => {
      applyBusinessOnboardingAction.mockResolvedValueOnce({
        businessId: "business_a",
        status: "PAUSED",
      });
      const { POST } =
        await import("@/app/api/onboarding/businesses/[businessId]/activation/route");
      const response = await POST(
        new Request(
          "http://localhost/api/onboarding/businesses/business_a/activation",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              tenantId: "tenant_b",
              businessId: "business_b",
              action,
              ...(confirmation ? { confirmation } : {}),
            }),
          },
        ),
        { params: Promise.resolve({ businessId: "business_a" }) },
      );

      expect(response.status).toBe(200);
      expect(applyBusinessOnboardingAction).toHaveBeenLastCalledWith(
        "tenant_a",
        "operator_1",
        expect.objectContaining({
          businessId: "business_a",
          action,
        }),
      );
    },
  );

  it("requires platform tenant authority for client workspace creation", async () => {
    createClientTenantWorkflow.mockResolvedValueOnce({
      tenant: { id: "tenant_new", name: "New Client" },
      clientAdmin: { id: "user_new" },
    });
    const { POST } = await import("@/app/api/onboarding/tenant/route");
    const response = await POST(
      new Request("http://localhost/api/onboarding/tenant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantName: "New Client" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(requireApiPermission).toHaveBeenCalledWith("tenants:manage");
    expect(createClientTenantWorkflow).toHaveBeenCalledWith(
      "operator_1",
      expect.objectContaining({ tenantName: "New Client" }),
    );
  });
});
