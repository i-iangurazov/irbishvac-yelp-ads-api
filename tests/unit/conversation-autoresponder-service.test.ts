import { beforeEach, describe, expect, it, vi } from "vitest";

const getLeadAutomationCandidate = vi.fn();
const listEnabledLeadAutomationTemplates = vi.fn();
const getLeadConversationAutomationTurnBySourceEventKey = vi.fn();
const upsertLeadConversationAutomationState = vi.fn();
const createLeadConversationAutomationTurn = vi.fn();
const getLeadAutomationScopeConfig = vi.fn();
const resolveLeadAiModel = vi.fn();
const deliverLeadAutomationMessage = vi.fn();
const createOperatorIssue = vi.fn();
const getOperatorIssueByDedupeKey = vi.fn();
const updateOperatorIssue = vi.fn();
const recordAuditEvent = vi.fn();
const generateLeadAutomationAiMessageFromGuidance = vi.fn();
const recordConversationDecisionMetric = vi.fn();

vi.mock("@/lib/db/autoresponder-repository", () => ({
  getLeadAutomationCandidate,
  listEnabledLeadAutomationTemplates,
  getLeadConversationAutomationTurnBySourceEventKey,
  upsertLeadConversationAutomationState,
  createLeadConversationAutomationTurn
}));

vi.mock("@/features/autoresponder/config", () => ({
  getLeadAutomationScopeConfig,
  resolveLeadAiModel
}));

vi.mock("@/features/leads/messaging-service", () => ({
  deliverLeadAutomationMessage
}));

vi.mock("@/lib/db/issues-repository", () => ({
  createOperatorIssue,
  getOperatorIssueByDedupeKey,
  updateOperatorIssue
}));

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent
}));

vi.mock("@/features/autoresponder/ai-service", () => ({
  generateLeadAutomationAiMessageFromGuidance
}));

vi.mock("@/features/operations/observability-service", () => ({
  recordConversationDecisionMetric
}));

function buildEffectiveSettings(overrides: Partial<Awaited<ReturnType<typeof getLeadAutomationScopeConfig>>["effectiveSettings"]> = {}) {
  return {
    isEnabled: true,
    scopeMode: "ALL_BUSINESSES" as const,
    scopedBusinessIds: [],
    defaultChannel: "YELP_THREAD" as const,
    emailFallbackEnabled: false,
    followUp24hEnabled: false,
    followUp24hDelayHours: 24,
    followUp7dEnabled: false,
    followUp7dDelayDays: 7,
    aiAssistEnabled: false,
    aiModel: "gpt-5-nano" as const,
    conversationAutomationEnabled: true,
    conversationGlobalPauseEnabled: false,
    conversationMode: "REVIEW_ONLY" as const,
    conversationAllowedIntents: [
      "MISSING_DETAILS_PROVIDED",
      "BASIC_ACKNOWLEDGMENT",
      "SIMPLE_NEXT_STEP_CLARIFICATION"
    ],
    conversationMaxAutomatedTurns: 2,
    conversationReviewFallbackEnabled: true,
    conversationEscalateToIssueQueue: true,
    ...overrides
  };
}

function buildLead(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead_1",
    tenantId: "tenant_1",
    externalLeadId: "ext_lead_1",
    externalConversationId: "conv_1",
    internalStatus: "UNMAPPED",
    business: {
      id: "business_1",
      name: "Northwind HVAC",
      location: null
    },
    location: null,
    serviceCategory: null,
    customerName: "Jane Doe",
    customerEmail: null,
    mappedServiceLabel: null,
    conversationActions: [],
    conversationAutomationState: null,
    automationAttempts: [],
    events: [
      {
        eventKey: "evt_1",
        externalEventId: "ext_evt_1",
        eventType: "MESSAGE",
        actorType: "CONSUMER",
        isReply: true,
        occurredAt: new Date("2026-04-14T08:00:00.000Z"),
        payloadJson: {
          message: "Thanks, I uploaded the photo and the address is 123 Main St."
        }
      }
    ],
    ...overrides
  };
}

describe("conversation autoresponder service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLeadConversationAutomationTurnBySourceEventKey.mockResolvedValue(null);
    listEnabledLeadAutomationTemplates.mockResolvedValue([]);
    getOperatorIssueByDedupeKey.mockResolvedValue(null);
    resolveLeadAiModel.mockImplementation((model: string) => model);
    generateLeadAutomationAiMessageFromGuidance.mockResolvedValue({
      subject: "",
      body: "Fallback body",
      model: "gpt-5-nano",
      usedAi: false,
      fallbackReason: "AI_DISABLED",
      warningCodes: []
    });
    upsertLeadConversationAutomationState.mockResolvedValue({
      id: "state_1"
    });
    createLeadConversationAutomationTurn.mockImplementation(async (payload: Record<string, unknown>) => ({
      id: "turn_1",
      decision: payload.decision,
      stopReason: payload.stopReason ?? null
    }));
    recordAuditEvent.mockResolvedValue(undefined);
  });

  it("stores a review-only suggested reply without auto-sending", async () => {
    getLeadAutomationCandidate.mockResolvedValue(buildLead());
    getLeadAutomationScopeConfig.mockResolvedValue({
      effectiveSettings: buildEffectiveSettings({
        conversationMode: "REVIEW_ONLY"
      })
    });

    const { processLeadConversationAutomationForInboundMessage } = await import(
      "@/features/autoresponder/conversation-service"
    );

    const result = await processLeadConversationAutomationForInboundMessage({
      tenantId: "tenant_1",
      leadId: "lead_1",
      sourceEventId: "ext_evt_1"
    });

    expect(result).toEqual({
      processed: true,
      decision: "REVIEW_ONLY",
      stopReason: "MODE_REVIEW_ONLY"
    });
    expect(recordConversationDecisionMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_1",
        decision: "REVIEW_ONLY",
        stopReason: "MODE_REVIEW_ONLY"
      })
    );
    expect(deliverLeadAutomationMessage).not.toHaveBeenCalled();
    expect(createOperatorIssue).not.toHaveBeenCalled();
    expect(createLeadConversationAutomationTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "REVIEW_ONLY",
        renderedBody: expect.any(String)
      })
    );
    expect(createLeadConversationAutomationTurn.mock.calls[0][0].metadataJson).toEqual(
      expect.objectContaining({
        inboundMessageExcerpt: "Thanks, I uploaded the photo and the address is 123 Main St.",
        sourceContext: expect.objectContaining({
          customerMessageExcerpt: "Thanks, I uploaded the photo and the address is 123 Main St.",
          sourceEventKey: "evt_1"
        }),
        template: expect.objectContaining({
          name: expect.any(String),
          promptSource: "TEMPLATE_AI_PROMPT",
          aiPromptConfigured: true,
          aiPromptPreview: expect.any(String)
        }),
        routing: expect.objectContaining({
          ruleId: null,
          ruleName: null,
          ruleSource: expect.stringContaining("Conversation routing uses inbound intent classification")
        }),
        rendering: expect.objectContaining({
          contentSource: "TEMPLATE",
          templateRenderMode: "AI_ASSISTED"
        }),
        reviewState: expect.objectContaining({
          operatorReviewRequired: true,
          operatorEditStatus: "WAITING_FOR_OPERATOR"
        })
      })
    );
  });

  it("creates an operator issue when a pricing request requires human handoff", async () => {
    getLeadAutomationCandidate.mockResolvedValue(
      buildLead({
        events: [
          {
            eventKey: "evt_2",
            externalEventId: "ext_evt_2",
            eventType: "MESSAGE",
            actorType: "CONSUMER",
            isReply: true,
            occurredAt: new Date("2026-04-14T09:00:00.000Z"),
            payloadJson: {
              message: "How much will this cost and can someone give me a quote today?"
            }
          }
        ]
      })
    );
    getLeadAutomationScopeConfig.mockResolvedValue({
      effectiveSettings: buildEffectiveSettings({
        conversationMode: "BOUNDED_AUTO_REPLY"
      })
    });

    const { processLeadConversationAutomationForInboundMessage } = await import(
      "@/features/autoresponder/conversation-service"
    );

    const result = await processLeadConversationAutomationForInboundMessage({
      tenantId: "tenant_1",
      leadId: "lead_1",
      sourceEventId: "ext_evt_2"
    });

    expect(result).toEqual({
      processed: true,
      decision: "HUMAN_HANDOFF",
      stopReason: "PRICING_RISK"
    });
    expect(deliverLeadAutomationMessage).not.toHaveBeenCalled();
    expect(createOperatorIssue).toHaveBeenCalledWith(
      "tenant_1",
      expect.objectContaining({
        issueType: "AUTORESPONDER_FAILURE",
        severity: "HIGH",
        leadId: "lead_1"
      })
    );
  });

  it("sends a bounded auto-reply for safe acknowledgement intents", async () => {
    getLeadAutomationCandidate.mockResolvedValue(
      buildLead({
        events: [
          {
            eventKey: "evt_3",
            externalEventId: "ext_evt_3",
            eventType: "MESSAGE",
            actorType: "CONSUMER",
            isReply: true,
            occurredAt: new Date("2026-04-14T10:00:00.000Z"),
            payloadJson: {
              message: "Thanks, got it."
            }
          }
        ]
      })
    );
    getLeadAutomationScopeConfig.mockResolvedValue({
      effectiveSettings: buildEffectiveSettings({
        conversationMode: "BOUNDED_AUTO_REPLY"
      })
    });
    deliverLeadAutomationMessage.mockResolvedValue({
      status: "SENT",
      deliveryChannel: "YELP_THREAD",
      warning: null,
      error: null
    });

    const { processLeadConversationAutomationForInboundMessage } = await import(
      "@/features/autoresponder/conversation-service"
    );

    const result = await processLeadConversationAutomationForInboundMessage({
      tenantId: "tenant_1",
      leadId: "lead_1",
      sourceEventId: "ext_evt_3"
    });

    expect(result).toEqual({
      processed: true,
      decision: "AUTO_REPLY",
      stopReason: null
    });
    expect(deliverLeadAutomationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_1",
        leadId: "lead_1",
        automationAttemptId: null,
        channel: "YELP_THREAD"
      })
    );
    expect(createLeadConversationAutomationTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "AUTO_REPLY"
      })
    );
  });

  it("records a paused rollout as human handoff without raising an issue", async () => {
    getLeadAutomationCandidate.mockResolvedValue(buildLead());
    getLeadAutomationScopeConfig.mockResolvedValue({
      effectiveSettings: buildEffectiveSettings({
        conversationGlobalPauseEnabled: true
      })
    });

    const { processLeadConversationAutomationForInboundMessage } = await import(
      "@/features/autoresponder/conversation-service"
    );

    const result = await processLeadConversationAutomationForInboundMessage({
      tenantId: "tenant_1",
      leadId: "lead_1",
      sourceEventId: "ext_evt_1"
    });

    expect(result).toEqual({
      processed: true,
      decision: "HUMAN_HANDOFF",
      stopReason: "ROLLOUT_PAUSED"
    });
    expect(createOperatorIssue).not.toHaveBeenCalled();
    expect(createLeadConversationAutomationTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "HUMAN_HANDOFF",
        stopReason: "ROLLOUT_PAUSED"
      })
    );
  });
});
