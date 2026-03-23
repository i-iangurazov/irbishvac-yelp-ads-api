import { NextResponse } from "next/server";
import { z } from "zod";

import { saveUserRole } from "@/features/settings/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

const schema = z.object({
  userId: z.string().min(1),
  roleCode: z.enum(["ADMIN", "OPERATOR", "ANALYST", "VIEWER"])
});

export async function PATCH(request: Request) {
  try {
    const user = await requireApiPermission("settings:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = schema.parse(await request.json());
    const updated = await saveUserRole(user.tenantId, user.id, body.userId, body.roleCode);

    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
