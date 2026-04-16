import "server-only";

import type { WorkerJob, WorkerJobKind } from "@prisma/client";

import {
  claimWorkerJob,
  completeWorkerJob,
  failWorkerJob,
  markWorkerJobProcessing,
  summarizeWorkerError
} from "@/lib/db/worker-jobs-repository";
import { logError, logInfo } from "@/lib/utils/logging";

export type DurableWorkerTaskStatus = "SUCCEEDED" | "FAILED" | "DEAD_LETTERED" | "SKIPPED";

export type DurableWorkerTaskOutcome<T> =
  | {
      status: "SUCCEEDED";
      job: WorkerJob;
      result: T;
      durationMs: number;
    }
  | {
      status: "FAILED" | "DEAD_LETTERED";
      job: WorkerJob;
      result: null;
      errorSummary: string;
      durationMs: number;
    }
  | {
      status: "SKIPPED";
      job: WorkerJob;
      result: null;
      skippedReason: "ACTIVE_OR_NOT_DUE" | "BACKOFF" | "DEAD_LETTERED";
      durationMs: number;
    };

function buildClaimedBy() {
  return [
    process.env.VERCEL_REGION,
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    process.pid ? `pid:${process.pid}` : null
  ]
    .filter(Boolean)
    .join(":") || "cron";
}

export async function runDurableWorkerTask<T>(params: {
  kind: WorkerJobKind;
  jobKey: string;
  tenantId?: string | null;
  maxAttempts?: number;
  leaseMs?: number;
  payloadJson?: unknown;
  task: () => Promise<T>;
}): Promise<DurableWorkerTaskOutcome<T>> {
  const startedAt = Date.now();
  const claim = await claimWorkerJob({
    kind: params.kind,
    jobKey: params.jobKey,
    tenantId: params.tenantId,
    maxAttempts: params.maxAttempts,
    leaseMs: params.leaseMs,
    payloadJson: params.payloadJson,
    claimedBy: buildClaimedBy()
  });

  if (!claim.claimed) {
    logInfo("worker_job.skipped", {
      kind: params.kind,
      jobKey: params.jobKey,
      status: claim.job.status,
      skippedReason: claim.skippedReason,
      attempts: claim.job.attempts,
      maxAttempts: claim.job.maxAttempts
    });

    return {
      status: "SKIPPED",
      job: claim.job,
      result: null,
      skippedReason: claim.skippedReason,
      durationMs: Date.now() - startedAt
    };
  }

  const processingJob = await markWorkerJobProcessing(claim.job.id);

  try {
    const result = await params.task();
    const job = await completeWorkerJob(processingJob.id, result);

    logInfo("worker_job.succeeded", {
      kind: params.kind,
      jobKey: params.jobKey,
      durationMs: Date.now() - startedAt
    });

    return {
      status: "SUCCEEDED",
      job,
      result,
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    const errorSummary = summarizeWorkerError(error);
    const job = await failWorkerJob(processingJob.id, error);

    logError("worker_job.failed", {
      kind: params.kind,
      jobKey: params.jobKey,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      errorSummary,
      durationMs: Date.now() - startedAt
    });

    return {
      status: job.status === "DEAD_LETTERED" ? "DEAD_LETTERED" : "FAILED",
      job,
      result: null,
      errorSummary,
      durationMs: Date.now() - startedAt
    };
  }
}

export function summarizeDurableWorkerOutcome<T>(outcome: DurableWorkerTaskOutcome<T>) {
  return {
    status: outcome.status,
    jobId: outcome.job.id,
    jobKey: outcome.job.jobKey,
    attempts: outcome.job.attempts,
    maxAttempts: outcome.job.maxAttempts,
    durationMs: outcome.durationMs,
    ...(outcome.status === "SKIPPED" ? { skippedReason: outcome.skippedReason } : {}),
    ...(outcome.status === "FAILED" || outcome.status === "DEAD_LETTERED"
      ? { errorSummary: outcome.errorSummary }
      : {})
  };
}
