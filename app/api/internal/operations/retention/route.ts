import { NextResponse } from "next/server";

import { runDurableWorkerTask, summarizeDurableWorkerOutcome } from "@/features/operations/worker-job-service";
import { runOperationalRetention } from "@/features/operations/retention-service";
import { handleRouteError, requireCronAuthorization } from "@/lib/utils/http";
import { logError, logInfo } from "@/lib/utils/logging";

function parseLimit(value: string | null) {
  const parsed = Number(value ?? "");

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 250;
  }

  return Math.min(Math.trunc(parsed), 1000);
}

export async function GET(request: Request) {
  const unauthorized = requireCronAuthorization(request);

  if (unauthorized instanceof NextResponse) {
    return unauthorized;
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get("limit"));
    const startedAt = Date.now();
    const outcome = await runDurableWorkerTask({
      kind: "OPERATIONS_RETENTION",
      jobKey: "operations-retention",
      payloadJson: { limit },
      leaseMs: 15 * 60_000,
      task: () => runOperationalRetention(limit)
    });
    const result = outcome.result;

    logInfo("internal.operations.retention.completed", {
      durationMs: Date.now() - startedAt,
      limit,
      counts: result?.counts ?? null,
      workerJob: summarizeDurableWorkerOutcome(outcome)
    });

    if (outcome.status === "FAILED" || outcome.status === "DEAD_LETTERED") {
      throw new Error(outcome.errorSummary);
    }

    return NextResponse.json({
      ok: true,
      ...(result ?? {}),
      workerJob: summarizeDurableWorkerOutcome(outcome)
    });
  } catch (error) {
    logError("internal.operations.retention.failed", {
      message: error instanceof Error ? error.message : "Unknown retention failure"
    });
    return handleRouteError(error);
  }
}
