import { NextResponse } from "next/server";

import { exportReportBreakdownToCsv, exportReportResultToCsv, getReportBreakdownView, getReportDetail } from "@/features/reporting/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }) {
  try {
    const user = await requireApiPermission("reports:read");

    if (user instanceof NextResponse) {
      return user;
    }

    const { reportId } = await context.params;
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");
    const csv =
      view === "location" || view === "service"
        ? exportReportBreakdownToCsv(
            await getReportBreakdownView(user.tenantId, reportId, {
              view,
              from: searchParams.get("from") ?? undefined,
              to: searchParams.get("to") ?? undefined,
              locationId: searchParams.get("locationId") ?? undefined,
              serviceCategoryId: searchParams.get("serviceCategoryId") ?? undefined
            })
          )
        : exportReportResultToCsv(await getReportDetail(user.tenantId, reportId));
    const filenameSuffix = view === "location" || view === "service" ? `-${view}` : "";

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="report-${reportId}${filenameSuffix}.csv"`
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
