import { beforeEach, describe, expect, it, vi } from "vitest";

const incrementOperationalMetricCounter = vi.fn();
const recordOperationalMetricDistribution = vi.fn();
const setOperationalMetricGauge = vi.fn();
const listOperationalMetricRollups = vi.fn();
const getOperatorIssueSummaryCounts = vi.fn();
const listOperatorIssues = vi.fn();
const getSystemSetting = vi.fn();
const listLeadAutomationBusinessOverrides = vi.fn();
const listLeadAutomationOptions = vi.fn();
const listLeadAutomationRules = vi.fn();
const listLeadAutomationTemplates = vi.fn();
const getLeadAutomationBusinessAttemptHealth = vi.fn();

vi.mock("@/lib/db/metrics-repository", () => ({
  incrementOperationalMetricCounter,
  recordOperationalMetricDistribution,
  setOperationalMetricGauge,
  listOperationalMetricRollups
}));

vi.mock("@/lib/db/issues-repository", () => ({
  getOperatorIssueSummaryCounts,
  listOperatorIssues
}));

vi.mock("@/lib/db/settings-repository", () => ({
  getSystemSetting
}));

vi.mock("@/lib/db/autoresponder-repository", () => ({
  listLeadAutomationBusinessOverrides,
  listLeadAutomationOptions,
  listLeadAutomationRules,
  listLeadAutomationTemplates,
  getLeadAutomationBusinessAttemptHealth
}));

describe("observability service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOperationalMetricRollups.mockResolvedValue([]);
    getOperatorIssueSummaryCounts.mockResolvedValue({
      total: 3,
      open: 2,
      highSeverity: 1,
      retryableOpen: 1,
      deliveryFailures: 0,
      unmappedLeads: 0,
      staleLeads: 0
    });
    listOperatorIssues.mockResolvedValue([]);
    getSystemSetting.mockResolvedValue({
      isEnabled: true,
      scopeMode: "SELECTED_BUSINESSES",
      scopedBusinessIds: ["business_1"],
      aiModel: "gpt-5-nano",
      conversationAutomationEnabled: true,
      conversationGlobalPauseEnabled: false,
      conversationMode: "REVIEW_ONLY"
    });
    listLeadAutomationBusinessOverrides.mockResolvedValue([]);
    listLeadAutomationOptions.mockResolvedValue({
      businesses: [
        {
          id: "business_1",
          name: "Northwind HVAC"
        }
      ]
    });
    listLeadAutomationRules.mockResolvedValue([
      {
        id: "rule_1",
        isEnabled: true,
        cadence: "INITIAL",
        businessId: null,
        templateId: "template_1"
      }
    ]);
    listLeadAutomationTemplates.mockResolvedValue([
      {
        id: "template_1",
        isEnabled: true
      }
    ]);
    getLeadAutomationBusinessAttemptHealth.mockResolvedValue({
      sentCounts: [
        {
          businessId: "business_1",
          _count: {
            _all: 2
          }
        }
      ]
    });
  });

  it("records conversation decision metrics with bounded dimensions", async () => {
    const { recordConversationDecisionMetric, operationalMetricKeys } = await import(
      "@/features/operations/observability-service"
    );

    await recordConversationDecisionMetric({
      tenantId: "tenant_1",
      decision: "HUMAN_HANDOFF",
      stopReason: "LOW_CONFIDENCE",
      mode: "REVIEW_ONLY",
      confidence: "LOW"
    });

    expect(incrementOperationalMetricCounter).toHaveBeenNthCalledWith(1, {
      tenantId: "tenant_1",
      metricKey: operationalMetricKeys.conversationDecision,
      dimensions: {
        decision: "HUMAN_HANDOFF",
        mode: "REVIEW_ONLY",
        confidence: "LOW"
      }
    });
    expect(incrementOperationalMetricCounter).toHaveBeenNthCalledWith(2, {
      tenantId: "tenant_1",
      metricKey: operationalMetricKeys.conversationStopReason,
      dimensions: {
        stopReason: "LOW_CONFIDENCE",
        mode: "REVIEW_ONLY"
      }
    });
  });

  it("summarizes pilot monitoring metrics and rollout posture", async () => {
    const now = new Date();
    const { getOperationalPilotOverview, operationalMetricKeys } = await import(
      "@/features/operations/observability-service"
    );

    listOperationalMetricRollups.mockResolvedValue([
      {
        metricKey: operationalMetricKeys.webhookIntakeAccepted,
        bucketStart: now,
        totalValue: 12,
        sampleCount: 12,
        lastValue: 12,
        dimensionsJson: null
      },
      {
        metricKey: operationalMetricKeys.webhookReconcileQueueLagMs,
        bucketStart: now,
        totalValue: 600000,
        sampleCount: 5,
        lastValue: 120000,
        dimensionsJson: null
      },
      {
        metricKey: operationalMetricKeys.autoresponderInitialSent,
        bucketStart: now,
        totalValue: 3,
        sampleCount: 3,
        lastValue: 3,
        dimensionsJson: null
      },
      {
        metricKey: operationalMetricKeys.autoresponderFollowUpFailed,
        bucketStart: now,
        totalValue: 1,
        sampleCount: 1,
        lastValue: 1,
        dimensionsJson: null
      },
      {
        metricKey: operationalMetricKeys.conversationDecision,
        bucketStart: now,
        totalValue: 2,
        sampleCount: 2,
        lastValue: 2,
        dimensionsJson: {
          decision: "HUMAN_HANDOFF"
        }
      },
      {
        metricKey: operationalMetricKeys.conversationDecision,
        bucketStart: now,
        totalValue: 4,
        sampleCount: 4,
        lastValue: 4,
        dimensionsJson: {
          decision: "AUTO_REPLY"
        }
      },
      {
        metricKey: operationalMetricKeys.conversationStopReason,
        bucketStart: now,
        totalValue: 2,
        sampleCount: 2,
        lastValue: 2,
        dimensionsJson: {
          stopReason: "LOW_CONFIDENCE"
        }
      },
      {
        metricKey: operationalMetricKeys.issueCreated,
        bucketStart: now,
        totalValue: 5,
        sampleCount: 5,
        lastValue: 5,
        dimensionsJson: null
      },
      {
        metricKey: operationalMetricKeys.reportDeliverySucceeded,
        bucketStart: now,
        totalValue: 8,
        sampleCount: 8,
        lastValue: 8,
        dimensionsJson: null
      },
      {
        metricKey: operationalMetricKeys.reportDeliveryFailed,
        bucketStart: now,
        totalValue: 2,
        sampleCount: 2,
        lastValue: 2,
        dimensionsJson: null
      }
    ]);

    const overview = await getOperationalPilotOverview("tenant_1");

    expect(overview.windows.last24h.webhookAccepted).toBe(12);
    expect(overview.windows.last24h.webhookAvgLagMs).toBe(120000);
    expect(overview.windows.last24h.automationSent).toBe(3);
    expect(overview.windows.last24h.automationFailed).toBe(1);
    expect(overview.windows.last7d.conversationHandoffs).toBe(2);
    expect(overview.windows.last7d.reportDeliverySuccessRate).toBe(80);
    expect(overview.queue.openIssues).toBe(2);
    expect(overview.rolloutPosture[0]).toMatchObject({
      businessId: "business_1",
      rolloutLabel: "Review pilot",
      proofOfSend: true,
      conversationModeLabel: "Review-only"
    });
  });
});
