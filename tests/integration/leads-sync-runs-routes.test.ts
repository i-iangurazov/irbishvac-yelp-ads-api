import { describe, expect, it, vi } from "vitest";

const createLeadBackfillRunWorkflow = vi.fn();
const getLeadBackfillRunStatusWorkflow = vi.fn();
const processLeadBackfillRunWorkflow = vi.fn();

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission: vi.fn(async () => ({ id: "user_1", tenantId: "tenant_1", role: { code: "ADMIN" } })),
  handleRouteError: vi.fn((error) => {
    throw error;
  })
}));

vi.mock("@/features/leads/service", () => ({
  createLeadBackfillRunWorkflow,
  getLeadBackfillRunStatusWorkflow,
  processLeadBackfillRunWorkflow
}));

describe("lead sync run routes", () => {
  it("creates a queued lead backfill run", async () => {
    createLeadBackfillRunWorkflow.mockResolvedValueOnce({
      syncRunId: "sync_run_1",
      businessId: "business_1",
      businessName: "IRBIS Air Plumbing Electrical"
    });

    const { POST } = await import("@/app/api/leads/sync/runs/route");
    const response = await POST(
      new Request("http://localhost/api/leads/sync/runs", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          businessId: "business_1"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(createLeadBackfillRunWorkflow).toHaveBeenCalledWith("tenant_1", "user_1", {
      businessId: "business_1"
    });
  });

  it("returns lead backfill run status", async () => {
    getLeadBackfillRunStatusWorkflow.mockResolvedValueOnce({
      syncRunId: "sync_run_1",
      status: "PROCESSING",
      businessName: "IRBIS Air Plumbing Electrical"
    });

    const { GET } = await import("@/app/api/leads/sync/runs/[runId]/route");
    const response = await GET(new Request("http://localhost/api/leads/sync/runs/sync_run_1"), {
      params: Promise.resolve({ runId: "sync_run_1" })
    });

    expect(response.status).toBe(200);
    expect(getLeadBackfillRunStatusWorkflow).toHaveBeenCalledWith("tenant_1", "sync_run_1");
  });

  it("processes a queued lead backfill run", async () => {
    processLeadBackfillRunWorkflow.mockResolvedValueOnce({
      syncRunId: "sync_run_1",
      status: "COMPLETED"
    });

    const { POST } = await import("@/app/api/leads/sync/runs/[runId]/process/route");
    const response = await POST(new Request("http://localhost/api/leads/sync/runs/sync_run_1/process", {
      method: "POST"
    }), {
      params: Promise.resolve({ runId: "sync_run_1" })
    });

    expect(response.status).toBe(200);
    expect(processLeadBackfillRunWorkflow).toHaveBeenCalledWith("tenant_1", "user_1", "sync_run_1");
  });
});
