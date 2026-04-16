import { NextResponse } from "next/server";

import { runLeadAutomationFollowUpWorker } from "@/features/autoresponder/service";
import { runDurableWorkerTask, summarizeDurableWorkerOutcome } from "@/features/operations/worker-job-service";
import { handleRouteError, requireCronAuthorization } from "@/lib/utils/http";
import { logError, logInfo } from "@/lib/utils/logging";

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
    const startedAt = Date.now();
    const outcome = await runDurableWorkerTask({
      kind: "AUTORESPONDER_FOLLOWUPS",
      jobKey: "autoresponder-followups",
      payloadJson: { limit },
      task: () => runLeadAutomationFollowUpWorker(limit)
    });
    const results = outcome.result ?? [];

    logInfo("internal.autoresponder_followups.completed", {
      durationMs: Date.now() - startedAt,
      limit,
      processed: results.length,
      workerJob: summarizeDurableWorkerOutcome(outcome)
    });

    if (outcome.status === "FAILED" || outcome.status === "DEAD_LETTERED") {
      throw new Error(outcome.errorSummary);
    }

    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      limit,
      results,
      workerJob: summarizeDurableWorkerOutcome(outcome)
    });
  } catch (error) {
    logError("internal.autoresponder_followups.failed", {
      message: error instanceof Error ? error.message : "Unknown follow-up failure"
    });
    return handleRouteError(error);
  }
}
