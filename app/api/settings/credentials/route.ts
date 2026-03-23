import { NextResponse } from "next/server";

import { saveCredentialSet } from "@/features/settings/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request) {
  try {
    const user = await requireApiPermission("settings:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const saved = await saveCredentialSet(user.tenantId, user.id, body);

    return NextResponse.json(saved);
  } catch (error) {
    return handleRouteError(error);
  }
}
