import { NextResponse } from "next/server";

import {
  deleteLeadAutomationRuleWorkflow,
  updateLeadAutomationRuleWorkflow
} from "@/features/autoresponder/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function PATCH(request: Request, context: { params: Promise<{ ruleId: string }> }) {
  try {
    const user = await requireApiPermission("settings:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const { ruleId } = await context.params;
    const result = await updateLeadAutomationRuleWorkflow(user.tenantId, user.id, ruleId, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ ruleId: string }> }) {
  try {
    const user = await requireApiPermission("settings:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const { ruleId } = await context.params;
    const result = await deleteLeadAutomationRuleWorkflow(user.tenantId, user.id, ruleId);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
