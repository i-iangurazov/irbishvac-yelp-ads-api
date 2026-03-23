import { NextResponse } from "next/server";

import { updateProgramBudgetWorkflow } from "@/features/ads-programs/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request, context: { params: Promise<{ programId: string }> }) {
  try {
    const user = await requireApiPermission("programs:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const { programId } = await context.params;
    const result = await updateProgramBudgetWorkflow(user.tenantId, user.id, programId, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
