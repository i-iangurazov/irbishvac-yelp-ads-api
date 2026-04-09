import { describe, expect, it, vi } from "vitest";

const syncLeadDownstreamStatusWorkflow = vi.fn();

vi.mock("@/lib/utils/http", () => ({
  requireCronAuthorization: vi.fn(() => null),
  handleRouteError: vi.fn((error) => {
    throw error;
  })
}));

vi.mock("@/features/crm-enrichment/service", () => ({
  syncLeadDownstreamStatusWorkflow
}));

describe("downstream CRM sync route", () => {
  it("accepts internal downstream status sync payloads", async () => {
    syncLeadDownstreamStatusWorkflow.mockResolvedValueOnce({
      tenantId: "tenant_1",
      totalUpdates: 1,
      completedCount: 1,
      partialCount: 0,
      failedCount: 0,
      results: []
    });

    const { POST } = await import("@/app/api/internal/leads/downstream-sync/route");
    const response = await POST(
      new Request("http://localhost/api/internal/leads/downstream-sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cron-secret": "test-secret"
        },
        body: JSON.stringify({
          updates: [
            {
              externalLeadId: "lead_ext_1",
              statusEvent: {
                externalStatusEventId: "crm_evt_1",
                status: "ACTIVE",
                occurredAt: "2026-04-03T09:15:00.000Z"
              }
            }
          ]
        })
      })
    );

    expect(response.status).toBe(200);
    expect(syncLeadDownstreamStatusWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: [
          expect.objectContaining({
            externalLeadId: "lead_ext_1"
          })
        ]
      })
    );
  });
});
