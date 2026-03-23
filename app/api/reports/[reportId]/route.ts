import { NextResponse } from "next/server";

import { getReportDetail, pollReportWorkflow } from "@/features/reporting/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }) {
  try {
    const user = await requireApiPermission("reports:read");

    if (user instanceof NextResponse) {
      return user;
    }

    const { searchParams } = new URL(request.url);
    const { reportId } = await context.params;
    const shouldPoll = searchParams.get("poll") === "true";
    const result = shouldPoll
      ? await pollReportWorkflow(user.tenantId, reportId)
      : await getReportDetail(user.tenantId, reportId);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
