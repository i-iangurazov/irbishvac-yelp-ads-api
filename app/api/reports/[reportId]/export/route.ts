import { NextResponse } from "next/server";

import { exportReportResultToCsv, getReportDetail } from "@/features/reporting/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function GET(_: Request, context: { params: Promise<{ reportId: string }> }) {
  try {
    const user = await requireApiPermission("reports:read");

    if (user instanceof NextResponse) {
      return user;
    }

    const { reportId } = await context.params;
    const report = await getReportDetail(user.tenantId, reportId);
    const csv = exportReportResultToCsv(report);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="report-${reportId}.csv"`
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
