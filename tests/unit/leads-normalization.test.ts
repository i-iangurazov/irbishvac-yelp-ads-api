import { describe, expect, it } from "vitest";

import {
  buildLeadListEntry,
  buildLeadTimeline,
  buildWebhookEventKey,
  normalizeLeadEvents,
  normalizeLeadSnapshot
} from "@/features/leads/normalize";

describe("lead normalization helpers", () => {
  it("keeps webhook idempotency keys stable across repeated deliveries", () => {
    const keyA = buildWebhookEventKey(
      "SoVHhx7Hel_XX0DKCLp72Q",
      {
        eventType: "NEW_EVENT",
        eventId: "IsKxQAYZNqCjvRRmNoiCUw",
        leadId: "TbvEUYEi02cmSBmqCjQbkg",
        interactionTime: new Date("2026-04-01T09:00:00.000Z"),
        raw: {
          event_type: "NEW_EVENT",
          event_id: "IsKxQAYZNqCjvRRmNoiCUw",
          lead_id: "TbvEUYEi02cmSBmqCjQbkg"
        }
      },
      0
    );
    const keyB = buildWebhookEventKey(
      "SoVHhx7Hel_XX0DKCLp72Q",
      {
        eventType: "NEW_EVENT",
        eventId: "IsKxQAYZNqCjvRRmNoiCUw",
        leadId: "TbvEUYEi02cmSBmqCjQbkg",
        interactionTime: new Date("2026-04-01T09:00:00.000Z"),
        raw: {
          event_type: "NEW_EVENT",
          event_id: "IsKxQAYZNqCjvRRmNoiCUw",
          lead_id: "TbvEUYEi02cmSBmqCjQbkg"
        }
      },
      0
    );

    expect(keyA).toBe(keyB);
  });

  it("normalizes a lead snapshot from Yelp-native lead and event payloads", () => {
    const normalized = normalizeLeadSnapshot({
      leadId: "lead_1",
      externalBusinessId: "biz_1",
      mappedBusinessId: "business_local_1",
      webhookReceivedAt: new Date("2026-04-01T09:15:00.000Z"),
      webhookUpdate: {
        eventType: "NEW_EVENT",
        eventId: "delivery_evt_1",
        leadId: "lead_1",
        interactionTime: new Date("2026-04-01T09:00:00.000Z"),
        raw: {
          event_type: "NEW_EVENT",
          lead_id: "lead_1"
        }
      },
      leadPayload: {
        id: "lead_1",
        business_id: "biz_1",
        conversation_id: "conv_123",
        time_created: "2026-04-01T09:00:00.000Z",
        is_read: true,
        customer: {
          name: "Jane Doe",
          email: "jane@example.com",
          phone: "+15555550100"
        }
      },
      leadEventsPayload: {
        events: [
          {
            event_id: "evt_1",
            event_type: "NEW_EVENT",
            interaction_time: "2026-04-01T09:00:00.000Z",
            actor_type: "CONSUMER",
            message: "Need help"
          },
          {
            event_id: "evt_2",
            event_type: "BUSINESS_REPLIED",
            interaction_time: "2026-04-01T09:10:00.000Z",
            actor_type: "BUSINESS_OWNER",
            message: "We can help"
          }
        ]
      }
    });

    expect(normalized.lead.businessId).toBe("business_local_1");
    expect(normalized.lead.externalConversationId).toBe("conv_123");
    expect(normalized.lead.customerName).toBe("Jane Doe");
    expect(normalized.lead.customerEmail).toBe("jane@example.com");
    expect(normalized.lead.customerPhone).toBe("+15555550100");
    expect(normalized.lead.createdAtYelp.toISOString()).toBe("2026-04-01T09:00:00.000Z");
    expect(normalized.lead.latestInteractionAt?.toISOString()).toBe("2026-04-01T09:10:00.000Z");
    expect(normalized.lead.replyState).toBe("REPLIED");
    expect(normalized.events).toHaveLength(2);
  });

  it("deduplicates repeated Yelp events by deterministic event key", () => {
    const events = normalizeLeadEvents("lead_1", {
      events: [
        {
          event_id: "evt_1",
          event_type: "NEW_EVENT",
          interaction_time: "2026-04-01T09:00:00.000Z"
        },
        {
          event_id: "evt_1",
          event_type: "NEW_EVENT",
          interaction_time: "2026-04-01T09:00:00.000Z"
        }
      ]
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.eventKey).toBe("lead_1:evt_1");
  });

  it("shapes lead list rows from normalized lead records", () => {
    const entry = buildLeadListEntry({
      id: "local_lead_1",
      externalLeadId: "lead_1",
      externalBusinessId: "biz_1",
      customerName: "Jane Doe",
      createdAtYelp: new Date("2026-04-01T09:00:00.000Z"),
      latestInteractionAt: new Date("2026-04-01T09:10:00.000Z"),
      replyState: "READ",
      business: {
        id: "business_local_1",
        name: "Northwind HVAC"
      },
      internalStatus: "UNMAPPED",
      webhookEvents: [
        {
          status: "FAILED",
          errorJson: {
            message: "Lead events fetch failed"
          }
        }
      ],
      crmLeadMappings: [],
      crmStatusEvents: [],
      syncRuns: []
    });

    expect(entry).toMatchObject({
      id: "local_lead_1",
      externalLeadId: "lead_1",
      mappedBusinessName: "Northwind HVAC",
      processingStatus: "FAILED",
      processingError: "Lead events fetch failed",
      mappingState: "UNRESOLVED",
      internalStatus: "UNMAPPED",
      crmHealthStatus: "UNRESOLVED"
    });
  });

  it("marks imported leads as completed when they were synced without a webhook delivery", () => {
    const entry = buildLeadListEntry({
      id: "local_lead_2",
      externalLeadId: "lead_2",
      externalBusinessId: "biz_1",
      customerName: "John Doe",
      createdAtYelp: new Date("2026-04-01T09:00:00.000Z"),
      latestInteractionAt: new Date("2026-04-01T09:10:00.000Z"),
      lastSyncedAt: new Date("2026-04-03T12:00:00.000Z"),
      replyState: "UNREAD",
      business: {
        id: "business_local_1",
        name: "Northwind HVAC"
      },
      internalStatus: "UNMAPPED",
      webhookEvents: [],
      crmLeadMappings: [],
      crmStatusEvents: [],
      syncRuns: []
    });

    expect(entry.processingStatus).toBe("COMPLETED");
    expect(entry.lastSyncedAt?.toISOString()).toBe("2026-04-03T12:00:00.000Z");
  });

  it("orders the lead detail timeline chronologically", () => {
    const timeline = buildLeadTimeline([
      {
        eventKey: "lead_1:evt_2",
        eventType: "BUSINESS_REPLIED",
        actorType: "BUSINESS_OWNER",
        occurredAt: new Date("2026-04-01T09:10:00.000Z"),
        isRead: false,
        isReply: true,
        payloadJson: {}
      },
      {
        eventKey: "lead_1:evt_1",
        eventType: "NEW_EVENT",
        actorType: "CONSUMER",
        occurredAt: new Date("2026-04-01T09:00:00.000Z"),
        isRead: false,
        isReply: false,
        payloadJson: {}
      }
    ]);

    expect(timeline.map((item) => item.eventType)).toEqual(["NEW_EVENT", "BUSINESS_REPLIED"]);
  });
});
