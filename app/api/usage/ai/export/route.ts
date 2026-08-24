import { NextResponse } from "next/server";

import { exportAiUsageToCsv } from "@/features/autoresponder/usage-export";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function GET(request: Request) {
  try {
    const user = await requireApiPermission("billing:manage");

    if (user instanceof NextResponse) {
      return user;
    }

    const month =
      new URL(request.url).searchParams.get("month") ??
      new Date().toISOString().slice(0, 7);
    const csv = await exportAiUsageToCsv(user.tenantId, month);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="claude-usage-${month}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
