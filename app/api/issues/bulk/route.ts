import { NextResponse } from "next/server";

import { bulkOperatorIssueActionWorkflow } from "@/features/issues/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request) {
  const user = await requireApiPermission("sync:retry");

  if (user instanceof NextResponse) {
    return user;
  }

  try {
    const body = await request.json();
    const result = await bulkOperatorIssueActionWorkflow(user.tenantId, user.id, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
