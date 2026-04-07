import { NextResponse } from "next/server";

import { retryOperatorIssueWorkflow } from "@/features/issues/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(_request: Request, context: { params: Promise<{ issueId: string }> }) {
  try {
    const user = await requireApiPermission("sync:retry");

    if (user instanceof NextResponse) {
      return user;
    }

    const { issueId } = await context.params;
    const issue = await retryOperatorIssueWorkflow(user.tenantId, user.id, issueId);

    return NextResponse.json(issue);
  } catch (error) {
    return handleRouteError(error);
  }
}
