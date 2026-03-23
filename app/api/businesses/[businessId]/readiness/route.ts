import { NextResponse } from "next/server";

import { patchBusinessReadinessFields } from "@/features/businesses/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function PATCH(request: Request, context: { params: Promise<{ businessId: string }> }) {
  try {
    const user = await requireApiPermission("businesses:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const params = await context.params;
    const body = await request.json();
    await patchBusinessReadinessFields(user.tenantId, user.id, {
      ...body,
      businessId: params.businessId
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
