import { describe, expect, it, vi } from "vitest";

const generateLeadReplyDraftsWorkflow = vi.fn();
const recordLeadReplyDraftUsageWorkflow = vi.fn();

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission: vi.fn(async () => ({ id: "user_1", tenantId: "tenant_1", role: { code: "ADMIN" } })),
  handleRouteError: vi.fn((error) => {
    throw error;
  })
}));

vi.mock("@/features/leads/ai-reply-service", () => ({
  generateLeadReplyDraftsWorkflow,
  recordLeadReplyDraftUsageWorkflow
}));

describe("lead reply draft routes", () => {
  it("requests AI draft suggestions for the selected lead channel", async () => {
    generateLeadReplyDraftsWorkflow.mockResolvedValueOnce({
      requestId: "draft_request_1",
      channel: "YELP_THREAD",
      generatedAt: "2026-04-07T12:00:00.000Z",
      needsHumanReply: false,
      warnings: [],
      drafts: [
        {
          id: "draft_1",
          title: "Default",
          subject: null,
          body: "Thanks for reaching out."
        }
      ]
    });

    const { POST } = await import("@/app/api/leads/[leadId]/reply-draft/route");
    const response = await POST(
      new Request("http://localhost/api/leads/lead_1/reply-draft", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          channel: "YELP_THREAD",
          variantCount: 2
        })
      }),
      {
        params: Promise.resolve({ leadId: "lead_1" })
      }
    );

    expect(response.status).toBe(200);
    expect(generateLeadReplyDraftsWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      "lead_1",
      expect.objectContaining({
        channel: "YELP_THREAD",
        variantCount: 2
      })
    );
  });

  it("records draft discard usage events", async () => {
    recordLeadReplyDraftUsageWorkflow.mockResolvedValueOnce({
      status: "RECORDED"
    });

    const { POST } = await import("@/app/api/leads/[leadId]/reply-draft/usage/route");
    const response = await POST(
      new Request("http://localhost/api/leads/lead_1/reply-draft/usage", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          requestId: "draft_request_1",
          draftId: "draft_1",
          action: "DISCARDED"
        })
      }),
      {
        params: Promise.resolve({ leadId: "lead_1" })
      }
    );

    expect(response.status).toBe(200);
    expect(recordLeadReplyDraftUsageWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      "lead_1",
      expect.objectContaining({
        requestId: "draft_request_1",
        draftId: "draft_1",
        action: "DISCARDED"
      })
    );
  });
});
