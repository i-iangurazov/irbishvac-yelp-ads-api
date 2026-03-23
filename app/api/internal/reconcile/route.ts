import { NextResponse } from "next/server";

import { reconcilePendingProgramJobs } from "@/features/ads-programs/service";
import { reconcilePendingReports } from "@/features/reporting/service";
import { handleRouteError, requireCronAuthorization } from "@/lib/utils/http";

export async function GET(request: Request) {
  const unauthorized = requireCronAuthorization(request);

  if (unauthorized instanceof NextResponse) {
    return unauthorized;
  }

  try {
    const [programJobs, reports] = await Promise.all([reconcilePendingProgramJobs(25), reconcilePendingReports(10)]);

    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      programJobs,
      reports
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
