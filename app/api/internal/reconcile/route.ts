import { NextResponse } from "next/server";

import { reconcilePendingProgramJobs } from "@/features/ads-programs/service";
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
    const scheduledReports = await reconcileDueReportSchedules(10);
    const reports = await reconcilePendingReports(10);
    const reportDeliveries = await reconcilePendingReportScheduleRuns(20);

    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      programJobs,
      scheduledReports,
      reports,
      reportDeliveries
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
