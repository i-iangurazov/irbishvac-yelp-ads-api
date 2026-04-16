import { beforeEach, describe, expect, it, vi } from "vitest";

const claimWorkerJob = vi.fn();
const completeWorkerJob = vi.fn();
const failWorkerJob = vi.fn();
const markWorkerJobProcessing = vi.fn();
const summarizeWorkerError = vi.fn((error: unknown) => (error instanceof Error ? error.message : "Unknown worker failure"));

vi.mock("@/lib/db/worker-jobs-repository", () => ({
  claimWorkerJob,
  completeWorkerJob,
  failWorkerJob,
  markWorkerJobProcessing,
  summarizeWorkerError
}));

vi.mock("@/lib/utils/logging", () => ({
  logError: vi.fn(),
  logInfo: vi.fn()
}));

function buildJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "worker_job_1",
    tenantId: null,
    jobKey: "test-worker",
    kind: "OPERATIONS_ALERTS",
    status: "CLAIMED",
    attempts: 1,
    maxAttempts: 3,
    priority: 100,
    queuedAt: new Date("2026-04-09T00:00:00Z"),
    nextAttemptAt: new Date("2026-04-09T00:00:00Z"),
    claimedAt: new Date("2026-04-09T00:00:00Z"),
    claimExpiresAt: new Date("2026-04-09T00:10:00Z"),
    claimedBy: "test",
    startedAt: null,
    finishedAt: null,
    deadLetteredAt: null,
    lastHeartbeatAt: null,
    lastErrorSummary: null,
    lastErrorJson: null,
    payloadJson: null,
    resultJson: null,
    createdAt: new Date("2026-04-09T00:00:00Z"),
    updatedAt: new Date("2026-04-09T00:00:00Z"),
    ...overrides
  };
}

describe("worker job service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips when an existing worker lease is active", async () => {
    const job = buildJob({ status: "PROCESSING" });
    claimWorkerJob.mockResolvedValueOnce({
      claimed: false,
      job,
      skippedReason: "ACTIVE_OR_NOT_DUE"
    });

    const { runDurableWorkerTask } = await import("@/features/operations/worker-job-service");
    const task = vi.fn();
    const outcome = await runDurableWorkerTask({
      kind: "OPERATIONS_ALERTS",
      jobKey: "test-worker",
      task
    });

    expect(outcome.status).toBe("SKIPPED");
    expect(task).not.toHaveBeenCalled();
  });

  it("marks a claimed worker as succeeded when the task completes", async () => {
    const claimedJob = buildJob();
    const processingJob = buildJob({ status: "PROCESSING" });
    const succeededJob = buildJob({ status: "SUCCEEDED", attempts: 0 });
    claimWorkerJob.mockResolvedValueOnce({ claimed: true, job: claimedJob });
    markWorkerJobProcessing.mockResolvedValueOnce(processingJob);
    completeWorkerJob.mockResolvedValueOnce(succeededJob);

    const { runDurableWorkerTask } = await import("@/features/operations/worker-job-service");
    const outcome = await runDurableWorkerTask({
      kind: "OPERATIONS_ALERTS",
      jobKey: "test-worker",
      task: async () => ({ ok: true })
    });

    expect(markWorkerJobProcessing).toHaveBeenCalledWith(claimedJob.id);
    expect(completeWorkerJob).toHaveBeenCalledWith(processingJob.id, { ok: true });
    expect(outcome.status).toBe("SUCCEEDED");
    expect(outcome.result).toEqual({ ok: true });
  });

  it("marks failed workers and reports dead-letter status after max attempts", async () => {
    const claimedJob = buildJob({ attempts: 3 });
    const processingJob = buildJob({ status: "PROCESSING", attempts: 3 });
    const deadLetteredJob = buildJob({ status: "DEAD_LETTERED", attempts: 3, deadLetteredAt: new Date("2026-04-09T00:01:00Z") });
    const error = new Error("provider outage");
    claimWorkerJob.mockResolvedValueOnce({ claimed: true, job: claimedJob });
    markWorkerJobProcessing.mockResolvedValueOnce(processingJob);
    failWorkerJob.mockResolvedValueOnce(deadLetteredJob);

    const { runDurableWorkerTask } = await import("@/features/operations/worker-job-service");
    const outcome = await runDurableWorkerTask({
      kind: "OPERATIONS_ALERTS",
      jobKey: "test-worker",
      task: async () => {
        throw error;
      }
    });

    expect(failWorkerJob).toHaveBeenCalledWith(processingJob.id, error);
    expect(outcome.status).toBe("DEAD_LETTERED");
    if (outcome.status === "FAILED" || outcome.status === "DEAD_LETTERED") {
      expect(outcome.errorSummary).toBe("provider outage");
    }
  });
});
