import { beforeEach, describe, expect, it, vi } from "vitest";

const reconcilePendingProgramJobs = vi.fn();
const reconcilePendingLeadWebhooks = vi.fn();
const reconcileRecentYelpLeadsForAutomation = vi.fn();
const reconcileDueReportSchedules = vi.fn();
const reconcilePendingReports = vi.fn();
const reconcilePendingReportScheduleRuns = vi.fn();
const runLeadAutomationFollowUpWorker = vi.fn();
const reconcileDueServiceTitanLifecycleSyncs = vi.fn();
const runDurableWorkerTask = vi.fn();
const summarizeDurableWorkerOutcome = vi.fn(
  (outcome: {
    status: string;
    job: { jobKey: string; attempts: number; maxAttempts: number };
    durationMs: number;
  }) => ({
    status: outcome.status,
    jobKey: outcome.job.jobKey,
    attempts: outcome.job.attempts,
    maxAttempts: outcome.job.maxAttempts,
    durationMs: outcome.durationMs,
  }),
);

vi.mock("@/lib/utils/http", () => ({
  requireCronAuthorization: vi.fn(() => null),
  handleRouteError: vi.fn((error) => {
    throw error;
  }),
}));

vi.mock("@/features/ads-programs/service", () => ({
  reconcilePendingProgramJobs,
}));

vi.mock("@/features/leads/service", () => ({
  reconcilePendingLeadWebhooks,
  reconcileRecentYelpLeadsForAutomation,
}));

vi.mock("@/features/report-delivery/service", () => ({
  reconcileDueReportSchedules,
  reconcilePendingReportScheduleRuns,
}));

vi.mock("@/features/reporting/service", () => ({
  reconcilePendingReports,
}));

vi.mock("@/features/autoresponder/service", () => ({
  runLeadAutomationFollowUpWorker,
}));

vi.mock("@/features/crm-connector/lifecycle-service", () => ({
  reconcileDueServiceTitanLifecycleSyncs,
}));

vi.mock("@/features/operations/worker-job-service", () => ({
  runDurableWorkerTask,
  summarizeDurableWorkerOutcome,
}));

describe("internal reconcile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runDurableWorkerTask.mockImplementation(
      async ({ task }: { task: () => Promise<unknown> }) => ({
        status: "SUCCEEDED",
        job: {
          id: "worker_job_1",
          jobKey: "test-worker",
          attempts: 0,
          maxAttempts: 3,
        },
        result: await task(),
        durationMs: 1,
      }),
    );
  });

  it("bounds limits and allows disabling individual workers", async () => {
    reconcilePendingLeadWebhooks.mockResolvedValueOnce([]);

    const { GET } = await import("@/app/api/internal/reconcile/route");
    const response = await GET(
      new Request(
        "http://localhost/api/internal/reconcile?programJobLimit=0&leadWebhookLimit=250&leadPollingLimit=0&scheduledReportLimit=0&reportLimit=0&reportDeliveryLimit=0&autoresponderFollowUpLimit=0&connectorLifecycleLimit=0",
      ),
    );

    expect(response.status).toBe(200);
    expect(reconcilePendingProgramJobs).not.toHaveBeenCalled();
    expect(reconcilePendingLeadWebhooks).toHaveBeenCalledWith(100);
    expect(reconcileRecentYelpLeadsForAutomation).not.toHaveBeenCalled();
    expect(reconcileDueReportSchedules).not.toHaveBeenCalled();
    expect(reconcilePendingReports).not.toHaveBeenCalled();
    expect(reconcilePendingReportScheduleRuns).not.toHaveBeenCalled();
    expect(runLeadAutomationFollowUpWorker).not.toHaveBeenCalled();
    expect(reconcileDueServiceTitanLifecycleSyncs).not.toHaveBeenCalled();
  });

  it("returns 503 when a durable worker reports an internal failure", async () => {
    runDurableWorkerTask.mockResolvedValueOnce({
      status: "DEAD_LETTERED",
      job: {
        id: "worker_job_failed",
        jobKey: "internal-reconcile:lead-webhooks",
        attempts: 3,
        maxAttempts: 3,
      },
      result: null,
      errorSummary: "Worker failed",
      durationMs: 1,
    });

    const { GET } = await import("@/app/api/internal/reconcile/route");
    const response = await GET(
      new Request(
        "http://localhost/api/internal/reconcile?programJobLimit=0&leadWebhookLimit=1&leadPollingLimit=0&scheduledReportLimit=0&reportLimit=0&reportDeliveryLimit=0&autoresponderFollowUpLimit=0&connectorLifecycleLimit=0",
      ),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      workerJobs: {
        leadWebhooks: {
          status: "DEAD_LETTERED",
        },
      },
    });
  });

  it("returns 503 when lead polling completes with application failures", async () => {
    reconcileRecentYelpLeadsForAutomation.mockResolvedValueOnce({
      tenantCount: 1,
      businessCount: 1,
      processedLeadCount: 0,
      importedCount: 0,
      updatedCount: 0,
      failedCount: 1,
      initialAutomationProcessedCount: 0,
      conversationAutomationProcessedCount: 0,
      conversationAutomationSkippedCount: 0,
      conversationAutomationSkipReasons: {},
      accessFailureCount: 0,
      accessFailures: [],
      results: [],
    });

    const { GET } = await import("@/app/api/internal/reconcile/route");
    const response = await GET(
      new Request(
        "http://localhost/api/internal/reconcile?programJobLimit=0&leadWebhookLimit=0&leadPollingLimit=1&scheduledReportLimit=0&reportLimit=0&reportDeliveryLimit=0&autoresponderFollowUpLimit=0&connectorLifecycleLimit=0",
      ),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      leadPolling: {
        failedCount: 1,
      },
    });
  });
});
