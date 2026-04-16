import "server-only";

import type { LeadAutomationCadence, LeadConversationAutomationMode, LeadConversationConfidence, LeadConversationDecision, LeadConversationStopReason, SyncRunStatus } from "@prisma/client";

import { LEAD_AUTORESPONDER_SETTING_KEY } from "@/features/autoresponder/constants";
import { readLeadAutoresponderSettings } from "@/features/autoresponder/config";
import {
  getLeadAiModelLabel
} from "@/features/autoresponder/config";
import {
  getLeadConversationRolloutState,
  humanizeLeadConversationMode,
  humanizeLeadConversationStopReason
} from "@/features/autoresponder/conversation";
import {
  getLeadAutomationBusinessAttemptHealth,
  listLeadAutomationBusinessOverrides,
  listLeadAutomationOptions,
  listLeadAutomationRules,
  listLeadAutomationTemplates
} from "@/lib/db/autoresponder-repository";
import { getOperatorIssueSummaryCounts, listOperatorIssues } from "@/lib/db/issues-repository";
import {
  incrementOperationalMetricCounter,
  listOperationalMetricRollups,
  recordOperationalMetricDistribution,
  setOperationalMetricGauge
} from "@/lib/db/metrics-repository";
import { getSystemSetting } from "@/lib/db/settings-repository";

export const operationalMetricKeys = {
  webhookIntakeAccepted: "webhook.intake.accepted",
  webhookIntakeDuplicate: "webhook.intake.duplicate",
  webhookIntakeLagMs: "webhook.intake.lag_ms",
  webhookReconcileSucceeded: "webhook.reconcile.succeeded",
  webhookReconcileFailed: "webhook.reconcile.failed",
  webhookReconcileProcessingMs: "webhook.reconcile.processing_ms",
  webhookReconcileQueueLagMs: "webhook.reconcile.queue_lag_ms",
  autoresponderInitialSent: "autoresponder.initial.sent",
  autoresponderInitialFailed: "autoresponder.initial.failed",
  autoresponderInitialSkipped: "autoresponder.initial.skipped",
  autoresponderFollowUpSent: "autoresponder.followup.sent",
  autoresponderFollowUpFailed: "autoresponder.followup.failed",
  autoresponderFollowUpSkipped: "autoresponder.followup.skipped",
  autoresponderFollowUpRequeued: "autoresponder.followup.requeued",
  conversationDecision: "conversation.decision",
  conversationStopReason: "conversation.stop_reason",
  issueCreated: "issue.created",
  issueReopened: "issue.reopened",
  issueAutoResolved: "issue.auto_resolved",
  issueOpenGauge: "issue.open",
  reportGenerationSucceeded: "report.generation.succeeded",
  reportGenerationFailed: "report.generation.failed",
  reportDeliverySucceeded: "report.delivery.succeeded",
  reportDeliveryFailed: "report.delivery.failed",
  serviceTitanLifecycleSucceeded: "servicetitan.lifecycle.succeeded",
  serviceTitanLifecycleFailed: "servicetitan.lifecycle.failed",
  serviceTitanReferenceSucceeded: "servicetitan.reference.succeeded",
  serviceTitanReferenceFailed: "servicetitan.reference.failed"
} as const;

type MetricDimensions = Record<string, string | number | boolean | null | undefined>;
type MetricRow = Awaited<ReturnType<typeof listOperationalMetricRollups>>[number];

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function matchesDimensions(row: MetricRow, expected?: MetricDimensions) {
  if (!expected) {
    return true;
  }

  const dimensions = asRecord(row.dimensionsJson);

  return Object.entries(expected).every(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      return true;
    }

    return String(dimensions?.[key] ?? "") === String(value);
  });
}

function filterRows(rows: MetricRow[], metricKey: string, since: Date, dimensions?: MetricDimensions) {
  return rows.filter(
    (row) => row.metricKey === metricKey && row.bucketStart >= since && matchesDimensions(row, dimensions)
  );
}

function sumMetric(rows: MetricRow[], metricKey: string, since: Date, dimensions?: MetricDimensions) {
  return filterRows(rows, metricKey, since, dimensions).reduce((total, row) => total + row.totalValue, 0);
}

function averageMetric(rows: MetricRow[], metricKey: string, since: Date, dimensions?: MetricDimensions) {
  const relevant = filterRows(rows, metricKey, since, dimensions);
  const totalValue = relevant.reduce((total, row) => total + row.totalValue, 0);
  const sampleCount = relevant.reduce((total, row) => total + row.sampleCount, 0);

  return sampleCount > 0 ? Math.round(totalValue / sampleCount) : 0;
}

function latestGauge(rows: MetricRow[], metricKey: string, since: Date, dimensions?: MetricDimensions) {
  const relevant = filterRows(rows, metricKey, since, dimensions).sort(
    (left, right) => right.bucketStart.getTime() - left.bucketStart.getTime()
  );
  const latest = relevant[0] ?? null;
  return latest?.lastValue ?? latest?.totalValue ?? 0;
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 100);
}

function getDefaultsCoverage(settings: ReturnType<typeof readLeadAutoresponderSettings>, businessId: string) {
  return settings.scopeMode === "ALL_BUSINESSES" || settings.scopedBusinessIds.includes(businessId);
}

function getConversationModeLabel(mode: LeadConversationAutomationMode) {
  return humanizeLeadConversationMode(mode);
}

function getPilotLabel(params: {
  isEnabled: boolean;
  paused: boolean;
  conversationEnabled: boolean;
  conversationMode: LeadConversationAutomationMode;
  hasInitialRule: boolean;
  proofOfSend: boolean;
  openIssueCount: number;
}) {
  if (!params.isEnabled) {
    return "Off";
  }

  if (params.paused) {
    return "Paused";
  }

  if (!params.hasInitialRule) {
    return "Needs setup";
  }

  if (params.openIssueCount > 0) {
    return "Needs attention";
  }

  if (params.conversationEnabled) {
    return params.conversationMode === "BOUNDED_AUTO_REPLY" ? "Limited auto-reply" : "Review pilot";
  }

  return params.proofOfSend ? "Initial reply live" : "Initial reply ready";
}

export async function recordWebhookIntakeMetric(params: {
  tenantId: string;
  deliveryStatus: SyncRunStatus | "DUPLICATE";
  occurredAt?: Date | null;
  receivedAt?: Date | null;
}) {
  if (params.deliveryStatus === "DUPLICATE") {
    await incrementOperationalMetricCounter({
      tenantId: params.tenantId,
      metricKey: operationalMetricKeys.webhookIntakeDuplicate
    });
    return;
  }

  await incrementOperationalMetricCounter({
    tenantId: params.tenantId,
    metricKey: operationalMetricKeys.webhookIntakeAccepted,
    dimensions: {
      status: params.deliveryStatus
    }
  });

  if (params.occurredAt && params.receivedAt) {
    await recordOperationalMetricDistribution({
      tenantId: params.tenantId,
      metricKey: operationalMetricKeys.webhookIntakeLagMs,
      value: Math.max(0, params.receivedAt.getTime() - params.occurredAt.getTime())
    });
  }
}

export async function recordWebhookReconcileMetric(params: {
  tenantId: string;
  status: "SUCCEEDED" | "FAILED";
  processingMs: number;
  receivedAt?: Date | null;
  completedAt?: Date | null;
}) {
  await incrementOperationalMetricCounter({
    tenantId: params.tenantId,
    metricKey:
      params.status === "SUCCEEDED"
        ? operationalMetricKeys.webhookReconcileSucceeded
        : operationalMetricKeys.webhookReconcileFailed
  });
  await recordOperationalMetricDistribution({
    tenantId: params.tenantId,
    metricKey: operationalMetricKeys.webhookReconcileProcessingMs,
    value: params.processingMs
  });

  if (params.receivedAt && params.completedAt) {
    await recordOperationalMetricDistribution({
      tenantId: params.tenantId,
      metricKey: operationalMetricKeys.webhookReconcileQueueLagMs,
      value: Math.max(0, params.completedAt.getTime() - params.receivedAt.getTime())
    });
  }
}

export async function recordAutoresponderMetric(params: {
  tenantId: string;
  cadence: LeadAutomationCadence;
  outcome: "SENT" | "FAILED" | "SKIPPED" | "REQUEUED";
  skipReason?: string | null;
}) {
  const metricKey =
    params.cadence === "INITIAL"
      ? params.outcome === "SENT"
        ? operationalMetricKeys.autoresponderInitialSent
        : params.outcome === "FAILED"
          ? operationalMetricKeys.autoresponderInitialFailed
          : operationalMetricKeys.autoresponderInitialSkipped
      : params.outcome === "SENT"
        ? operationalMetricKeys.autoresponderFollowUpSent
        : params.outcome === "FAILED"
          ? operationalMetricKeys.autoresponderFollowUpFailed
          : params.outcome === "REQUEUED"
            ? operationalMetricKeys.autoresponderFollowUpRequeued
            : operationalMetricKeys.autoresponderFollowUpSkipped;

  await incrementOperationalMetricCounter({
    tenantId: params.tenantId,
    metricKey,
    dimensions: {
      cadence: params.cadence,
      ...(params.skipReason ? { skipReason: params.skipReason } : {})
    }
  });
}

export async function recordConversationDecisionMetric(params: {
  tenantId: string;
  decision: LeadConversationDecision;
  stopReason?: LeadConversationStopReason | null;
  mode: LeadConversationAutomationMode;
  confidence: LeadConversationConfidence;
}) {
  await incrementOperationalMetricCounter({
    tenantId: params.tenantId,
    metricKey: operationalMetricKeys.conversationDecision,
    dimensions: {
      decision: params.decision,
      mode: params.mode,
      confidence: params.confidence
    }
  });

  if (params.stopReason) {
    await incrementOperationalMetricCounter({
      tenantId: params.tenantId,
      metricKey: operationalMetricKeys.conversationStopReason,
      dimensions: {
        stopReason: params.stopReason,
        mode: params.mode
      }
    });
  }
}

export async function recordOperatorIssueRefreshMetrics(params: {
  tenantId: string;
  createdCount: number;
  reopenedCount: number;
  autoResolvedCount: number;
  openCount: number;
}) {
  if (params.createdCount > 0) {
    await incrementOperationalMetricCounter({
      tenantId: params.tenantId,
      metricKey: operationalMetricKeys.issueCreated,
      amount: params.createdCount
    });
  }

  if (params.reopenedCount > 0) {
    await incrementOperationalMetricCounter({
      tenantId: params.tenantId,
      metricKey: operationalMetricKeys.issueReopened,
      amount: params.reopenedCount
    });
  }

  if (params.autoResolvedCount > 0) {
    await incrementOperationalMetricCounter({
      tenantId: params.tenantId,
      metricKey: operationalMetricKeys.issueAutoResolved,
      amount: params.autoResolvedCount
    });
  }

  await setOperationalMetricGauge({
    tenantId: params.tenantId,
    metricKey: operationalMetricKeys.issueOpenGauge,
    value: params.openCount
  });
}

export async function recordReportMetric(params: {
  tenantId: string;
  stage: "GENERATION" | "DELIVERY";
  status: "SUCCEEDED" | "FAILED";
}) {
  await incrementOperationalMetricCounter({
    tenantId: params.tenantId,
    metricKey:
      params.stage === "GENERATION"
        ? params.status === "SUCCEEDED"
          ? operationalMetricKeys.reportGenerationSucceeded
          : operationalMetricKeys.reportGenerationFailed
        : params.status === "SUCCEEDED"
          ? operationalMetricKeys.reportDeliverySucceeded
          : operationalMetricKeys.reportDeliveryFailed
  });
}

export async function recordServiceTitanMetric(params: {
  tenantId: string;
  scope: "LIFECYCLE" | "REFERENCE";
  status: "SUCCEEDED" | "FAILED";
}) {
  await incrementOperationalMetricCounter({
    tenantId: params.tenantId,
    metricKey:
      params.scope === "LIFECYCLE"
        ? params.status === "SUCCEEDED"
          ? operationalMetricKeys.serviceTitanLifecycleSucceeded
          : operationalMetricKeys.serviceTitanLifecycleFailed
        : params.status === "SUCCEEDED"
          ? operationalMetricKeys.serviceTitanReferenceSucceeded
          : operationalMetricKeys.serviceTitanReferenceFailed
  });
}

export async function getOperationalPilotOverview(tenantId: string) {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [rows, issueSummary, settingsValue, overrides, options, rules, templates, attemptHealth, openAutoresponderIssues] =
    await Promise.all([
      listOperationalMetricRollups({
        tenantId,
        since: since7d
      }),
      getOperatorIssueSummaryCounts(tenantId),
      getSystemSetting(tenantId, LEAD_AUTORESPONDER_SETTING_KEY),
      listLeadAutomationBusinessOverrides(tenantId),
      listLeadAutomationOptions(tenantId),
      listLeadAutomationRules(tenantId),
      listLeadAutomationTemplates(tenantId),
      getLeadAutomationBusinessAttemptHealth(tenantId),
      listOperatorIssues(tenantId, {
        issueType: "AUTORESPONDER_FAILURE",
        status: "OPEN"
      })
    ]);
  const settings = readLeadAutoresponderSettings(settingsValue);
  const overrideByBusinessId = new Map(overrides.map((override) => [override.businessId, override]));
  const enabledTemplateIds = new Set(templates.filter((template) => template.isEnabled).map((template) => template.id));
  const enabledInitialRules = rules.filter(
    (rule) => rule.isEnabled && rule.cadence === "INITIAL" && enabledTemplateIds.has(rule.templateId)
  );
  const sentCountByBusiness = new Map(
    attemptHealth.sentCounts
      .filter((entry) => entry.businessId)
      .map((entry) => [entry.businessId as string, entry._count._all])
  );
  const openIssueCountByBusiness = new Map<string, number>();

  for (const issue of openAutoresponderIssues) {
    const businessId = issue.business?.id;

    if (!businessId) {
      continue;
    }

    openIssueCountByBusiness.set(businessId, (openIssueCountByBusiness.get(businessId) ?? 0) + 1);
  }

  const rolloutPosture = options.businesses
    .map((business) => {
      const override = overrideByBusinessId.get(business.id) ?? null;
      const defaultsApply = getDefaultsCoverage(settings, business.id);
      const effectiveEnabled = override ? override.isEnabled : settings.isEnabled && defaultsApply;
      const conversationEnabled = override
        ? override.isEnabled && override.conversationAutomationEnabled
        : settings.conversationAutomationEnabled && settings.isEnabled && defaultsApply;
      const conversationMode = (override?.conversationMode ?? settings.conversationMode) as LeadConversationAutomationMode;
      const openIssueCount = openIssueCountByBusiness.get(business.id) ?? 0;
      const proofOfSend = (sentCountByBusiness.get(business.id) ?? 0) > 0;
      const hasInitialRule = enabledInitialRules.some(
        (rule) => !rule.businessId || rule.businessId === business.id
      );
      const rollout = getLeadConversationRolloutState({
        enabled: conversationEnabled,
        paused: settings.conversationGlobalPauseEnabled,
        mode: conversationMode
      });

      return {
        businessId: business.id,
        businessName: business.name,
        proofOfSend,
        openIssueCount,
        automationEnabled: effectiveEnabled,
        conversationEnabled,
        conversationMode,
        conversationModeLabel: getConversationModeLabel(conversationMode),
        aiModelLabel: getLeadAiModelLabel(override?.aiModel ?? settings.aiModel),
        rolloutLabel: getPilotLabel({
          isEnabled: effectiveEnabled,
          paused: settings.conversationGlobalPauseEnabled,
          conversationEnabled,
          conversationMode,
          hasInitialRule,
          proofOfSend,
          openIssueCount
        }),
        rolloutStateLabel: rollout.label,
        hasInitialRule,
        scopeSource: override ? "BUSINESS_OVERRIDE" : defaultsApply ? "TENANT_DEFAULT" : "NOT_COVERED"
      };
    })
    .sort((left, right) => {
      if (right.openIssueCount !== left.openIssueCount) {
        return right.openIssueCount - left.openIssueCount;
      }

      if (left.rolloutLabel !== right.rolloutLabel) {
        return left.rolloutLabel.localeCompare(right.rolloutLabel);
      }

      return left.businessName.localeCompare(right.businessName);
    })
    .slice(0, 8);

  const automationSent24h =
    sumMetric(rows, operationalMetricKeys.autoresponderInitialSent, since24h) +
    sumMetric(rows, operationalMetricKeys.autoresponderFollowUpSent, since24h);
  const automationFailed24h =
    sumMetric(rows, operationalMetricKeys.autoresponderInitialFailed, since24h) +
    sumMetric(rows, operationalMetricKeys.autoresponderFollowUpFailed, since24h);
  const conversationDecisions7d = sumMetric(rows, operationalMetricKeys.conversationDecision, since7d);
  const conversationHandoffs7d = sumMetric(rows, operationalMetricKeys.conversationDecision, since7d, {
    decision: "HUMAN_HANDOFF"
  });
  const conversationBlocked7d = sumMetric(rows, operationalMetricKeys.conversationStopReason, since7d);
  const reportDeliveryFailures7d = sumMetric(rows, operationalMetricKeys.reportDeliveryFailed, since7d);
  const reportDeliverySuccesses7d = sumMetric(rows, operationalMetricKeys.reportDeliverySucceeded, since7d);
  const serviceTitanFailures24h =
    sumMetric(rows, operationalMetricKeys.serviceTitanLifecycleFailed, since24h) +
    sumMetric(rows, operationalMetricKeys.serviceTitanReferenceFailed, since24h);

  return {
    windows: {
      last24h: {
        webhookAccepted: sumMetric(rows, operationalMetricKeys.webhookIntakeAccepted, since24h),
        webhookDuplicates: sumMetric(rows, operationalMetricKeys.webhookIntakeDuplicate, since24h),
        webhookAvgLagMs: averageMetric(rows, operationalMetricKeys.webhookReconcileQueueLagMs, since24h),
        webhookFailed: sumMetric(rows, operationalMetricKeys.webhookReconcileFailed, since24h),
        automationSent: automationSent24h,
        automationFailed: automationFailed24h,
        issueCreated: sumMetric(rows, operationalMetricKeys.issueCreated, since24h),
        issueReopened: sumMetric(rows, operationalMetricKeys.issueReopened, since24h),
        serviceTitanFailures: serviceTitanFailures24h
      },
      last7d: {
        conversationHandoffs: conversationHandoffs7d,
        conversationBlocked: conversationBlocked7d,
        lowConfidence: sumMetric(rows, operationalMetricKeys.conversationStopReason, since7d, {
          stopReason: "LOW_CONFIDENCE"
        }),
        maxTurnHits: sumMetric(rows, operationalMetricKeys.conversationStopReason, since7d, {
          stopReason: "MAX_AUTOMATED_TURNS_REACHED"
        }),
        reportDeliveryFailures: reportDeliveryFailures7d,
        reportDeliverySuccessRate: percentage(
          reportDeliverySuccesses7d,
          reportDeliverySuccesses7d + reportDeliveryFailures7d
        ),
        handoffRate: percentage(conversationHandoffs7d, conversationDecisions7d)
      }
    },
    queue: {
      openIssues: issueSummary.open,
      highSeverity: issueSummary.highSeverity,
      retryableOpen: issueSummary.retryableOpen,
      currentOpenGauge: latestGauge(rows, operationalMetricKeys.issueOpenGauge, since7d)
    },
    rolloutPosture
  };
}

export function getConversationStopReasonLabel(stopReason: LeadConversationStopReason | null) {
  return stopReason ? humanizeLeadConversationStopReason(stopReason) : "None";
}
