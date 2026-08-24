import { NextResponse } from "next/server";

import { replayDeadLetteredWorkerJobWorkflow } from "@/features/operations/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const user = await requireApiPermission("sync:retry");

    if (user instanceof NextResponse) {
      return user;
    }

    const { jobId } = await context.params;
    const worker = await replayDeadLetteredWorkerJobWorkflow({
      tenantId: user.tenantId,
      actorId: user.id,
      actorRole: user.role.code,
      jobId,
    });

    return NextResponse.json(worker);
  } catch (error) {
    return handleRouteError(error);
  }
}
