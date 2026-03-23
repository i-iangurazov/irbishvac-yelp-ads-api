import { NextResponse } from "next/server";

import { searchBusinessesForOnboarding } from "@/features/businesses/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request) {
  try {
    const user = await requireApiPermission("businesses:read");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const result = await searchBusinessesForOnboarding(user.tenantId, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
