import { describe, expect, it } from "vitest";

import {
  classifyInboundConversationEvent,
  decideInboundConversationResponse,
  extractLeadConversationMessage,
  findNextInboundConversationEvent
} from "@/features/autoresponder/conversation";
import type { LeadAutoresponderSettingsValues } from "@/features/autoresponder/schemas";

const baseSettings: LeadAutoresponderSettingsValues = {
  isEnabled: true,
  scopeMode: "ALL_BUSINESSES",
  scopedBusinessIds: [],
  defaultChannel: "YELP_THREAD",
  emailFallbackEnabled: false,
  followUp24hEnabled: false,
  followUp24hDelayHours: 24,
  followUp7dEnabled: false,
  followUp7dDelayDays: 7,
  aiAssistEnabled: true,
  aiModel: "gpt-5-nano",
  conversationAutomationEnabled: true,
  conversationGlobalPauseEnabled: false,
  conversationMode: "BOUNDED_AUTO_REPLY",
  conversationAllowedIntents: [
    "MISSING_DETAILS_PROVIDED",
    "BASIC_ACKNOWLEDGMENT",
    "SIMPLE_NEXT_STEP_CLARIFICATION"
  ],
  conversationMaxAutomatedTurns: 2,
  conversationReviewFallbackEnabled: true,
  conversationEscalateToIssueQueue: true
};

describe("conversation autoresponder classification", () => {
  it("extracts inbound message text from nested webhook payloads", () => {
    expect(
      extractLeadConversationMessage({
        payload: {
          message: "Here is the address and a photo."
        }
      })
    ).toBe("Here is the address and a photo.");
  });

  it("extracts Yelp thread text from event_content", () => {
    expect(
      extractLeadConversationMessage({
        event_content: {
          text: "Can you help me?",
          fallback_text: "Can you help me?"
        }
      })
    ).toBe("Can you help me?");
  });

  it("classifies pricing questions conservatively", () => {
    expect(
      classifyInboundConversationEvent({
        payloadJson: {
          message: "How much will this cost and can you give me a quote?"
        }
      })
    ).toMatchObject({
      intent: "QUOTE_PRICING_REQUEST",
      confidence: "HIGH",
      templateKind: "CANNOT_ESTIMATE"
    });
  });

  it("classifies missing details as safe detail-provided updates", () => {
    expect(
      classifyInboundConversationEvent({
        payloadJson: {
          message: "The address is 123 Main St and I attached a photo of the leaking unit."
        }
      })
    ).toMatchObject({
      intent: "MISSING_DETAILS_PROVIDED",
      confidence: "MEDIUM",
      templateKind: "RECEIVED_UPDATE"
    });
  });

  it("finds the next inbound event after the last processed boundary", () => {
    const event = findNextInboundConversationEvent({
      events: [
        {
          eventKey: "evt_1",
          externalEventId: "evt_1",
          eventType: "MESSAGE",
          actorType: "CONSUMER",
          isReply: true,
          occurredAt: new Date("2026-04-14T08:00:00.000Z"),
          payloadJson: { message: "First" }
        },
        {
          eventKey: "evt_2",
          externalEventId: "evt_2",
          eventType: "MESSAGE",
          actorType: "CONSUMER",
          isReply: true,
          occurredAt: new Date("2026-04-14T09:00:00.000Z"),
          payloadJson: { message: "Second" }
        }
      ],
      conversationAutomationState: {
        id: "state_1",
        isEnabled: true,
        mode: "BOUNDED_AUTO_REPLY",
        automatedTurnCount: 1,
        lastProcessedEventKey: "evt_1",
        lastInboundAt: new Date("2026-04-14T08:00:00.000Z")
      }
    });

    expect(event?.eventKey).toBe("evt_2");
  });

  it("treats Yelp message payloads with unknown actor and is_reply as customer conversation turns", () => {
    const event = findNextInboundConversationEvent(
      {
        events: [
          {
            eventKey: "evt_reply",
            externalEventId: "evt_reply",
            eventType: "MESSAGE",
            actorType: null,
            isReply: true,
            occurredAt: new Date("2026-04-14T08:10:00.000Z"),
            payloadJson: { message: "I uploaded photos and the address is 123 Main St." }
          }
        ],
        conversationAutomationState: null
      },
      null,
      {
        after: new Date("2026-04-14T08:05:00.000Z")
      }
    );

    expect(event?.eventKey).toBe("evt_reply");
  });

  it("does not treat Yelp BIZ thread messages as customer conversation turns", () => {
    const event = findNextInboundConversationEvent(
      {
        events: [
          {
            eventKey: "evt_biz",
            externalEventId: "evt_biz",
            eventType: "TEXT",
            actorType: "BIZ",
            isReply: false,
            occurredAt: new Date("2026-04-14T08:10:00.000Z"),
            payloadJson: {
              event_content: {
                text: "Automated reply from business."
              }
            }
          }
        ],
        conversationAutomationState: null
      },
      null,
      {
        after: new Date("2026-04-14T08:05:00.000Z")
      }
    );

    expect(event).toBeNull();
  });

  it("uses the latest unprocessed customer message when a poll finds several new turns", () => {
    const event = findNextInboundConversationEvent(
      {
        events: [
          {
            eventKey: "evt_old",
            externalEventId: "evt_old",
            eventType: "TEXT",
            actorType: "CONSUMER",
            isReply: false,
            occurredAt: new Date("2026-04-14T08:10:00.000Z"),
            payloadJson: {
              event_content: {
                text: "First question"
              }
            }
          },
          {
            eventKey: "evt_latest",
            externalEventId: "evt_latest",
            eventType: "TEXT",
            actorType: "CONSUMER",
            isReply: false,
            occurredAt: new Date("2026-04-14T08:15:00.000Z"),
            payloadJson: {
              event_content: {
                text: "Latest question"
              }
            }
          }
        ],
        conversationAutomationState: null
      },
      null,
      {
        after: new Date("2026-04-14T08:05:00.000Z")
      }
    );

    expect(event?.eventKey).toBe("evt_latest");
  });

  it("ignores customer events that happened before the latest automated reply", () => {
    const event = findNextInboundConversationEvent(
      {
        events: [
          {
            eventKey: "evt_initial",
            externalEventId: "evt_initial",
            eventType: "MESSAGE",
            actorType: "CONSUMER",
            isReply: false,
            occurredAt: new Date("2026-04-14T08:00:00.000Z"),
            payloadJson: { message: "Initial request" }
          },
          {
            eventKey: "evt_followup",
            externalEventId: "evt_followup",
            eventType: "MESSAGE",
            actorType: "CONSUMER",
            isReply: false,
            occurredAt: new Date("2026-04-14T08:10:00.000Z"),
            payloadJson: { message: "Here is the address." }
          }
        ],
        conversationAutomationState: null
      },
      null,
      {
        after: new Date("2026-04-14T08:05:00.000Z")
      }
    );

    expect(event?.eventKey).toBe("evt_followup");
  });
});

describe("conversation autoresponder routing", () => {
  const lead = {
    externalConversationId: "conv_1",
    internalStatus: "UNMAPPED" as const,
    conversationActions: [],
    conversationAutomationState: null
  };

  it("uses review-only mode for safe messages when configured", () => {
    const classification = classifyInboundConversationEvent({
      payloadJson: {
        message: "Thanks, I uploaded the photo and the address is 123 Main St."
      }
    });

    const result = decideInboundConversationResponse({
      settings: {
        ...baseSettings,
        conversationMode: "REVIEW_ONLY"
      },
      lead,
      classification: classification!,
      hasHumanTakeover: false
    });

    expect(result).toEqual({
      decision: "REVIEW_ONLY",
      stopReason: "MODE_REVIEW_ONLY",
      shouldCreateIssue: false
    });
  });

  it("allows bounded auto-reply only for allowed low-risk intents", () => {
    const classification = classifyInboundConversationEvent({
      payloadJson: {
        message: "Thanks, got it."
      }
    });

    const result = decideInboundConversationResponse({
      settings: baseSettings,
      lead,
      classification: classification!,
      hasHumanTakeover: false
    });

    expect(result).toEqual({
      decision: "AUTO_REPLY",
      stopReason: null,
      shouldCreateIssue: false
    });
  });

  it("hands pricing requests to a human even in bounded auto-reply mode", () => {
    const classification = classifyInboundConversationEvent({
      payloadJson: {
        message: "Can you tell me the price and give me an estimate today?"
      }
    });

    const result = decideInboundConversationResponse({
      settings: baseSettings,
      lead,
      classification: classification!,
      hasHumanTakeover: false
    });

    expect(result).toEqual({
      decision: "HUMAN_HANDOFF",
      stopReason: "PRICING_RISK",
      shouldCreateIssue: true
    });
  });

  it("stops automation when max automated turns have already been used", () => {
    const classification = classifyInboundConversationEvent({
      payloadJson: {
        message: "Thanks."
      }
    });

    const result = decideInboundConversationResponse({
      settings: {
        ...baseSettings,
        conversationMaxAutomatedTurns: 1
      },
      lead: {
        ...lead,
        conversationAutomationState: {
          id: "state_1",
          isEnabled: true,
          mode: "BOUNDED_AUTO_REPLY",
          automatedTurnCount: 1
        }
      },
      classification: classification!,
      hasHumanTakeover: false
    });

    expect(result).toEqual({
      decision: "HUMAN_HANDOFF",
      stopReason: "MAX_AUTOMATED_TURNS_REACHED",
      shouldCreateIssue: true
    });
  });

  it("stops automation after human takeover", () => {
    const classification = classifyInboundConversationEvent({
      payloadJson: {
        message: "Here are a few more details."
      }
    });

    const result = decideInboundConversationResponse({
      settings: baseSettings,
      lead,
      classification: classification!,
      hasHumanTakeover: true
    });

    expect(result).toEqual({
      decision: "HUMAN_HANDOFF",
      stopReason: "HUMAN_TAKEOVER",
      shouldCreateIssue: false
    });
  });

  it("forces human handoff when the rollout kill switch is on", () => {
    const classification = classifyInboundConversationEvent({
      payloadJson: {
        message: "Thanks, here is the address."
      }
    });

    const result = decideInboundConversationResponse({
      settings: {
        ...baseSettings,
        conversationGlobalPauseEnabled: true
      },
      lead,
      classification: classification!,
      hasHumanTakeover: false
    });

    expect(result).toEqual({
      decision: "HUMAN_HANDOFF",
      stopReason: "ROLLOUT_PAUSED",
      shouldCreateIssue: false
    });
  });
});
