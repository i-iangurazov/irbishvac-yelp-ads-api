import { beforeEach, describe, expect, it, vi } from "vitest";

const getReportRequestById = vi.fn();
const listLeadAggregatesForReportBreakdown = vi.fn();
const listReportBreakdownOptions = vi.fn();

vi.mock("@/lib/db/reports-repository", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/reports-repository")>("@/lib/db/reports-repository");

  return {
    ...actual,
    getReportRequestById,
    listLeadAggregatesForReportBreakdown,
    listReportBreakdownOptions
  };
});

describe("reporting service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getReportRequestById.mockResolvedValue({
      id: "report_1",
      tenantId: "tenant_1",
      businessId: "business_1",
      granularity: "DAILY",
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2026-04-30T00:00:00.000Z"),
      requestedBusinessIdsJson: ["business_1"],
      results: []
    });
    listReportBreakdownOptions.mockResolvedValue({
      locations: [],
      serviceCategories: []
    });
    listLeadAggregatesForReportBreakdown.mockResolvedValue([]);
  });

  it("pushes location and service filters into the breakdown lead query", async () => {
    const { getReportBreakdownView } = await import("@/features/reporting/service");

    await getReportBreakdownView("tenant_1", "report_1", {
      locationId: "location_1",
      serviceCategoryId: "service_1",
      from: "2026-04-05",
      to: "2026-04-12"
    });

    expect(listLeadAggregatesForReportBreakdown).toHaveBeenCalledWith("tenant_1", {
      businessIds: ["business_1"],
      from: new Date("2026-04-05T00:00:00.000Z"),
      to: new Date("2026-04-12T23:59:59.999Z"),
      locationId: "location_1",
      serviceCategoryId: "service_1"
    });
  });
});
