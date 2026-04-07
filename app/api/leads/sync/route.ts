import { NextResponse } from "next/server";

import { syncBusinessLeadsWorkflow } from "@/features/leads/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request) {
  try {
    const user = await requireApiPermission("leads:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const result = await syncBusinessLeadsWorkflow(user.tenantId, user.id, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
