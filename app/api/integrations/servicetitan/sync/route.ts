import { NextResponse } from "next/server";

import { syncServiceTitanReferenceDataWorkflow } from "@/features/crm-connector/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request) {
  try {
    const user = await requireApiPermission("sync:retry");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json().catch(() => ({}));
    const result = await syncServiceTitanReferenceDataWorkflow(user.tenantId, user.id, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
