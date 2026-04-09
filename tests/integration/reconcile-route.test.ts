import { describe, expect, it, vi } from "vitest";

const reconcilePendingProgramJobs = vi.fn();
const reconcilePendingLeadWebhooks = vi.fn();
const reconcileDueReportSchedules = vi.fn();
const reconcilePendingReports = vi.fn();
const reconcilePendingReportScheduleRuns = vi.fn();
const runLeadAutomationFollowUpWorker = vi.fn();
const reconcileDueServiceTitanLifecycleSyncs = vi.fn();

vi.mock("@/lib/utils/http", () => ({
  requireCronAuthorization: vi.fn(() => null),
  handleRouteError: vi.fn((error) => {
    throw error;
  })
}));

vi.mock("@/features/ads-programs/service", () => ({
  reconcilePendingProgramJobs
}));

vi.mock("@/features/leads/service", () => ({
  reconcilePendingLeadWebhooks
}));

vi.mock("@/features/report-delivery/service", () => ({
  reconcileDueReportSchedules,
  reconcilePendingReportScheduleRuns
}));

vi.mock("@/features/reporting/service", () => ({
  reconcilePendingReports
}));

vi.mock("@/features/autoresponder/service", () => ({
  runLeadAutomationFollowUpWorker
}));

vi.mock("@/features/crm-connector/lifecycle-service", () => ({
  reconcileDueServiceTitanLifecycleSyncs
}));

describe("internal reconcile route", () => {
  it("bounds limits and allows disabling individual workers", async () => {
    reconcilePendingLeadWebhooks.mockResolvedValueOnce([]);

    const { GET } = await import("@/app/api/internal/reconcile/route");
    const response = await GET(
      new Request(
        "http://localhost/api/internal/reconcile?programJobLimit=0&leadWebhookLimit=250&scheduledReportLimit=0&reportLimit=0&reportDeliveryLimit=0&autoresponderFollowUpLimit=0&connectorLifecycleLimit=0"
      )
    );

    expect(response.status).toBe(200);
    expect(reconcilePendingProgramJobs).not.toHaveBeenCalled();
    expect(reconcilePendingLeadWebhooks).toHaveBeenCalledWith(100);
    expect(reconcileDueReportSchedules).not.toHaveBeenCalled();
    expect(reconcilePendingReports).not.toHaveBeenCalled();
    expect(reconcilePendingReportScheduleRuns).not.toHaveBeenCalled();
    expect(runLeadAutomationFollowUpWorker).not.toHaveBeenCalled();
    expect(reconcileDueServiceTitanLifecycleSyncs).not.toHaveBeenCalled();
  });
});
