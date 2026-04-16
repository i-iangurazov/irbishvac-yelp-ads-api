import { NextResponse } from "next/server";

import { getReportingIndex, requestReportWorkflow } from "@/features/reporting/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function GET() {
  try {
    const user = await requireApiPermission("reports:read");

    if (user instanceof NextResponse) {
      return user;
    }

    const reports = await getReportingIndex(user.tenantId);

    return NextResponse.json(reports.reports);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiPermission("reports:request");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const report = await requestReportWorkflow(user.tenantId, user.id, body);

    return NextResponse.json(report);
  } catch (error) {
    return handleRouteError(error);
  }
}
