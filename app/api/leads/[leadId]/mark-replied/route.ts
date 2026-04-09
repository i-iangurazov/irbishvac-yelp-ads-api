import { NextResponse } from "next/server";

import { markLeadAsRepliedWorkflow } from "@/features/leads/messaging-service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request, context: { params: Promise<{ leadId: string }> }) {
  try {
    const user = await requireApiPermission("leads:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const { leadId } = await context.params;
    const result = await markLeadAsRepliedWorkflow(user.tenantId, user.id, leadId, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
