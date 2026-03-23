import { NextResponse } from "next/server";

import { createProgramWorkflow, getProgramsIndex } from "@/features/ads-programs/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function GET() {
  try {
    const user = await requireApiPermission("programs:read");

    if (user instanceof NextResponse) {
      return user;
    }

    const programs = await getProgramsIndex(user.tenantId);

    return NextResponse.json(programs);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiPermission("programs:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const result = await createProgramWorkflow(user.tenantId, user.id, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
