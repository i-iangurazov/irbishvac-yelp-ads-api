import { NextResponse } from "next/server";

import { createReportScheduleWorkflow } from "@/features/report-delivery/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request) {
  try {
    const user = await requireApiPermission("reports:request");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const schedule = await createReportScheduleWorkflow(user.tenantId, user.id, body);

    return NextResponse.json(schedule);
  } catch (error) {
    return handleRouteError(error);
  }
}
