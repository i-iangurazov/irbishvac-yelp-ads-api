import { NextResponse } from "next/server";

import { reconcilePendingProgramJobs } from "@/features/ads-programs/service";
import { runLeadAutomationFollowUpWorker } from "@/features/autoresponder/service";
import { reconcileDueServiceTitanLifecycleSyncs } from "@/features/crm-connector/lifecycle-service";
import { reconcilePendingLeadWebhooks } from "@/features/leads/service";
import { reconcileDueReportSchedules, reconcilePendingReportScheduleRuns } from "@/features/report-delivery/service";
import { reconcilePendingReports } from "@/features/reporting/service";
import { handleRouteError, requireCronAuthorization } from "@/lib/utils/http";

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

export async function GET(request: Request) {
  const unauthorized = requireCronAuthorization(request);

  if (unauthorized instanceof NextResponse) {
    return unauthorized;
  }

  try {
    const { searchParams } = new URL(request.url);
    const limits = {
      programJobLimit: parseLimit(searchParams.get("programJobLimit"), 25, 100),
      leadWebhookLimit: parseLimit(searchParams.get("leadWebhookLimit"), 25, 100),
      scheduledReportLimit: parseLimit(searchParams.get("scheduledReportLimit"), 10, 50),
      reportLimit: parseLimit(searchParams.get("reportLimit"), 10, 50),
      reportDeliveryLimit: parseLimit(searchParams.get("reportDeliveryLimit"), 20, 100),
      autoresponderFollowUpLimit: parseLimit(searchParams.get("autoresponderFollowUpLimit"), 20, 100),
      connectorLifecycleLimit: parseLimit(searchParams.get("connectorLifecycleLimit"), 10, 50)
    };

    const programJobs = limits.programJobLimit > 0 ? await reconcilePendingProgramJobs(limits.programJobLimit) : [];
    const leadWebhooks = limits.leadWebhookLimit > 0 ? await reconcilePendingLeadWebhooks(limits.leadWebhookLimit) : [];
    const scheduledReports =
      limits.scheduledReportLimit > 0 ? await reconcileDueReportSchedules(limits.scheduledReportLimit) : [];
    const reports = limits.reportLimit > 0 ? await reconcilePendingReports(limits.reportLimit) : [];
    const reportDeliveries =
      limits.reportDeliveryLimit > 0 ? await reconcilePendingReportScheduleRuns(limits.reportDeliveryLimit) : [];
    const autoresponderFollowUps =
      limits.autoresponderFollowUpLimit > 0
        ? await runLeadAutomationFollowUpWorker(limits.autoresponderFollowUpLimit)
        : [];
    const connectorLifecycle =
      limits.connectorLifecycleLimit > 0
        ? await reconcileDueServiceTitanLifecycleSyncs(limits.connectorLifecycleLimit)
        : {
            tenantCount: 0,
            processedCount: 0,
            failedCount: 0,
            partialCount: 0,
            completedCount: 0,
            results: []
          };

    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      limits,
      programJobs,
      leadWebhooks,
      scheduledReports,
      reports,
      reportDeliveries,
      autoresponderFollowUps,
      connectorLifecycle
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
