import { describe, expect, it, vi } from "vitest";

const createSettingsUser = vi.fn();
const saveUserRole = vi.fn();

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

vi.mock("@/features/settings/service", () => ({
  createSettingsUser,
  saveUserRole,
}));

describe("settings users route", () => {
  it("creates users through the settings workflow", async () => {
    createSettingsUser.mockResolvedValueOnce({
      id: "user_2",
      email: "operator@example.com",
      role: { code: "CLIENT_MANAGER" },
    });

    const { POST } = await import("@/app/api/settings/users/route");
    const response = await POST(
      new Request("http://localhost/api/settings/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Operator",
          email: "operator@example.com",
          roleCode: "CLIENT_MANAGER",
          password: "Temporary123!",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(createSettingsUser).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      expect.objectContaining({
        email: "operator@example.com",
        roleCode: "CLIENT_MANAGER",
      }),
    );
  });

  it("updates user roles through the settings workflow", async () => {
    saveUserRole.mockResolvedValueOnce({
      id: "user_2",
      role: { code: "REVIEWER" },
    });

    const { PATCH } = await import("@/app/api/settings/users/route");
    const response = await PATCH(
      new Request("http://localhost/api/settings/users", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userId: "user_2",
          roleCode: "REVIEWER",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(saveUserRole).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      "user_2",
      "REVIEWER",
    );
  });
});
