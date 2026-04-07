import { NextResponse } from "next/server";

import { updateReportScheduleWorkflow } from "@/features/report-delivery/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function PATCH(request: Request, context: { params: Promise<{ scheduleId: string }> }) {
  try {
    const user = await requireApiPermission("reports:request");

    if (user instanceof NextResponse) {
      return user;
    }

    const { scheduleId } = await context.params;
    const body = await request.json();
    const schedule = await updateReportScheduleWorkflow(user.tenantId, user.id, scheduleId, body);

    return NextResponse.json(schedule);
  } catch (error) {
    return handleRouteError(error);
  }
}
