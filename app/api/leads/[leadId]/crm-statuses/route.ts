import { NextResponse } from "next/server";

import { appendLeadInternalStatusWorkflow } from "@/features/crm-enrichment/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request, context: { params: Promise<{ leadId: string }> }) {
  try {
    const user = await requireApiPermission("leads:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const { leadId } = await context.params;
    const result = await appendLeadInternalStatusWorkflow(user.tenantId, user.id, leadId, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
