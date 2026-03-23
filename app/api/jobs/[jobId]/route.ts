import { NextResponse } from "next/server";

import { pollProgramJobWorkflow } from "@/features/ads-programs/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function GET(_: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireApiPermission("programs:read");

    if (user instanceof NextResponse) {
      return user;
    }

    const { jobId } = await context.params;
    const job = await pollProgramJobWorkflow(user.tenantId, jobId);

    return NextResponse.json(job);
  } catch (error) {
    return handleRouteError(error);
  }
}
