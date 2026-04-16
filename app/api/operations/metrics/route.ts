import { NextResponse } from "next/server";

import { getOperationalPilotOverview } from "@/features/operations/observability-service";
import { requireApiPermission } from "@/lib/utils/http";

export async function GET() {
  const user = await requireApiPermission("audit:read");

  if (user instanceof NextResponse) {
    return user;
  }

  const overview = await getOperationalPilotOverview(user.tenantId);

  return NextResponse.json({
    ok: true,
    overview
  });
}
