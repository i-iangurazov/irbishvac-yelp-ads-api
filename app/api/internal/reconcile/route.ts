import { NextResponse } from "next/server";

import { reconcilePendingProgramJobs } from "@/features/ads-programs/service";
import { runLeadAutomationFollowUpWorker } from "@/features/autoresponder/service";
import { reconcileDueServiceTitanLifecycleSyncs } from "@/features/crm-connector/lifecycle-service";
import { reconcilePendingLeadWebhooks } from "@/features/leads/service";
import { reconcileDueReportSchedules, reconcilePendingReportScheduleRuns } from "@/features/report-delivery/service";
import { reconcilePendingReports } from "@/features/reporting/service";
import { handleRouteError, requireCronAuthorization } from "@/lib/utils/http";

export async function GET(request: Request) {
  const unauthorized = requireCronAuthorization(request);

  if (unauthorized instanceof NextResponse) {
    return unauthorized;
  }

  try {
    const programJobs = await reconcilePendingProgramJobs(25);
    const leadWebhooks = await reconcilePendingLeadWebhooks(25);
    const scheduledReports = await reconcileDueReportSchedules(10);
    const reports = await reconcilePendingReports(10);
    const reportDeliveries = await reconcilePendingReportScheduleRuns(20);
    const autoresponderFollowUps = await runLeadAutomationFollowUpWorker(20);
    const connectorLifecycle = await reconcileDueServiceTitanLifecycleSyncs(10);

    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
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
