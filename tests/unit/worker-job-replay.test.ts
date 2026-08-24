import { beforeEach, describe, expect, it, vi } from "vitest";

const { getWorkerJobOverview, recordAuditEvent, requeueDeadLetteredWorkerJob } =
  vi.hoisted(() => ({
    getWorkerJobOverview: vi.fn(),
    recordAuditEvent: vi.fn(),
    requeueDeadLetteredWorkerJob: vi.fn(),
  }));

vi.mock("@/lib/db/worker-jobs-repository", () => ({
  getWorkerJobOverview,
  requeueDeadLetteredWorkerJob,
}));

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent,
}));

describe("dead-letter worker replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requeues only the active tenant job for a tenant operator and audits it", async () => {
    requeueDeadLetteredWorkerJob.mockResolvedValueOnce({
      before: {
        id: "worker_1",
        jobKey: "tenant-worker",
        status: "DEAD_LETTERED",
        attempts: 3,
        maxAttempts: 3,
      },
      after: {
        id: "worker_1",
        jobKey: "tenant-worker",
        status: "QUEUED",
        attempts: 0,
      },
    });

    const { replayDeadLetteredWorkerJobWorkflow } =
      await import("@/features/operations/service");
    const result = await replayDeadLetteredWorkerJobWorkflow({
      tenantId: "tenant_1",
      actorId: "operator_1",
      actorRole: "CLIENT_ADMIN",
      jobId: "worker_1",
    });

    expect(requeueDeadLetteredWorkerJob).toHaveBeenCalledWith({
      jobId: "worker_1",
      tenantId: "tenant_1",
      includeGlobal: false,
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_1",
        actorId: "operator_1",
        actionType: "worker_job.requeue",
        status: "SUCCESS",
      }),
    );
    expect(result).toMatchObject({ status: "QUEUED", attempts: 0 });
  });

  it("allows only a platform administrator to include a global worker", async () => {
    requeueDeadLetteredWorkerJob.mockResolvedValueOnce({
      before: {
        id: "worker_global",
        jobKey: "global-worker",
        status: "DEAD_LETTERED",
        attempts: 3,
        maxAttempts: 3,
      },
      after: {
        id: "worker_global",
        status: "QUEUED",
        attempts: 0,
      },
    });

    const { replayDeadLetteredWorkerJobWorkflow } =
      await import("@/features/operations/service");
    await replayDeadLetteredWorkerJobWorkflow({
      tenantId: "platform_tenant",
      actorId: "platform_1",
      actorRole: "PLATFORM_ADMIN",
      jobId: "worker_global",
    });

    expect(requeueDeadLetteredWorkerJob).toHaveBeenCalledWith(
      expect.objectContaining({ includeGlobal: true }),
    );
  });

  it("rejects an unavailable or already replayed worker without an audit success", async () => {
    requeueDeadLetteredWorkerJob.mockResolvedValueOnce(null);

    const { replayDeadLetteredWorkerJobWorkflow } =
      await import("@/features/operations/service");

    await expect(
      replayDeadLetteredWorkerJobWorkflow({
        tenantId: "tenant_1",
        actorId: "operator_1",
        actorRole: "CLIENT_ADMIN",
        jobId: "worker_other_tenant",
      }),
    ).rejects.toThrow(/unavailable in the active tenant/i);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});
