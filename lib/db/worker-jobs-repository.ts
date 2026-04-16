import "server-only";

import { Prisma, type WorkerJobKind, type WorkerJobStatus } from "@prisma/client";

import { toJsonValue } from "@/lib/db/json";
import { prisma } from "@/lib/db/prisma";

const claimableFinishedStatuses: WorkerJobStatus[] = ["QUEUED", "SUCCEEDED", "FAILED", "SKIPPED"];
const claimableActiveStatuses: WorkerJobStatus[] = ["CLAIMED", "PROCESSING"];

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, 4000) ?? null
    };
  }

  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : "Unknown worker failure",
    value: String(error)
  };
}

export function summarizeWorkerError(error: unknown) {
  const serialized = serializeError(error);
  return serialized.message.slice(0, 500);
}

function getBackoffMs(attempts: number) {
  const baseMs = 60_000;
  const multiplier = 2 ** Math.max(0, attempts - 1);
  return Math.min(60 * 60_000, baseMs * multiplier);
}

export async function claimWorkerJob(params: {
  kind: WorkerJobKind;
  jobKey: string;
  tenantId?: string | null;
  maxAttempts?: number;
  leaseMs?: number;
  claimedBy?: string;
  payloadJson?: unknown;
}) {
  const now = new Date();
  const maxAttempts = params.maxAttempts ?? 3;
  const leaseMs = params.leaseMs ?? 10 * 60_000;
  const claimExpiresAt = new Date(now.getTime() + leaseMs);

  const ensured = await prisma.workerJob.upsert({
    where: { jobKey: params.jobKey },
    create: {
      tenantId: params.tenantId ?? null,
      kind: params.kind,
      jobKey: params.jobKey,
      maxAttempts,
      nextAttemptAt: now,
      payloadJson: params.payloadJson === undefined ? undefined : toJsonValue(params.payloadJson)
    },
    update: {
      kind: params.kind,
      maxAttempts,
      ...(params.tenantId !== undefined ? { tenantId: params.tenantId } : {}),
      ...(params.payloadJson !== undefined ? { payloadJson: toJsonValue(params.payloadJson) } : {})
    }
  });

  if (ensured.status === "DEAD_LETTERED") {
    return {
      claimed: false as const,
      job: ensured,
      skippedReason: "DEAD_LETTERED" as const
    };
  }

  if (ensured.status === "FAILED" && ensured.attempts >= ensured.maxAttempts) {
    const deadLettered = await prisma.workerJob.update({
      where: { id: ensured.id },
      data: {
        status: "DEAD_LETTERED",
        deadLetteredAt: now,
        finishedAt: now,
        nextAttemptAt: null,
        claimedAt: null,
        claimExpiresAt: null,
        claimedBy: null
      }
    });

    return {
      claimed: false as const,
      job: deadLettered,
      skippedReason: "DEAD_LETTERED" as const
    };
  }

  const updated = await prisma.workerJob.updateMany({
    where: {
      id: ensured.id,
      OR: [
        {
          status: { in: claimableFinishedStatuses },
          attempts: { lt: maxAttempts },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }]
        },
        {
          status: { in: claimableActiveStatuses },
          attempts: { lt: maxAttempts },
          claimExpiresAt: { lte: now }
        }
      ]
    },
    data: {
      status: "CLAIMED",
      attempts: { increment: 1 },
      claimedAt: now,
      claimExpiresAt,
      claimedBy: params.claimedBy ?? "cron",
      startedAt: null,
      finishedAt: null,
      deadLetteredAt: null,
      lastHeartbeatAt: now,
      lastErrorSummary: null,
      lastErrorJson: Prisma.JsonNull,
      resultJson: Prisma.JsonNull
    }
  });

  const job = await prisma.workerJob.findUniqueOrThrow({
    where: { id: ensured.id }
  });

  if (updated.count === 0) {
    return {
      claimed: false as const,
      job,
      skippedReason: job.status === "FAILED" ? "BACKOFF" as const : "ACTIVE_OR_NOT_DUE" as const
    };
  }

  return {
    claimed: true as const,
    job
  };
}

export async function markWorkerJobProcessing(id: string) {
  const now = new Date();

  return prisma.workerJob.update({
    where: { id },
    data: {
      status: "PROCESSING",
      startedAt: now,
      lastHeartbeatAt: now
    }
  });
}

export async function completeWorkerJob(id: string, resultJson?: unknown) {
  const now = new Date();

  return prisma.workerJob.update({
    where: { id },
    data: {
      status: "SUCCEEDED",
      attempts: 0,
      finishedAt: now,
      nextAttemptAt: now,
      claimedAt: null,
      claimExpiresAt: null,
      claimedBy: null,
      lastHeartbeatAt: now,
      lastErrorSummary: null,
      lastErrorJson: Prisma.JsonNull,
      resultJson: resultJson === undefined ? undefined : toJsonValue(resultJson)
    }
  });
}

export async function failWorkerJob(id: string, error: unknown) {
  const now = new Date();
  const current = await prisma.workerJob.findUniqueOrThrow({
    where: { id },
    select: {
      attempts: true,
      maxAttempts: true
    }
  });
  const deadLettered = current.attempts >= current.maxAttempts;
  const status: WorkerJobStatus = deadLettered ? "DEAD_LETTERED" : "FAILED";
  const nextAttemptAt = deadLettered ? null : new Date(now.getTime() + getBackoffMs(current.attempts));

  return prisma.workerJob.update({
    where: { id },
    data: {
      status,
      finishedAt: now,
      deadLetteredAt: deadLettered ? now : null,
      nextAttemptAt,
      claimedAt: null,
      claimExpiresAt: null,
      claimedBy: null,
      lastHeartbeatAt: now,
      lastErrorSummary: summarizeWorkerError(error),
      lastErrorJson: toJsonValue(serializeError(error)),
      resultJson: Prisma.JsonNull
    }
  });
}

export async function getWorkerJobOverview(tenantId: string, take = 10) {
  const where: Prisma.WorkerJobWhereInput = {
    OR: [{ tenantId }, { tenantId: null }]
  };

  const [statusCounts, recentJobs, attentionJobs] = await Promise.all([
    prisma.workerJob.groupBy({
      by: ["status"],
      where,
      _count: { _all: true }
    }),
    prisma.workerJob.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take
    }),
    prisma.workerJob.findMany({
      where: {
        ...where,
        status: {
          in: ["FAILED", "DEAD_LETTERED"]
        }
      },
      orderBy: [{ deadLetteredAt: "desc" }, { updatedAt: "desc" }],
      take
    })
  ]);

  const counts = new Map(statusCounts.map((entry) => [entry.status, entry._count._all]));

  return {
    counts: {
      queued: counts.get("QUEUED") ?? 0,
      claimed: counts.get("CLAIMED") ?? 0,
      processing: counts.get("PROCESSING") ?? 0,
      succeeded: counts.get("SUCCEEDED") ?? 0,
      failed: counts.get("FAILED") ?? 0,
      deadLettered: counts.get("DEAD_LETTERED") ?? 0,
      skipped: counts.get("SKIPPED") ?? 0
    },
    recentJobs,
    attentionJobs
  };
}
