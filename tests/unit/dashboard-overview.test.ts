import { beforeEach, describe, expect, it, vi } from "vitest";

const getDashboardSnapshot = vi.fn();
const getDashboardSettingsOverview = vi.fn();

vi.mock("@/lib/db/dashboard-repository", () => ({
  getDashboardSnapshot,
}));

vi.mock("@/features/settings/service", () => ({
  getDashboardSettingsOverview,
}));

describe("dashboard overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDashboardSettingsOverview.mockResolvedValue({
      credentials: [],
      capabilities: {},
    });
  });

  it("builds the dashboard from compact aggregates and filters duplicate or inaccessible programs", async () => {
    getDashboardSnapshot.mockResolvedValue({
      businesses: [
        {
          id: "business_ready",
          name: "Ready HVAC",
          categoriesJson: [{ alias: "hvac", title: "HVAC" }],
          readinessJson: { hasAboutText: true },
        },
      ],
      currentPrograms: [
        {
          id: "program_old",
          upstreamProgramId: "upstream_1",
          status: "ACTIVE",
          updatedAt: new Date("2026-08-01T00:00:00.000Z"),
          business: { name: "Ready HVAC", readinessJson: {} },
        },
        {
          id: "program_new",
          upstreamProgramId: "upstream_1",
          status: "ACTIVE",
          updatedAt: new Date("2026-08-02T00:00:00.000Z"),
          business: { name: "Ready HVAC", readinessJson: {} },
        },
        {
          id: "program_test",
          upstreamProgramId: "upstream_test",
          status: "ACTIVE",
          updatedAt: new Date("2026-08-03T00:00:00.000Z"),
          business: { name: "Test Business", readinessJson: {} },
        },
      ],
      failedJobs: [
        {
          id: "job_live",
          type: "EDIT_PROGRAM",
          status: "FAILED",
          upstreamJobId: "job_1",
          createdAt: new Date("2026-08-03T00:00:00.000Z"),
          business: { name: "Ready HVAC", readinessJson: {} },
        },
        {
          id: "job_test",
          type: "EDIT_PROGRAM",
          status: "FAILED",
          upstreamJobId: "job_2",
          createdAt: new Date("2026-08-02T00:00:00.000Z"),
          business: { name: "Test Business", readinessJson: {} },
        },
      ],
      unmappedLeads: 7,
      pendingReports: 2,
      recentReports: [],
      failedWebhooksLast24h: 3,
      failedReconcilesLast24h: 4,
    });

    const { getDashboardOverview } =
      await import("@/features/dashboard/service");
    const result = await getDashboardOverview("tenant_1");

    expect(getDashboardSnapshot).toHaveBeenCalledWith("tenant_1");
    expect(result.activeProgramCount).toBe(1);
    expect(result.failedJobs.map((job) => job.id)).toEqual(["job_live"]);
    expect(result.unmappedLeads).toBe(7);
    expect(result.pendingReports).toBe(2);
    expect(result.recentWebhookFailures).toBe(7);
    expect(result.businesses[0]?.readiness.isReadyForCpc).toBe(true);
  });
});
