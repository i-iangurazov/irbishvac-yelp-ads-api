import { describe, expect, it, vi } from "vitest";

const sendLeadReplyWorkflow = vi.fn();
const markLeadAsReadWorkflow = vi.fn();
const markLeadAsRepliedWorkflow = vi.fn();

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission: vi.fn(async () => ({ id: "user_1", tenantId: "tenant_1", role: { code: "ADMIN" } })),
  handleRouteError: vi.fn((error) => {
    throw error;
  })
}));

vi.mock("@/features/leads/messaging-service", () => ({
  sendLeadReplyWorkflow,
  markLeadAsReadWorkflow,
  markLeadAsRepliedWorkflow
}));

describe("lead messaging routes", () => {
  it("passes AI draft metadata through the reply route", async () => {
    sendLeadReplyWorkflow.mockResolvedValueOnce({
      status: "SENT",
      channel: "YELP_THREAD",
      warning: null
    });

    const { POST } = await import("@/app/api/leads/[leadId]/reply/route");
    const response = await POST(
      new Request("http://localhost/api/leads/lead_1/reply", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          channel: "YELP_THREAD",
          body: "Thanks for reaching out.",
          aiDraft: {
            requestId: "draft_request_1",
            draftId: "draft_1",
            edited: true,
            warningCodes: ["INSUFFICIENT_CONTEXT"]
          }
        })
      }),
      {
        params: Promise.resolve({ leadId: "lead_1" })
      }
    );

    expect(response.status).toBe(200);
    expect(sendLeadReplyWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      "lead_1",
      expect.objectContaining({
        channel: "YELP_THREAD",
        body: "Thanks for reaching out.",
        aiDraft: {
          requestId: "draft_request_1",
          draftId: "draft_1",
          edited: true,
          warningCodes: ["INSUFFICIENT_CONTEXT"]
        }
      }),
      { idempotencyKey: null }
    );
  });

  it("posts explicit external reply markers through the leads write workflow", async () => {
    markLeadAsRepliedWorkflow.mockResolvedValueOnce({
      status: "SENT",
      replyType: "PHONE"
    });

    const { POST } = await import("@/app/api/leads/[leadId]/mark-replied/route");
    const response = await POST(
      new Request("http://localhost/api/leads/lead_1/mark-replied", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          replyType: "PHONE"
        })
      }),
      {
        params: Promise.resolve({ leadId: "lead_1" })
      }
    );

    expect(response.status).toBe(200);
    expect(markLeadAsRepliedWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      "lead_1",
      expect.objectContaining({
        replyType: "PHONE"
      })
    );
  });
});
