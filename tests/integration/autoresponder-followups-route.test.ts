import { beforeEach, describe, expect, it, vi } from "vitest";

const runLeadAutomationFollowUpWorker = vi.fn();
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
  handleRouteError: vi.fn(() =>
    Response.json({ error: "Internal worker failure" }, { status: 500 }),
  ),
}));

vi.mock("@/features/autoresponder/service", () => ({
  runLeadAutomationFollowUpWorker,
}));

vi.mock("@/features/operations/worker-job-service", () => ({
  runDurableWorkerTask,
  summarizeDurableWorkerOutcome,
}));

describe("autoresponder follow-up worker route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runDurableWorkerTask.mockImplementation(
      async ({ task }: { task: () => Promise<unknown> }) => ({
        status: "SUCCEEDED",
        job: {
          id: "worker_job_1",
          jobKey: "autoresponder-followups",
          attempts: 0,
          maxAttempts: 3,
        },
        result: await task(),
        durationMs: 1,
      }),
    );
  });

  it("runs the dedicated follow-up worker with a bounded limit", async () => {
    runLeadAutomationFollowUpWorker.mockResolvedValueOnce([
      {
        attemptId: "attempt_1",
        leadId: "lead_1",
        cadence: "FOLLOW_UP_24H",
        status: "SENT",
      },
    ]);

    const { GET } =
      await import("@/app/api/internal/autoresponder/followups/route");
    const response = await GET(
      new Request(
        "http://localhost/api/internal/autoresponder/followups?limit=250",
      ),
    );

    expect(response.status).toBe(200);
    expect(runLeadAutomationFollowUpWorker).toHaveBeenCalledWith(100);
  });

  it("returns a failing HTTP status when the durable worker fails", async () => {
    runDurableWorkerTask.mockResolvedValueOnce({
      status: "FAILED",
      job: {
        id: "worker_job_failed",
        jobKey: "autoresponder-followups",
        attempts: 1,
        maxAttempts: 3,
      },
      result: null,
      errorSummary: "Yelp delivery failed",
      durationMs: 1,
    });

    const { GET } =
      await import("@/app/api/internal/autoresponder/followups/route");
    const response = await GET(
      new Request("http://localhost/api/internal/autoresponder/followups"),
    );

    expect(response.status).toBe(500);
    expect(runLeadAutomationFollowUpWorker).not.toHaveBeenCalled();
  });
});
