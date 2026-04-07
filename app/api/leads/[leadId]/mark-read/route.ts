import { NextResponse } from "next/server";

import { markLeadAsReadWorkflow } from "@/features/leads/messaging-service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(_request: Request, context: { params: Promise<{ leadId: string }> }) {
  try {
    const user = await requireApiPermission("leads:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const { leadId } = await context.params;
    const result = await markLeadAsReadWorkflow(user.tenantId, user.id, leadId);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
