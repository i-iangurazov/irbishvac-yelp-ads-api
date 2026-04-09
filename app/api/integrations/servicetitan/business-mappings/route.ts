import { NextResponse } from "next/server";

import { saveBusinessLocationAssignmentWorkflow } from "@/features/crm-connector/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request) {
  try {
    const user = await requireApiPermission("businesses:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const saved = await saveBusinessLocationAssignmentWorkflow(user.tenantId, user.id, body);

    return NextResponse.json(saved);
  } catch (error) {
    return handleRouteError(error);
  }
}
