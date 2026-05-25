import { NextResponse } from "next/server";

import { refreshOperatorIssues } from "@/features/issues/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST() {
  const user = await requireApiPermission("sync:retry");

  if (user instanceof NextResponse) {
    return user;
  }

  try {
    await refreshOperatorIssues(user.tenantId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
