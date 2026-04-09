import { describe, expect, it } from "vitest";

import {
  buildFallbackLeadReplyDrafts,
  evaluateLeadReplyDraftRisk,
  extractLeadReplyThreadContext
} from "@/features/leads/ai-reply-service";

describe("ai reply assistant helpers", () => {
  it("extracts recent thread messages and removes immediate duplicates", () => {
    const context = extractLeadReplyThreadContext([
      {
        actorType: "CUSTOMER",
        occurredAt: new Date("2026-04-07T10:00:00.000Z"),
        payloadJson: { message: "Our water heater is leaking." },
        isReply: false
      },
      {
        actorType: "CUSTOMER",
        occurredAt: new Date("2026-04-07T10:00:01.000Z"),
        payloadJson: { message: "Our water heater is leaking." },
        isReply: false
      },
      {
        actorType: "BUSINESS",
        occurredAt: new Date("2026-04-07T10:05:00.000Z"),
        payloadJson: { text: "Thanks, can you share a photo?" },
        isReply: true
      }
    ]);

    expect(context).toEqual([
      {
        actor: "Customer",
        occurredAt: "2026-04-07T10:00:00.000Z",
        text: "Our water heater is leaking."
      },
      {
        actor: "Business",
        occurredAt: "2026-04-07T10:05:00.000Z",
        text: "Thanks, can you share a photo?"
      }
    ]);
  });

  it("flags risky pricing and availability language", () => {
    expect(
      evaluateLeadReplyDraftRisk({
        subject: "We can quote this today",
        body: "The cost is $149 and we can be there within 2 hours."
      })
    ).toEqual(
      expect.arrayContaining(["POTENTIAL_PRICING_CLAIM", "POTENTIAL_AVAILABILITY_CLAIM"])
    );
  });

  it("builds a safe fallback draft for review mode", () => {
    expect(
      buildFallbackLeadReplyDrafts({
        channel: "EMAIL",
        customerName: "Jane",
        businessName: "Northwind HVAC",
        serviceType: "Water heater repair",
        isAfterHours: true
      })
    ).toEqual([
      {
        title: "After-hours follow-up",
        subject: "Thanks for contacting Northwind HVAC",
        body:
          "Hi Jane,\n\nWe received your Yelp message for Water heater repair, and our team will review it during the next business window. Could you share a little more detail about the issue and the best callback or appointment timing for you?"
      }
    ]);
  });
});
