import { NextResponse } from "next/server";

import { applyBusinessOnboardingAction } from "@/features/onboarding/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  try {
    const user = await requireApiPermission("onboarding:manage");

    if (user instanceof NextResponse) {
      return user;
    }

    const { businessId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const result = await applyBusinessOnboardingAction(user.tenantId, user.id, {
      ...body,
      businessId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
