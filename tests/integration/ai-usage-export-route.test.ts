import { describe, expect, it, vi } from "vitest";

const { requireApiPermission, exportAiUsageToCsv } = vi.hoisted(() => ({
  requireApiPermission: vi.fn(),
  exportAiUsageToCsv: vi.fn(),
}));

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission,
  handleRouteError: vi.fn((error) => {
    throw error;
  }),
}));
vi.mock("@/features/autoresponder/usage-export", () => ({
  exportAiUsageToCsv,
}));

describe("Claude usage export route", () => {
  it("uses the authenticated tenant and never accepts a tenant id from the URL", async () => {
    requireApiPermission.mockResolvedValue({
      id: "user_a",
      tenantId: "tenant_a",
    });
    exportAiUsageToCsv.mockResolvedValue('"period"\n"2026-08"');
    const { GET } = await import("@/app/api/usage/ai/export/route");
    const response = await GET(
      new Request(
        "http://localhost/api/usage/ai/export?month=2026-08&tenantId=tenant_b",
      ),
    );

    expect(response.status).toBe(200);
    expect(requireApiPermission).toHaveBeenCalledWith("billing:manage");
    expect(exportAiUsageToCsv).toHaveBeenCalledWith("tenant_a", "2026-08");
    expect(response.headers.get("content-disposition")).toContain(
      "claude-usage-2026-08.csv",
    );
  });
});
