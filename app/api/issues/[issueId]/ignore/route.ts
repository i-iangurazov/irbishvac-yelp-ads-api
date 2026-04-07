import { NextResponse } from "next/server";

import { ignoreOperatorIssueWorkflow } from "@/features/issues/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request, context: { params: Promise<{ issueId: string }> }) {
  try {
    const user = await requireApiPermission("sync:retry");

    if (user instanceof NextResponse) {
      return user;
    }

    const { issueId } = await context.params;
    const body = await request.json();
    const issue = await ignoreOperatorIssueWorkflow(user.tenantId, user.id, issueId, body);

    return NextResponse.json(issue);
  } catch (error) {
    return handleRouteError(error);
  }
}
