import { NextResponse } from "next/server";

import { syncBusinessProgramsFromYelpWorkflow } from "@/features/ads-programs/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(_: Request, context: { params: Promise<{ businessId: string }> }) {
  try {
    const user = await requireApiPermission("programs:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const { businessId } = await context.params;
    const result = await syncBusinessProgramsFromYelpWorkflow(user.tenantId, user.id, businessId);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
