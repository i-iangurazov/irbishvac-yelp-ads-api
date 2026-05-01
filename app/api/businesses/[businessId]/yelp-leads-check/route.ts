import { NextResponse } from "next/server";

import { runBusinessYelpLeadsReadinessCheck } from "@/features/businesses/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(_request: Request, context: { params: Promise<{ businessId: string }> }) {
  try {
    const user = await requireApiPermission("businesses:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const { businessId } = await context.params;
    const result = await runBusinessYelpLeadsReadinessCheck(user.tenantId, user.id, businessId);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
