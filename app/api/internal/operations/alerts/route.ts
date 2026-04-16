import { NextResponse } from "next/server";

import { runOperationalAlertEvaluation } from "@/features/operations/alerting-service";
import { runDurableWorkerTask, summarizeDurableWorkerOutcome } from "@/features/operations/worker-job-service";
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
    const dispatch = searchParams.get("dispatch") === "1";
    const outcome = await runDurableWorkerTask({
      kind: "OPERATIONS_ALERTS",
      jobKey: dispatch ? "operations-alerts:dispatch" : "operations-alerts:evaluate",
      payloadJson: { dispatch },
      task: () => runOperationalAlertEvaluation({ dispatch })
    });
    const result = outcome.result;

    logInfo("internal.operations.alerts.completed", {
      durationMs: Date.now() - startedAt,
      status: result?.status ?? outcome.status,
      tenantCount: result?.tenantCount ?? 0,
      alertCount: result?.results.reduce((total, tenant) => total + tenant.alerts.length, 0) ?? 0,
      dispatch,
      workerJob: summarizeDurableWorkerOutcome(outcome)
    });

    if (outcome.status === "FAILED" || outcome.status === "DEAD_LETTERED") {
      throw new Error(outcome.errorSummary);
    }

    return NextResponse.json(
      {
        ...(result ?? {}),
        workerJob: summarizeDurableWorkerOutcome(outcome)
      },
      { status: result?.status === "CRITICAL" ? 503 : 200 }
    );
  } catch (error) {
    logError("internal.operations.alerts.failed", {
      message: error instanceof Error ? error.message : "Unknown alert evaluation failure"
    });
    return handleRouteError(error);
  }
}
