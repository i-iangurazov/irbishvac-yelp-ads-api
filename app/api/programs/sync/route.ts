import { NextResponse } from "next/server";

import { syncAllCurrentProgramsFromYelpWorkflow } from "@/features/ads-programs/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST() {
  try {
    const user = await requireApiPermission("programs:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const result = await syncAllCurrentProgramsFromYelpWorkflow(
      user.tenantId,
      user.id,
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
