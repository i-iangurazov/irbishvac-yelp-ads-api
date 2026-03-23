import { NextResponse } from "next/server";

import { editProgramWorkflow, getProgramDetail } from "@/features/ads-programs/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function GET(_: Request, context: { params: Promise<{ programId: string }> }) {
  try {
    const user = await requireApiPermission("programs:read");

    if (user instanceof NextResponse) {
      return user;
    }

    const { programId } = await context.params;
    const program = await getProgramDetail(user.tenantId, programId);

    return NextResponse.json(program);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ programId: string }> }) {
  try {
    const user = await requireApiPermission("programs:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const { programId } = await context.params;
    const result = await editProgramWorkflow(user.tenantId, user.id, {
      ...body,
      programId
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
