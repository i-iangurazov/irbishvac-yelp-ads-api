import { beforeEach, describe, expect, it, vi } from "vitest";

const getLeadDetail = vi.fn();
const getAiReplyAssistantState = vi.fn();
const recordAuditEvent = vi.fn();
const fetchWithRetry = vi.fn();
const logInfo = vi.fn();
const logError = vi.fn();
const claimProviderRequestBudget = vi.fn();

vi.mock("@/features/leads/service", () => ({
  getLeadDetail
}));

vi.mock("@/features/leads/ai-reply-service", () => ({
  getAiReplyAssistantState,
  extractLeadReplyThreadContext: vi.fn((events: Array<{ actorType: string | null; occurredAt: Date | null; payloadJson: unknown; isReply: boolean }>) =>
    events.map((event) => ({
      actor: event.actorType?.toLowerCase().includes("business") || event.isReply ? "Business" : "Customer",
      occurredAt: event.occurredAt?.toISOString() ?? null,
      text:
        (typeof (event.payloadJson as { message?: unknown }).message === "string"
          ? (event.payloadJson as { message: string }).message
          : typeof (event.payloadJson as { text?: unknown }).text === "string"
            ? (event.payloadJson as { text: string }).text
            : "") || ""
    })).filter((event) => event.text)
  )
}));

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent
}));

vi.mock("@/features/operations/provider-budget-service", () => ({
  claimProviderRequestBudget
}));

vi.mock("@/lib/utils/fetch", () => ({
  fetchWithRetry
}));

vi.mock("@/lib/utils/env", () => ({
  getServerEnv: vi.fn(() => ({
    OPENAI_API_KEY: "test-key",
    OPENAI_REPLY_MODEL: "gpt-5-nano"
  }))
}));

vi.mock("@/lib/utils/logging", () => ({
  logInfo,
  logError
}));

const baseDetail = {
  lead: {
    id: "lead_local_1",
    externalLeadId: "lead_1",
    business: {
      name: "Northwind HVAC"
    },
    customerName: "Jane Doe",
    mappedServiceLabel: "Water heater repair",
    replyState: "UNREAD",
    createdAtYelp: new Date("2026-04-07T10:00:00.000Z"),
    latestInteractionAt: new Date("2026-04-07T10:05:00.000Z"),
    events: [
      {
        actorType: "CUSTOMER",
        occurredAt: new Date("2026-04-07T10:00:00.000Z"),
        payloadJson: {
          message: "Our water heater is leaking."
        },
        isReply: false
      }
    ]
  },
  crm: {
    mapping: {
      state: "MATCHED",
      location: {
        name: "Downtown"
      }
    },
    mappingResolved: true,
    mappingReference: "job_123",
    currentInternalStatus: "CONTACTED",
    health: {
      status: "CURRENT",
      message: "CRM mapping and lifecycle data are current."
    }
  },
  linkedIssues: [],
  automationSummary: {
    status: "SENT",
    message: "Automated reply posted in Yelp thread."
  },
  replyComposer: {
    latestOutboundChannel: "YELP_THREAD"
  }
};

describe("ai lead summary helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getLeadDetail.mockResolvedValue(baseDetail);
    getAiReplyAssistantState.mockResolvedValue({
      envConfigured: true,
      enabled: true,
      reviewRequired: true,
      model: "gpt-5-nano",
      modelLabel: "gpt-5-nano • Cheapest / test",
      guardrails: []
    });
    claimProviderRequestBudget.mockResolvedValue({
      used: 1,
      limit: 300,
      provider: "OPENAI"
    });
  });

  it("builds safe summary context from lead detail without consumer contact fields", async () => {
    const { buildLeadSummaryContext } = await import("@/features/leads/ai-summary-service");
    const context = await buildLeadSummaryContext("tenant_1", "lead_local_1");

    expect(context).toMatchObject({
      leadReference: "lead_1",
      businessId: null,
      businessName: "Northwind HVAC",
      locationName: "Downtown",
      customerName: "Jane Doe",
      serviceType: "Water heater repair",
      mappingState: "MATCHED",
      partnerLifecycleStatus: "CONTACTED",
      latestOutboundChannel: "YELP_THREAD"
    });
    expect(context.threadMessages).toEqual([
      {
        actor: "Customer",
        occurredAt: "2026-04-07T10:00:00.000Z",
        text: "Our water heater is leaking."
      }
    ]);
    expect("maskedEmail" in context).toBe(false);
    expect("customerEmail" in context).toBe(false);
  });

  it("flags risky summary language", async () => {
    const { evaluateLeadSummaryRisk } = await import("@/features/leads/ai-summary-service");

    expect(
      evaluateLeadSummaryRisk({
        customerIntent: "Customer asked for a fast quote.",
        serviceContext: "We can handle any service in any area.",
        threadStatus: "We can arrive within 2 hours.",
        partnerLifecycle: "Guaranteed scheduled visit.",
        issueNote: null,
        missingInfo: [],
        nextSteps: ["Quote $149 and book the job."]
      })
    ).toEqual(
      expect.arrayContaining([
        "POTENTIAL_PRICING_CLAIM",
        "POTENTIAL_AVAILABILITY_CLAIM",
        "POTENTIAL_COMPLIANCE_CLAIM",
        "POTENTIAL_SERVICE_INVENTION"
      ])
    );
  });

  it("falls back to a deterministic safe summary when AI output is risky", async () => {
    fetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          needs_human_review: false,
          warnings: [],
          customer_intent_summary: "Customer needs a quote right away.",
          service_context_summary: "We serve any area and can handle any service.",
          thread_status_summary: "We can arrive within 2 hours.",
          partner_lifecycle_summary: "Guaranteed scheduled visit.",
          issue_note: null,
          missing_info: [],
          next_steps: ["Quote $149 and book the job."]
        })
      })
    });

    const { generateLeadSummaryWorkflow } = await import("@/features/leads/ai-summary-service");
    const result = await generateLeadSummaryWorkflow("tenant_1", "user_1", "lead_local_1", {
      refresh: false
    });

    expect(result.needsHumanReview).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "POTENTIAL_PRICING_CLAIM",
        "POTENTIAL_AVAILABILITY_CLAIM",
        "POTENTIAL_COMPLIANCE_CLAIM",
        "POTENTIAL_SERVICE_INVENTION"
      ])
    );
    expect(result.summary.customerIntent).toBe("Latest customer note: Our water heater is leaking.");
    expect(result.summary.nextSteps).toEqual(
      expect.arrayContaining([
        "Review the Yelp thread and confirm the customer's latest request."
      ])
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "lead.summary.ai.generate",
        status: "SUCCESS"
      })
    );
  });
});
