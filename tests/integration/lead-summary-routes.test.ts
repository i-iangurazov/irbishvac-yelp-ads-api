import { describe, expect, it, vi } from "vitest";

const generateLeadSummaryWorkflow = vi.fn();
const recordLeadSummaryUsageWorkflow = vi.fn();

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission: vi.fn(async () => ({ id: "user_1", tenantId: "tenant_1", role: { code: "ADMIN" } })),
  handleRouteError: vi.fn((error) => {
    throw error;
  })
}));

vi.mock("@/features/leads/ai-summary-service", () => ({
  generateLeadSummaryWorkflow,
  recordLeadSummaryUsageWorkflow
}));

describe("lead summary routes", () => {
  it("requests an AI lead summary for the selected lead", async () => {
    generateLeadSummaryWorkflow.mockResolvedValueOnce({
      requestId: "summary_request_1",
      generatedAt: "2026-04-07T12:00:00.000Z",
      needsHumanReview: false,
      warnings: [],
      summary: {
        customerIntent: "Customer needs water heater repair.",
        serviceContext: "Water heater repair for Northwind HVAC.",
        threadStatus: "One Yelp thread message stored.",
        partnerLifecycle: "Partner lifecycle: Contacted.",
        issueNote: null,
        missingInfo: [],
        nextSteps: ["Reply in the Yelp thread if more detail is needed."]
      }
    });

    const { POST } = await import("@/app/api/leads/[leadId]/summary/route");
    const response = await POST(
      new Request("http://localhost/api/leads/lead_1/summary", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          refresh: false
        })
      }),
      {
        params: Promise.resolve({ leadId: "lead_1" })
      }
    );

    expect(response.status).toBe(200);
    expect(generateLeadSummaryWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      "lead_1",
      expect.objectContaining({
        refresh: false
      })
    );
  });

  it("records summary dismiss usage events", async () => {
    recordLeadSummaryUsageWorkflow.mockResolvedValueOnce({
      status: "RECORDED"
    });

    const { POST } = await import("@/app/api/leads/[leadId]/summary/usage/route");
    const response = await POST(
      new Request("http://localhost/api/leads/lead_1/summary/usage", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          requestId: "summary_request_1",
          action: "DISMISSED"
        })
      }),
      {
        params: Promise.resolve({ leadId: "lead_1" })
      }
    );

    expect(response.status).toBe(200);
    expect(recordLeadSummaryUsageWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      "lead_1",
      expect.objectContaining({
        requestId: "summary_request_1",
        action: "DISMISSED"
      })
    );
  });
});
