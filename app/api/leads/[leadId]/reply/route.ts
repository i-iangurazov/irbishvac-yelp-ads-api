import { NextResponse } from "next/server";

import { sendLeadReplyWorkflow } from "@/features/leads/messaging-service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request, context: { params: Promise<{ leadId: string }> }) {
  try {
    const user = await requireApiPermission("leads:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const { leadId } = await context.params;
    const result = await sendLeadReplyWorkflow(user.tenantId, user.id, leadId, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
