import { describe, expect, it, vi } from "vitest";

const upsertLeadCrmMappingWorkflow = vi.fn();
const appendLeadInternalStatusWorkflow = vi.fn();

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission: vi.fn(async () => ({ id: "user_1", tenantId: "tenant_1", role: { code: "ADMIN" } })),
  handleRouteError: vi.fn((error) => {
    throw error;
  })
}));

vi.mock("@/features/crm-enrichment/service", () => ({
  upsertLeadCrmMappingWorkflow,
  appendLeadInternalStatusWorkflow
}));

describe("lead CRM routes", () => {
  it("posts CRM mapping updates through the leads write workflow", async () => {
    upsertLeadCrmMappingWorkflow.mockResolvedValueOnce({
      mappingId: "crm_mapping_1",
      state: "MANUAL_OVERRIDE"
    });

    const { POST } = await import("@/app/api/leads/[leadId]/crm-mapping/route");
    const response = await POST(
      new Request("http://localhost/api/leads/lead_1/crm-mapping", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          state: "MANUAL_OVERRIDE",
          externalCrmLeadId: "crm-123"
        })
      }),
      {
        params: Promise.resolve({ leadId: "lead_1" })
      }
    );

    expect(response.status).toBe(200);
    expect(upsertLeadCrmMappingWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      "lead_1",
      expect.objectContaining({
        state: "MANUAL_OVERRIDE",
        externalCrmLeadId: "crm-123"
      })
    );
  });

  it("posts internal status updates through the leads write workflow", async () => {
    appendLeadInternalStatusWorkflow.mockResolvedValueOnce({
      crmStatusEventId: "crm_status_1",
      status: "BOOKED"
    });

    const { POST } = await import("@/app/api/leads/[leadId]/crm-statuses/route");
    const response = await POST(
      new Request("http://localhost/api/leads/lead_1/crm-statuses", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          status: "BOOKED",
          occurredAt: "2026-04-03T09:00:00.000Z"
        })
      }),
      {
        params: Promise.resolve({ leadId: "lead_1" })
      }
    );

    expect(response.status).toBe(200);
    expect(appendLeadInternalStatusWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      "lead_1",
      expect.objectContaining({
        status: "BOOKED",
        occurredAt: "2026-04-03T09:00:00.000Z"
      })
    );
  });
});
