import { describe, expect, it, vi } from "vitest";

const { replayDeadLetteredWorkerJobWorkflow, requireApiPermission } =
  vi.hoisted(() => ({
    replayDeadLetteredWorkerJobWorkflow: vi.fn(),
    requireApiPermission: vi.fn(),
  }));

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission,
  handleRouteError: vi.fn((error) => {
    throw error;
  }),
}));

vi.mock("@/features/operations/service", () => ({
  replayDeadLetteredWorkerJobWorkflow,
}));

describe("worker job replay route", () => {
  it("passes authenticated tenant, actor and role to the replay workflow", async () => {
    requireApiPermission.mockResolvedValueOnce({
      id: "operator_1",
      tenantId: "tenant_1",
      role: { code: "CLIENT_ADMIN" },
    });
    replayDeadLetteredWorkerJobWorkflow.mockResolvedValueOnce({
      id: "worker_1",
      status: "QUEUED",
    });

    const { POST } = await import("@/app/api/worker-jobs/[jobId]/replay/route");
    const response = await POST(
      new Request("http://localhost/api/worker-jobs/worker_1/replay", {
        method: "POST",
      }),
      { params: Promise.resolve({ jobId: "worker_1" }) },
    );

    expect(response.status).toBe(200);
    expect(requireApiPermission).toHaveBeenCalledWith("sync:retry");
    expect(replayDeadLetteredWorkerJobWorkflow).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      actorId: "operator_1",
      actorRole: "CLIENT_ADMIN",
      jobId: "worker_1",
    });
  });
});
