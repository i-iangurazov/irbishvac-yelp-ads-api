import { NextResponse } from "next/server";

import { businessSaveSchema } from "@/features/businesses/schemas";
import { saveBusinessRecord } from "@/features/businesses/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request) {
  try {
    const user = await requireApiPermission("businesses:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = businessSaveSchema.parse(await request.json());
    const business = await saveBusinessRecord(user.tenantId, user.id, body);

    return NextResponse.json(business);
  } catch (error) {
    return handleRouteError(error);
  }
}
