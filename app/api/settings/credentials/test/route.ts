import { NextResponse } from "next/server";
import { z } from "zod";

import { testCredentialConnection } from "@/features/settings/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

const schema = z.object({
  kind: z.enum(["ADS_BASIC_AUTH", "REPORTING_FUSION", "BUSINESS_MATCH", "DATA_INGESTION"])
});

export async function POST(request: Request) {
  try {
    const user = await requireApiPermission("settings:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = schema.parse(await request.json());
    const result = await testCredentialConnection(user.tenantId, user.id, body.kind);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
