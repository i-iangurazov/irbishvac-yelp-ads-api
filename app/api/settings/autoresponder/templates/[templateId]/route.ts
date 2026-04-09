import { NextResponse } from "next/server";

import {
  deleteLeadAutomationTemplateWorkflow,
  updateLeadAutomationTemplateWorkflow
} from "@/features/autoresponder/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function PATCH(request: Request, context: { params: Promise<{ templateId: string }> }) {
  try {
    const user = await requireApiPermission("settings:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const { templateId } = await context.params;
    const result = await updateLeadAutomationTemplateWorkflow(user.tenantId, user.id, templateId, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ templateId: string }> }) {
  try {
    const user = await requireApiPermission("settings:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const { templateId } = await context.params;
    const result = await deleteLeadAutomationTemplateWorkflow(user.tenantId, user.id, templateId);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
