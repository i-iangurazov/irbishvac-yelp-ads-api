import { describe, expect, it } from "vitest";

import {
  buildConversationAnalytics,
  buildConversationReviewQueue
} from "@/features/autoresponder/conversation-operations";

describe("conversation rollout analytics", () => {
  it("computes bounded pilot metrics from persisted turns", () => {
    const metrics = buildConversationAnalytics({
      windowDays: 30,
      operatorTakeoverCount: 3,
      turns: [
        {
          leadId: "lead_1",
          decision: "AUTO_REPLY",
          stopReason: null,
          createdAt: new Date("2026-04-14T08:00:00.000Z")
        },
        {
          leadId: "lead_1",
          decision: "REVIEW_ONLY",
          stopReason: "MODE_REVIEW_ONLY",
          createdAt: new Date("2026-04-14T08:10:00.000Z")
        },
        {
          leadId: "lead_2",
          decision: "HUMAN_HANDOFF",
          stopReason: "LOW_CONFIDENCE",
          createdAt: new Date("2026-04-14T09:00:00.000Z")
        },
        {
          leadId: "lead_3",
          decision: "HUMAN_HANDOFF",
          stopReason: "MAX_AUTOMATED_TURNS_REACHED",
          createdAt: new Date("2026-04-14T10:00:00.000Z")
        }
      ]
    });

    expect(metrics).toMatchObject({
      automatedReplyCount: 1,
      reviewOnlyCount: 1,
      humanHandoffCount: 2,
      blockedCount: 2,
      lowConfidenceCount: 1,
      maxTurnLimitCount: 1,
      operatorTakeoverCount: 3,
      autoReplyLeadCount: 1,
      replyAfterAutomationLeadCount: 1,
      replyAfterAutomationRate: 100
    });
  });
});

describe("conversation review queue", () => {
  it("keeps unresolved review and handoff turns visible until an operator acts", () => {
    const queue = buildConversationReviewQueue({
      turns: [
        {
          id: "turn_1",
          leadId: "lead_1",
          createdAt: new Date("2026-04-14T09:00:00.000Z"),
          mode: "REVIEW_ONLY",
          intent: "SIMPLE_NEXT_STEP_CLARIFICATION",
          decision: "REVIEW_ONLY",
          confidence: "MEDIUM",
          stopReason: "MODE_REVIEW_ONLY",
          renderedBody: "Draft reply",
          errorSummary: null,
          lead: {
            id: "lead_1",
            externalLeadId: "ext_1",
            customerName: "Jane Doe",
            business: {
              id: "business_1",
              name: "Northwind HVAC"
            },
            conversationActions: []
          }
        },
        {
          id: "turn_2",
          leadId: "lead_2",
          createdAt: new Date("2026-04-14T10:00:00.000Z"),
          mode: "BOUNDED_AUTO_REPLY",
          intent: "QUOTE_PRICING_REQUEST",
          decision: "HUMAN_HANDOFF",
          confidence: "HIGH",
          stopReason: "PRICING_RISK",
          renderedBody: null,
          errorSummary: null,
          lead: {
            id: "lead_2",
            externalLeadId: "ext_2",
            customerName: "Sam Client",
            business: {
              id: "business_2",
              name: "Skyline Electric"
            },
            conversationActions: [
              {
                id: "action_1",
                actionType: "SEND_MESSAGE",
                createdAt: new Date("2026-04-14T10:30:00.000Z"),
                completedAt: new Date("2026-04-14T10:31:00.000Z")
              }
            ]
          }
        }
      ],
      openIssuesByLeadId: new Map([
        [
          "lead_1",
          {
            id: "issue_1",
            summary: "Review draft before sending",
            severity: "MEDIUM",
            lastDetectedAt: new Date("2026-04-14T09:05:00.000Z")
          }
        ]
      ])
    });

    expect(queue.openCount).toBe(1);
    expect(queue.resolvedCount).toBe(1);
    expect(queue.items).toEqual([
      expect.objectContaining({
        id: "turn_1",
        leadId: "lead_1",
        businessName: "Northwind HVAC",
        linkedIssue: expect.objectContaining({
          id: "issue_1"
        })
      })
    ]);
  });
});
