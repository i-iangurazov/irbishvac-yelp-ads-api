import { NextResponse } from "next/server";

import { runOperationalCanaries } from "@/features/operations/canary-service";
import { handleRouteError, requireCronAuthorization } from "@/lib/utils/http";
import { logError, logInfo } from "@/lib/utils/logging";

export async function GET(request: Request) {
  const unauthorized = requireCronAuthorization(request);

  if (unauthorized instanceof NextResponse) {
    return unauthorized;
  }

  try {
    const { searchParams } = new URL(request.url);
    const startedAt = Date.now();
    const result = await runOperationalCanaries({
      includeHttpChecks: searchParams.get("http") === "1"
    });

    logInfo("internal.operations.canary.completed", {
      durationMs: Date.now() - startedAt,
      status: result.status,
      failedChecks: result.checks.filter((check) => check.status === "FAIL").length
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    logError("internal.operations.canary.failed", {
      message: error instanceof Error ? error.message : "Unknown canary failure"
    });
    return handleRouteError(error);
  }
}
