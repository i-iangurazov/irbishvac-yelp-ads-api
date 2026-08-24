import { NextResponse } from "next/server";

import { createClientTenantWorkflow } from "@/features/onboarding/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request) {
  try {
    const user = await requireApiPermission("tenants:manage");

    if (user instanceof NextResponse) {
      return user;
    }

    const result = await createClientTenantWorkflow(
      user.id,
      await request.json(),
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
