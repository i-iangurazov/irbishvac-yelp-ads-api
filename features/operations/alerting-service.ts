import "server-only";

import { getOperationalPilotOverview } from "@/features/operations/observability-service";
import { getWebhookReconcileDrilldown } from "@/lib/db/operations-repository";
import { listTenantIds } from "@/lib/db/settings-repository";
import { getServerEnv } from "@/lib/utils/env";
import { fetchWithRetry } from "@/lib/utils/fetch";

type OperationalAlertSeverity = "WARN" | "CRITICAL";
type OperationalAlertStatus = "OK" | OperationalAlertSeverity;

export type OperationalAlert = {
  key: string;
  severity: OperationalAlertSeverity;
  title: string;
  summary: string;
  value: number;
  threshold: number;
  runbookHint: string;
};

export const operationalAlertThresholds = {
  webhookOldestPendingWarnMs: 10 * 60 * 1000,
  webhookOldestPendingCriticalMs: 30 * 60 * 1000,
  webhookFailed24hWarn: 1,
  webhookFailed24hCritical: 5,
  automationFailed24hWarn: 1,
  automationFailed24hCritical: 3,
  highSeverityOpenWarn: 1,
  highSeverityOpenCritical: 3,
  reportDeliveryFailures7dWarn: 1,
  serviceTitanFailures24hWarn: 1
} as const;

function getOverallAlertStatus(alerts: OperationalAlert[]): OperationalAlertStatus {
  if (alerts.some((alert) => alert.severity === "CRITICAL")) {
    return "CRITICAL";
  }

  if (alerts.length > 0) {
    return "WARN";
  }

  return "OK";
}

function pushThresholdAlert(
  alerts: OperationalAlert[],
  params: {
    key: string;
    title: string;
    summary: string;
    value: number;
    warnThreshold: number;
    criticalThreshold?: number;
    runbookHint: string;
  }
) {
  if (params.value < params.warnThreshold) {
    return;
  }

  const criticalThreshold = params.criticalThreshold ?? Number.POSITIVE_INFINITY;

  alerts.push({
    key: params.key,
    severity: params.value >= criticalThreshold ? "CRITICAL" : "WARN",
    title: params.title,
    summary: params.summary,
    value: params.value,
    threshold: params.value >= criticalThreshold ? criticalThreshold : params.warnThreshold,
    runbookHint: params.runbookHint
  });
}

export async function evaluateOperationalAlerts(tenantId: string, now = new Date()) {
  const [webhookOverview, pilotOverview] = await Promise.all([
    getWebhookReconcileDrilldown(tenantId, now),
    getOperationalPilotOverview(tenantId)
  ]);
  const alerts: OperationalAlert[] = [];
  const oldestPendingAgeMs = webhookOverview.oldestPending
    ? Math.max(0, now.getTime() - webhookOverview.oldestPending.receivedAt.getTime())
    : 0;

  pushThresholdAlert(alerts, {
    key: "webhook.oldest_pending_age",
    title: "Webhook backlog is aging",
    summary: webhookOverview.oldestPending
      ? `Oldest pending webhook has been ${Math.round(oldestPendingAgeMs / 60000)} minutes in ${webhookOverview.oldestPending.status}.`
      : "No pending webhook backlog.",
    value: oldestPendingAgeMs,
    warnThreshold: operationalAlertThresholds.webhookOldestPendingWarnMs,
    criticalThreshold: operationalAlertThresholds.webhookOldestPendingCriticalMs,
    runbookHint: "Open Audit > Webhook and reconcile drilldown, inspect stale events, then run the reconcile worker if safe."
  });

  pushThresholdAlert(alerts, {
    key: "webhook.failed_24h",
    title: "Webhook reconciliation failures detected",
    summary: `${webhookOverview.counts.failedLast24h} failed or partial webhook reconciles in the last 24 hours.`,
    value: webhookOverview.counts.failedLast24h,
    warnThreshold: operationalAlertThresholds.webhookFailed24hWarn,
    criticalThreshold: operationalAlertThresholds.webhookFailed24hCritical,
    runbookHint: "Use the webhook drilldown table to identify business, lead, event key, and sync error summary."
  });

  pushThresholdAlert(alerts, {
    key: "autoresponder.failed_24h",
    title: "Autoresponder sends are failing",
    summary: `${pilotOverview.windows.last24h.automationFailed} initial or follow-up sends failed in the last 24 hours.`,
    value: pilotOverview.windows.last24h.automationFailed,
    warnThreshold: operationalAlertThresholds.automationFailed24hWarn,
    criticalThreshold: operationalAlertThresholds.automationFailed24hCritical,
    runbookHint: "Open the operator queue and Autoresponder health before allowing more automated sends."
  });

  pushThresholdAlert(alerts, {
    key: "issues.high_severity_open",
    title: "High severity operator issues are open",
    summary: `${pilotOverview.queue.highSeverity} high or critical issues are currently open.`,
    value: pilotOverview.queue.highSeverity,
    warnThreshold: operationalAlertThresholds.highSeverityOpenWarn,
    criticalThreshold: operationalAlertThresholds.highSeverityOpenCritical,
    runbookHint: "Work the Audit operator queue first; pause affected businesses if sends or syncs are unsafe."
  });

  pushThresholdAlert(alerts, {
    key: "reports.delivery_failed_7d",
    title: "Report delivery failures detected",
    summary: `${pilotOverview.windows.last7d.reportDeliveryFailures} report deliveries failed in the last 7 days.`,
    value: pilotOverview.windows.last7d.reportDeliveryFailures,
    warnThreshold: operationalAlertThresholds.reportDeliveryFailures7dWarn,
    runbookHint: "Check SMTP settings, report schedule run errors, and recipient routing before the next scheduled run."
  });

  pushThresholdAlert(alerts, {
    key: "servicetitan.failed_24h",
    title: "ServiceTitan sync failures detected",
    summary: `${pilotOverview.windows.last24h.serviceTitanFailures} ServiceTitan lifecycle or reference sync failures in the last 24 hours.`,
    value: pilotOverview.windows.last24h.serviceTitanFailures,
    warnThreshold: operationalAlertThresholds.serviceTitanFailures24hWarn,
    runbookHint: "Check Integrations and connector issues before trusting downstream lifecycle state."
  });

  return {
    tenantId,
    evaluatedAt: now.toISOString(),
    status: getOverallAlertStatus(alerts),
    ok: alerts.length === 0,
    alerts,
    thresholds: operationalAlertThresholds
  };
}

export async function dispatchOperationalAlertDigest(result: Awaited<ReturnType<typeof evaluateOperationalAlerts>>) {
  const env = getServerEnv();

  if (!env.OPERATIONS_ALERT_WEBHOOK_URL) {
    return {
      configured: false,
      sent: false,
      skippedReason: "OPERATIONS_ALERT_WEBHOOK_URL is not configured."
    };
  }

  if (result.alerts.length === 0) {
    return {
      configured: true,
      sent: false,
      skippedReason: "No alerts to dispatch."
    };
  }

  const response = await fetchWithRetry(env.OPERATIONS_ALERT_WEBHOOK_URL, {
    method: "POST",
    retries: 1,
    timeoutMs: 8_000,
    headers: {
      "content-type": "application/json",
      ...(env.OPERATIONS_ALERT_WEBHOOK_SECRET ? { authorization: `Bearer ${env.OPERATIONS_ALERT_WEBHOOK_SECRET}` } : {})
    },
    body: JSON.stringify({
      source: "irbishvac-yelp-ads-api",
      kind: "operational-alert-digest",
      ...result
    })
  });

  return {
    configured: true,
    sent: response.ok,
    status: response.status
  };
}

export async function runOperationalAlertEvaluation(params?: {
  dispatch?: boolean;
  now?: Date;
}) {
  const tenants = await listTenantIds();
  const results = await Promise.all(tenants.map((tenant) => evaluateOperationalAlerts(tenant.id, params?.now)));
  const dispatches = params?.dispatch
    ? await Promise.all(results.map((result) => dispatchOperationalAlertDigest(result)))
    : [];
  const status = getOverallAlertStatus(results.flatMap((result) => result.alerts));

  return {
    ok: status === "OK",
    status,
    evaluatedAt: (params?.now ?? new Date()).toISOString(),
    tenantCount: tenants.length,
    results,
    dispatches
  };
}
