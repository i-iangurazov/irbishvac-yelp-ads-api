import { beforeEach, describe, expect, it, vi } from "vitest";

const getSystemSetting = vi.fn();
const getLeadAutomationBusinessOverrideByBusinessId = vi.fn();

vi.mock("@/lib/db/settings-repository", () => ({
  getSystemSetting
}));

vi.mock("@/lib/db/autoresponder-repository", () => ({
  getLeadAutomationBusinessOverrideByBusinessId
}));

describe("conversation automation config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps tenant defaults off for businesses outside selected scope", async () => {
    getSystemSetting.mockResolvedValue({
      isEnabled: true,
      scopeMode: "SELECTED_BUSINESSES",
      scopedBusinessIds: ["business_1"],
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
      conversationAllowedIntents: ["BASIC_ACKNOWLEDGMENT"],
      conversationMaxAutomatedTurns: 2,
      conversationReviewFallbackEnabled: true,
      conversationEscalateToIssueQueue: true
    });
    getLeadAutomationBusinessOverrideByBusinessId.mockResolvedValue(null);

    const { getLeadAutomationScopeConfig } = await import("@/features/autoresponder/config");
    const result = await getLeadAutomationScopeConfig("tenant_1", "business_2");

    expect(result.defaultsApplyToBusiness).toBe(false);
    expect(result.effectiveSettings.isEnabled).toBe(false);
    expect(result.effectiveSettings.conversationAutomationEnabled).toBe(false);
  });

  it("lets a business override enable bounded conversation automation even when tenant defaults are off", async () => {
    getSystemSetting.mockResolvedValue({
      isEnabled: false,
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
      conversationAutomationEnabled: false,
      conversationGlobalPauseEnabled: false,
      conversationMode: "REVIEW_ONLY",
      conversationAllowedIntents: ["BASIC_ACKNOWLEDGMENT"],
      conversationMaxAutomatedTurns: 2,
      conversationReviewFallbackEnabled: true,
      conversationEscalateToIssueQueue: true
    });
    getLeadAutomationBusinessOverrideByBusinessId.mockResolvedValue({
      isEnabled: true,
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
      conversationAllowedIntentsJson: ["BASIC_ACKNOWLEDGMENT", "SIMPLE_NEXT_STEP_CLARIFICATION"],
      conversationMaxAutomatedTurns: 3,
      conversationReviewFallbackEnabled: false,
      conversationEscalateToIssueQueue: true
    });

    const { getLeadAutomationScopeConfig } = await import("@/features/autoresponder/config");
    const result = await getLeadAutomationScopeConfig("tenant_1", "business_1");

    expect(result.effectiveSettings.isEnabled).toBe(true);
    expect(result.effectiveSettings.conversationAutomationEnabled).toBe(true);
    expect(result.effectiveSettings.conversationMode).toBe("BOUNDED_AUTO_REPLY");
    expect(result.effectiveSettings.conversationAllowedIntents).toEqual([
      "BASIC_ACKNOWLEDGMENT",
      "SIMPLE_NEXT_STEP_CLARIFICATION"
    ]);
    expect(result.effectiveSettings.conversationMaxAutomatedTurns).toBe(3);
  });

  it("propagates the tenant-wide conversation pause into effective settings", async () => {
    getSystemSetting.mockResolvedValue({
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
      conversationGlobalPauseEnabled: true,
      conversationMode: "BOUNDED_AUTO_REPLY",
      conversationAllowedIntents: ["BASIC_ACKNOWLEDGMENT"],
      conversationMaxAutomatedTurns: 2,
      conversationReviewFallbackEnabled: true,
      conversationEscalateToIssueQueue: true
    });
    getLeadAutomationBusinessOverrideByBusinessId.mockResolvedValue({
      isEnabled: true,
      defaultChannel: "YELP_THREAD",
      emailFallbackEnabled: false,
      followUp24hEnabled: false,
      followUp24hDelayHours: 24,
      followUp7dEnabled: false,
      followUp7dDelayDays: 7,
      aiAssistEnabled: true,
      aiModel: "gpt-5-nano",
      conversationAutomationEnabled: true,
      conversationMode: "BOUNDED_AUTO_REPLY",
      conversationAllowedIntentsJson: ["BASIC_ACKNOWLEDGMENT"],
      conversationMaxAutomatedTurns: 2,
      conversationReviewFallbackEnabled: true,
      conversationEscalateToIssueQueue: true
    });

    const { getLeadAutomationScopeConfig } = await import("@/features/autoresponder/config");
    const result = await getLeadAutomationScopeConfig("tenant_1", "business_1");

    expect(result.effectiveSettings.conversationAutomationEnabled).toBe(true);
    expect(result.effectiveSettings.conversationGlobalPauseEnabled).toBe(true);
  });
});
