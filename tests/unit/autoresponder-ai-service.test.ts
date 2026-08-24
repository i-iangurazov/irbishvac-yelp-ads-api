import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class AnthropicHardLimitError extends Error {
    limitType: "MESSAGE_LIMIT" | "TOKEN_LIMIT" | "DOLLAR_LIMIT";

    constructor(limitType: "MESSAGE_LIMIT" | "TOKEN_LIMIT" | "DOLLAR_LIMIT") {
      super("Claude hard limit reached.");
      this.name = "AnthropicHardLimitError";
      this.limitType = limitType;
    }
  }

  return {
    AnthropicHardLimitError,
    createAnthropicJsonMessage: vi.fn(),
    reserveAnthropicGeneration: vi.fn(),
    settleAnthropicGeneration: vi.fn(),
    claimProviderRequestBudget: vi.fn(),
    createOperatorIssue: vi.fn(),
    getOperatorIssueByDedupeKey: vi.fn(),
    updateOperatorIssue: vi.fn(),
  };
});

vi.mock("@/features/autoresponder/anthropic-client", () => ({
  AnthropicGenerationError: class AnthropicGenerationError extends Error {},
  createAnthropicJsonMessage: mocks.createAnthropicJsonMessage,
  isAnthropicConfigured: () => true,
}));
vi.mock("@/features/autoresponder/anthropic-budget", () => ({
  AnthropicHardLimitError: mocks.AnthropicHardLimitError,
  reserveAnthropicGeneration: mocks.reserveAnthropicGeneration,
  settleAnthropicGeneration: mocks.settleAnthropicGeneration,
}));
vi.mock("@/features/operations/provider-budget-service", () => ({
  claimProviderRequestBudget: mocks.claimProviderRequestBudget,
}));
vi.mock("@/features/leads/ai-reply-service", () => ({
  extractLeadReplyThreadContext: () => [],
  evaluateLeadReplyDraftRisk: () => [],
}));
vi.mock("@/lib/db/issues-repository", () => ({
  createOperatorIssue: mocks.createOperatorIssue,
  getOperatorIssueByDedupeKey: mocks.getOperatorIssueByDedupeKey,
  updateOperatorIssue: mocks.updateOperatorIssue,
}));

import { generateLeadAutomationAiMessageFromGuidance } from "@/features/autoresponder/ai-service";

const limits = {
  monthlyBudgetUsd: 50,
  monthlyMessageLimit: 500,
  monthlyTokenLimit: 1_000_000,
  warningPercent: 80,
  agencyMarkupPercent: 0,
};
const lead = {
  id: "lead_a",
  externalLeadId: "external_a",
  customerName: null,
  internalStatus: "UNMAPPED" as const,
  events: [],
  business: {
    id: "business_a",
    name: "Client HVAC",
    location: { id: "location_a", name: "Main" },
  },
  location: null,
  serviceCategory: null,
  mappedServiceLabel: null,
};

describe("Claude autoresponder generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimProviderRequestBudget.mockResolvedValue({ used: 1, limit: 300 });
    mocks.getOperatorIssueByDedupeKey.mockResolvedValue(null);
  });

  it("stops before Claude and creates a visible review issue at the hard limit", async () => {
    mocks.reserveAnthropicGeneration.mockRejectedValue(
      new mocks.AnthropicHardLimitError("DOLLAR_LIMIT"),
    );

    const result = await generateLeadAutomationAiMessageFromGuidance({
      tenantId: "tenant_a",
      lead: lead as never,
      model: "claude-sonnet-4-6",
      channel: "YELP_THREAD",
      guidance: "Ask for the minimum missing details.",
      fallbackSubject: "Request received",
      fallbackBody: "Thanks. Our team will review your request.",
      variables: {} as never,
      contextLabel: "Initial reply",
      usageLimits: limits,
    });

    expect(result).toMatchObject({
      usedAi: false,
      fallbackReason: "AI_HARD_LIMIT",
      body: "Thanks. Our team will review your request.",
    });
    expect(mocks.createAnthropicJsonMessage).not.toHaveBeenCalled();
    expect(mocks.createOperatorIssue).toHaveBeenCalledWith(
      "tenant_a",
      expect.objectContaining({
        issueType: "AUTORESPONDER_FAILURE",
        severity: "HIGH",
        leadId: "lead_a",
      }),
    );
  });

  it("uses Claude only and isolates untrusted lead content in the prompt policy", async () => {
    mocks.reserveAnthropicGeneration.mockResolvedValue({ reserved: true });
    mocks.createAnthropicJsonMessage.mockResolvedValue({
      json: { subject: null, body: "Thanks. What issue are you seeing?" },
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      latencyMs: 200,
    });

    const result = await generateLeadAutomationAiMessageFromGuidance({
      tenantId: "tenant_a",
      lead: lead as never,
      model: "claude-haiku-4-5",
      channel: "YELP_THREAD",
      guidance: "Ask for the minimum missing details.",
      fallbackSubject: "Request received",
      fallbackBody: "Thanks. Our team will review your request.",
      variables: {} as never,
      contextLabel: "Initial reply",
      usageLimits: limits,
    });

    expect(result.usedAi).toBe(true);
    expect(mocks.createAnthropicJsonMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5",
        system: expect.stringContaining("untrusted quoted data"),
      }),
    );
    expect(mocks.settleAnthropicGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        resultStatus: "SUCCESS",
        model: "claude-haiku-4-5",
      }),
    );
  });
});
