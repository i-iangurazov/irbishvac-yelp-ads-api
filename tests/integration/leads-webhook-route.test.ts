import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ingestYelpLeadWebhook = vi.fn();

vi.mock("@/features/leads/service", () => ({
  ingestYelpLeadWebhook
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Yelp leads webhook route", () => {
  it("returns the verification token for Yelp webhook setup", async () => {
    const { GET } = await import("@/app/api/webhooks/yelp/leads/route");
    const response = await GET(new Request("http://localhost/api/webhooks/yelp/leads?verification=test-token"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      verification: "test-token"
    });
  });

  it("accepts a webhook POST and queues the delivery for async processing", async () => {
    vi.resetModules();
    vi.stubEnv("MAIN_PLATFORM_WEBHOOK_SHARED_SECRET", "");
    ingestYelpLeadWebhook.mockResolvedValueOnce({
      tenantId: "tenant_1",
      externalBusinessId: "biz_1",
      results: [
        {
          eventKey: "leads_event:biz_1:lead_1:NEW_EVENT:evt_1",
          deliveryStatus: "QUEUED",
          leadId: "lead_1",
          localLeadId: "local_lead_1"
        }
      ]
    });

    const { POST } = await import("@/app/api/webhooks/yelp/leads/route");
    const response = await POST(
      new Request("http://localhost/api/webhooks/yelp/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          time: "2026-04-01T09:00:00.000Z",
          object: "business",
          data: {
            id: "biz_1",
            updates: [
              {
                event_type: "NEW_EVENT",
                event_id: "evt_1",
                lead_id: "lead_1",
                interaction_time: "2026-04-01T09:00:00.000Z"
              }
            ]
          }
        })
      })
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      accepted: true,
      tenantId: "tenant_1",
      externalBusinessId: "biz_1"
    });
  });

  it("rejects forwarded webhook POSTs when the shared secret is configured but missing", async () => {
    vi.resetModules();
    vi.stubEnv("MAIN_PLATFORM_WEBHOOK_SHARED_SECRET", "topsecret");

    const { POST } = await import("@/app/api/webhooks/yelp/leads/route");
    const response = await POST(
      new Request("http://localhost/api/webhooks/yelp/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          time: "2026-04-01T09:00:00.000Z",
          object: "business",
          data: {
            id: "biz_1",
            updates: []
          }
        })
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      accepted: false
    });
    expect(ingestYelpLeadWebhook).not.toHaveBeenCalled();
  });

  it("accepts forwarded webhook POSTs when the shared secret matches", async () => {
    vi.resetModules();
    vi.stubEnv("MAIN_PLATFORM_WEBHOOK_SHARED_SECRET", "topsecret");
    ingestYelpLeadWebhook.mockResolvedValueOnce({
      tenantId: "tenant_1",
      externalBusinessId: "biz_1",
      results: []
    });

    const { POST } = await import("@/app/api/webhooks/yelp/leads/route");
    const response = await POST(
      new Request("http://localhost/api/webhooks/yelp/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-irbis-forward-secret": "topsecret",
          "x-yelp-delivery-id": "delivery_1"
        },
        body: JSON.stringify({
          time: "2026-04-01T09:00:00.000Z",
          object: "business",
          data: {
            id: "biz_1",
            updates: []
          }
        })
      })
    );

    expect(response.status).toBe(202);
    expect(ingestYelpLeadWebhook).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        "x-irbis-forward-secret": "topsecret",
        "x-yelp-delivery-id": "delivery_1"
      })
    );
  });
});
