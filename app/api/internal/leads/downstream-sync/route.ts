import { NextResponse } from "next/server";

import { syncLeadDownstreamStatusWorkflow } from "@/features/crm-enrichment/service";
import { handleRouteError, requireCronAuthorization } from "@/lib/utils/http";

export async function POST(request: Request) {
  const unauthorized = requireCronAuthorization(request);

  if (unauthorized instanceof NextResponse) {
    return unauthorized;
  }

  try {
    const body = await request.json();
    const result = await syncLeadDownstreamStatusWorkflow(body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
