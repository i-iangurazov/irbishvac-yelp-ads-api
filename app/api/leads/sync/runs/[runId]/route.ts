import { NextResponse } from "next/server";

import { getLeadBackfillRunStatusWorkflow } from "@/features/leads/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const user = await requireApiPermission("leads:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const { runId } = await params;
    const result = await getLeadBackfillRunStatusWorkflow(user.tenantId, runId);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
