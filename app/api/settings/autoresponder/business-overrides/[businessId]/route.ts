import { NextResponse } from "next/server";

import { deleteLeadAutomationBusinessOverrideWorkflow } from "@/features/autoresponder/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  try {
    const user = await requireApiPermission("settings:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const { businessId } = await params;
    const result = await deleteLeadAutomationBusinessOverrideWorkflow(user.tenantId, user.id, businessId);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
