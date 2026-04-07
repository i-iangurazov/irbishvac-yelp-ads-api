import { NextResponse } from "next/server";

import { generateReportScheduleNowWorkflow } from "@/features/report-delivery/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(_request: Request, context: { params: Promise<{ scheduleId: string }> }) {
  try {
    const user = await requireApiPermission("reports:request");

    if (user instanceof NextResponse) {
      return user;
    }

    const { scheduleId } = await context.params;
    const run = await generateReportScheduleNowWorkflow(user.tenantId, user.id, scheduleId);

    return NextResponse.json(run);
  } catch (error) {
    return handleRouteError(error);
  }
}
