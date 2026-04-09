import { NextResponse } from "next/server";

import { runLeadAutomationFollowUpWorker } from "@/features/autoresponder/service";
import { handleRouteError, requireCronAuthorization } from "@/lib/utils/http";

function parseLimit(value: string | null) {
  const parsed = Number(value ?? "");

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }

  return Math.min(Math.trunc(parsed), 100);
}

export async function GET(request: Request) {
  const unauthorized = requireCronAuthorization(request);

  if (unauthorized instanceof NextResponse) {
    return unauthorized;
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get("limit"));
    const results = await runLeadAutomationFollowUpWorker(limit);

    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      limit,
      results
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
