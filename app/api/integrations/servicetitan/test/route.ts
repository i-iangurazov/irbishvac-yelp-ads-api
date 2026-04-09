import { NextResponse } from "next/server";

import { testServiceTitanConnectorWorkflow } from "@/features/crm-connector/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST() {
  try {
    const user = await requireApiPermission("settings:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const result = await testServiceTitanConnectorWorkflow(user.tenantId, user.id);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
