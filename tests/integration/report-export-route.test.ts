import { describe, expect, it, vi } from "vitest";

import mockReport from "@/tests/fixtures/mock-report.json";

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission: vi.fn(async () => ({ tenantId: "tenant_1", role: { code: "ADMIN" } })),
  handleRouteError: vi.fn((error) => {
    throw error;
  })
}));

vi.mock("@/features/reporting/service", () => ({
  getReportDetail: vi.fn(async () => ({
    id: "report_1",
    results: [{ payloadJson: mockReport }]
  })),
  exportReportResultToCsv: vi.fn(() => "date,impressions\n2026-03-01,600")
}));

describe("GET /api/reports/[reportId]/export", () => {
  it("returns CSV content", async () => {
    const { GET } = await import("@/app/api/reports/[reportId]/export/route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ reportId: "report_1" })
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("date,impressions");
  });
});
