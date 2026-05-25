import { NextResponse } from "next/server";

import { runBusinessesYelpSync } from "@/features/businesses/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST() {
  try {
    const user = await requireApiPermission("businesses:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const result = await runBusinessesYelpSync(user.tenantId, user.id);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
