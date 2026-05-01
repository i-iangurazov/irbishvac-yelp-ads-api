import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/yelp/base-client", () => ({
  requestYelp: vi.fn()
}));

import { YelpLeadsClient } from "@/lib/yelp/leads-client";
import { requestYelp } from "@/lib/yelp/base-client";

const mockedRequestYelp = vi.mocked(requestYelp);

const credential = {
  label: "Yelp token",
  baseUrl: "https://api.yelp.com",
  isEnabled: true,
  secret: "token"
};

describe("YelpLeadsClient business subscriptions", () => {
  beforeEach(() => {
    mockedRequestYelp.mockReset();
  });

  it("requests an async WEBHOOK subscription for businesses", async () => {
    mockedRequestYelp.mockResolvedValueOnce({ correlationId: "corr-request", data: null });

    const client = new YelpLeadsClient(credential);
    const result = await client.subscribeBusinesses({
      subscriptionTypes: ["WEBHOOK"],
      businessIds: ["SNa1ugk6DNIuvIPu8-AiGA"]
    });

    expect(result.correlationId).toBe("corr-request");
    expect(mockedRequestYelp).toHaveBeenCalledWith(
      expect.objectContaining({
        authType: "bearer",
        method: "POST",
        path: "/v3/businesses/subscriptions",
        body: {
          subscription_types: ["WEBHOOK"],
          business_ids: ["SNa1ugk6DNIuvIPu8-AiGA"]
        }
      })
    );
  });

  it("lists WEBHOOK subscriptions using Yelp's subscription_type query", async () => {
    mockedRequestYelp.mockResolvedValueOnce({
      correlationId: "corr-list",
      data: {
        total: 1,
        offset: 0,
        limit: 100,
        subscription_type: "WEBHOOK",
        subscriptions: [
          {
            business_id: "SNa1ugk6DNIuvIPu8-AiGA",
            subscribed_at: "2026-04-20T12:00:00+00"
          }
        ]
      }
    });

    const client = new YelpLeadsClient(credential);
    const result = await client.getBusinessSubscriptions("WEBHOOK");

    expect(result.data.subscriptions[0]?.business_id).toBe("SNa1ugk6DNIuvIPu8-AiGA");
    expect(mockedRequestYelp).toHaveBeenCalledWith(
      expect.objectContaining({
        authType: "bearer",
        path: "/v3/businesses/subscriptions",
        query: {
          subscription_type: "WEBHOOK",
          limit: 100,
          offset: 0
        }
      })
    );
  });

  it("fetches lead events with cursor pagination parameters", async () => {
    mockedRequestYelp.mockResolvedValueOnce({
      correlationId: "corr-events",
      data: [
        {
          cursor: "cursor_2",
          event_content: {
            text: "Consumer Message 2"
          }
        }
      ]
    });

    const client = new YelpLeadsClient(credential);
    await client.getLeadEvents("lead_1", {
      limit: 25,
      newerThanCursor: "cursor_1"
    });

    expect(mockedRequestYelp).toHaveBeenCalledWith(
      expect.objectContaining({
        authType: "bearer",
        path: "/v3/leads/lead_1/events",
        query: {
          limit: 20,
          newer_than_cursor: "cursor_1"
        }
      })
    );
  });
});
