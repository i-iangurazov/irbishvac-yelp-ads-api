import { NextResponse } from "next/server";

import { updateSeptemberBoostFocusWorkflow } from "@/features/ads-programs/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request) {
  try {
    const user = await requireApiPermission("programs:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const result = await updateSeptemberBoostFocusWorkflow(
      user.tenantId,
      user.id,
      await request.json(),
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
