import { NextResponse } from "next/server";

import { resendReportScheduleRunWorkflow } from "@/features/report-delivery/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireApiPermission("reports:request");

    if (user instanceof NextResponse) {
      return user;
    }

    const { runId } = await context.params;
    const run = await resendReportScheduleRunWorkflow(user.tenantId, user.id, runId);

    return NextResponse.json(run);
  } catch (error) {
    return handleRouteError(error);
  }
}
