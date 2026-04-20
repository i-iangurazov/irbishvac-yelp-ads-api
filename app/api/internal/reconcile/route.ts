import { NextResponse } from "next/server";

import { reconcilePendingProgramJobs } from "@/features/ads-programs/service";
import { runLeadAutomationFollowUpWorker } from "@/features/autoresponder/service";
import { reconcileDueServiceTitanLifecycleSyncs } from "@/features/crm-connector/lifecycle-service";
import { reconcilePendingLeadWebhooks, reconcileRecentYelpLeadsForAutomation } from "@/features/leads/service";
import { reconcileDueReportSchedules, reconcilePendingReportScheduleRuns } from "@/features/report-delivery/service";
import { reconcilePendingReports } from "@/features/reporting/service";
import {
  runDurableWorkerTask,
  summarizeDurableWorkerOutcome,
  type DurableWorkerTaskOutcome
} from "@/features/operations/worker-job-service";
import { handleRouteError, requireCronAuthorization } from "@/lib/utils/http";
import { logError, logInfo } from "@/lib/utils/logging";

function parseLimit(value: string | null, defaultValue: number, maxValue: number) {
  if (value === null) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  const normalized = Math.trunc(parsed);

  if (normalized <= 0) {
    return 0;
  }

  return Math.min(normalized, maxValue);
}

function skippedWorkerOutcome<T>(jobKey: string): DurableWorkerTaskOutcome<T> {
  return {
    status: "SKIPPED",
    job: {
      id: "disabled",
      tenantId: null,
      jobKey,
      kind: "INTERNAL_RECONCILE_PROGRAM_JOBS",
      status: "SKIPPED",
      attempts: 0,
      maxAttempts: 0,
      priority: 100,
      queuedAt: new Date(),
      nextAttemptAt: null,
      claimedAt: null,
      claimExpiresAt: null,
      claimedBy: null,
      startedAt: null,
      finishedAt: null,
      deadLetteredAt: null,
      lastHeartbeatAt: null,
      lastErrorSummary: null,
      lastErrorJson: null,
      payloadJson: null,
      resultJson: null,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    result: null,
    skippedReason: "ACTIVE_OR_NOT_DUE",
    durationMs: 0
  };
}

export async function GET(request: Request) {
  const unauthorized = requireCronAuthorization(request);

  if (unauthorized instanceof NextResponse) {
    return unauthorized;
  }

  try {
    const { searchParams } = new URL(request.url);
    const startedAt = Date.now();
    const limits = {
      programJobLimit: parseLimit(searchParams.get("programJobLimit"), 25, 100),
      leadWebhookLimit: parseLimit(searchParams.get("leadWebhookLimit"), 25, 100),
      leadPollingLimit: parseLimit(searchParams.get("leadPollingLimit"), 40, 100),
      scheduledReportLimit: parseLimit(searchParams.get("scheduledReportLimit"), 10, 50),
      reportLimit: parseLimit(searchParams.get("reportLimit"), 10, 50),
      reportDeliveryLimit: parseLimit(searchParams.get("reportDeliveryLimit"), 20, 100),
      autoresponderFollowUpLimit: parseLimit(searchParams.get("autoresponderFollowUpLimit"), 20, 100),
      connectorLifecycleLimit: parseLimit(searchParams.get("connectorLifecycleLimit"), 10, 50)
    };

    const programJobsOutcome =
      limits.programJobLimit > 0
        ? await runDurableWorkerTask({
            kind: "INTERNAL_RECONCILE_PROGRAM_JOBS",
            jobKey: "internal-reconcile:program-jobs",
            payloadJson: { limit: limits.programJobLimit },
            task: () => reconcilePendingProgramJobs(limits.programJobLimit)
          })
        : skippedWorkerOutcome<Awaited<ReturnType<typeof reconcilePendingProgramJobs>>>("internal-reconcile:program-jobs");
    const leadWebhooksOutcome =
      limits.leadWebhookLimit > 0
        ? await runDurableWorkerTask({
            kind: "INTERNAL_RECONCILE_LEAD_WEBHOOKS",
            jobKey: "internal-reconcile:lead-webhooks",
            payloadJson: { limit: limits.leadWebhookLimit },
            task: () => reconcilePendingLeadWebhooks(limits.leadWebhookLimit)
          })
        : skippedWorkerOutcome<Awaited<ReturnType<typeof reconcilePendingLeadWebhooks>>>("internal-reconcile:lead-webhooks");
    const leadPollingOutcome =
      limits.leadPollingLimit > 0
        ? await runDurableWorkerTask({
            kind: "INTERNAL_RECONCILE_LEAD_WEBHOOKS",
            jobKey: "internal-reconcile:lead-polling",
            payloadJson: { limit: limits.leadPollingLimit },
            task: () => reconcileRecentYelpLeadsForAutomation(limits.leadPollingLimit)
          })
        : skippedWorkerOutcome<Awaited<ReturnType<typeof reconcileRecentYelpLeadsForAutomation>>>(
            "internal-reconcile:lead-polling"
          );
    const scheduledReportsOutcome =
      limits.scheduledReportLimit > 0
        ? await runDurableWorkerTask({
            kind: "INTERNAL_RECONCILE_SCHEDULED_REPORTS",
            jobKey: "internal-reconcile:scheduled-reports",
            payloadJson: { limit: limits.scheduledReportLimit },
            task: () => reconcileDueReportSchedules(limits.scheduledReportLimit)
          })
        : skippedWorkerOutcome<Awaited<ReturnType<typeof reconcileDueReportSchedules>>>("internal-reconcile:scheduled-reports");
    const reportsOutcome =
      limits.reportLimit > 0
        ? await runDurableWorkerTask({
            kind: "INTERNAL_RECONCILE_REPORTS",
            jobKey: "internal-reconcile:reports",
            payloadJson: { limit: limits.reportLimit },
            task: () => reconcilePendingReports(limits.reportLimit)
          })
        : skippedWorkerOutcome<Awaited<ReturnType<typeof reconcilePendingReports>>>("internal-reconcile:reports");
    const reportDeliveriesOutcome =
      limits.reportDeliveryLimit > 0
        ? await runDurableWorkerTask({
            kind: "INTERNAL_RECONCILE_REPORT_DELIVERIES",
            jobKey: "internal-reconcile:report-deliveries",
            payloadJson: { limit: limits.reportDeliveryLimit },
            task: () => reconcilePendingReportScheduleRuns(limits.reportDeliveryLimit)
          })
        : skippedWorkerOutcome<Awaited<ReturnType<typeof reconcilePendingReportScheduleRuns>>>("internal-reconcile:report-deliveries");
    const autoresponderFollowUpsOutcome =
      limits.autoresponderFollowUpLimit > 0
        ? await runDurableWorkerTask({
            kind: "INTERNAL_RECONCILE_AUTORESPONDER_FOLLOWUPS",
            jobKey: "internal-reconcile:autoresponder-followups",
            payloadJson: { limit: limits.autoresponderFollowUpLimit },
            task: () => runLeadAutomationFollowUpWorker(limits.autoresponderFollowUpLimit)
          })
        : skippedWorkerOutcome<Awaited<ReturnType<typeof runLeadAutomationFollowUpWorker>>>(
            "internal-reconcile:autoresponder-followups"
          );
    const connectorLifecycleOutcome =
      limits.connectorLifecycleLimit > 0
        ? await runDurableWorkerTask({
            kind: "INTERNAL_RECONCILE_SERVICETITAN_LIFECYCLE",
            jobKey: "internal-reconcile:servicetitan-lifecycle",
            payloadJson: { limit: limits.connectorLifecycleLimit },
            task: () => reconcileDueServiceTitanLifecycleSyncs(limits.connectorLifecycleLimit)
          })
        : skippedWorkerOutcome<Awaited<ReturnType<typeof reconcileDueServiceTitanLifecycleSyncs>>>(
            "internal-reconcile:servicetitan-lifecycle"
          );
    const programJobs = programJobsOutcome.result ?? [];
    const leadWebhooks = leadWebhooksOutcome.result ?? [];
    const leadPolling =
      leadPollingOutcome.result ??
      {
        tenantCount: 0,
        businessCount: 0,
        processedLeadCount: 0,
        importedCount: 0,
        updatedCount: 0,
        failedCount: 0,
        initialAutomationProcessedCount: 0,
        conversationAutomationProcessedCount: 0,
        results: []
      };
    const scheduledReports = scheduledReportsOutcome.result ?? [];
    const reports = reportsOutcome.result ?? [];
    const reportDeliveries = reportDeliveriesOutcome.result ?? [];
    const autoresponderFollowUps = autoresponderFollowUpsOutcome.result ?? [];
    const connectorLifecycle =
      connectorLifecycleOutcome.result ??
      {
            tenantCount: 0,
            processedCount: 0,
            failedCount: 0,
            partialCount: 0,
            completedCount: 0,
            results: []
      };
    const workerJobs = {
      programJobs: summarizeDurableWorkerOutcome(programJobsOutcome),
      leadWebhooks: summarizeDurableWorkerOutcome(leadWebhooksOutcome),
      leadPolling: summarizeDurableWorkerOutcome(leadPollingOutcome),
      scheduledReports: summarizeDurableWorkerOutcome(scheduledReportsOutcome),
      reports: summarizeDurableWorkerOutcome(reportsOutcome),
      reportDeliveries: summarizeDurableWorkerOutcome(reportDeliveriesOutcome),
      autoresponderFollowUps: summarizeDurableWorkerOutcome(autoresponderFollowUpsOutcome),
      connectorLifecycle: summarizeDurableWorkerOutcome(connectorLifecycleOutcome)
    };
    const hasWorkerFailure = Object.values(workerJobs).some(
      (workerJob) => workerJob.status === "FAILED" || workerJob.status === "DEAD_LETTERED"
    );

    logInfo("internal.reconcile.completed", {
      durationMs: Date.now() - startedAt,
      limits,
      programJobs: programJobs.length,
      leadWebhooks: leadWebhooks.length,
      leadPollingBusinesses: leadPolling.businessCount,
      leadPollingLeads: leadPolling.processedLeadCount,
      scheduledReports: scheduledReports.length,
      reports: reports.length,
      reportDeliveries: reportDeliveries.length,
      autoresponderFollowUps: autoresponderFollowUps.length,
      connectorLifecycleProcessed: connectorLifecycle.processedCount,
      workerJobs
    });

    return NextResponse.json({
      ok: !hasWorkerFailure,
      processedAt: new Date().toISOString(),
      limits,
      programJobs,
      leadWebhooks,
      leadPolling,
      scheduledReports,
      reports,
      reportDeliveries,
      autoresponderFollowUps,
      connectorLifecycle,
      workerJobs
    });
  } catch (error) {
    const handled = error instanceof Error ? error.message : "Unknown reconcile failure";
    logError("internal.reconcile.failed", {
      message: handled
    });
    return handleRouteError(error);
  }
}
