import { NextResponse } from "next/server";

import { deleteBusinessWorkflow } from "@/features/businesses/service";
import { handleRouteError, requireApiUser } from "@/lib/utils/http";

export async function DELETE(request: Request, context: { params: Promise<{ businessId: string }> }) {
  try {
    const user = await requireApiUser();

    if (user instanceof NextResponse) {
      return user;
    }

    if (user.role.code !== "ADMIN") {
      return NextResponse.json({ message: "Only Admin users can delete businesses." }, { status: 403 });
    }

    const { businessId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { confirmationText?: string };
    const result = await deleteBusinessWorkflow(user.tenantId, user.id, {
      businessId,
      confirmationText: body.confirmationText ?? ""
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
