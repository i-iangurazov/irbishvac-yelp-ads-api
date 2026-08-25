import "server-only";

import { Prisma, type SyncRunStatus, type SyncRunType } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function getOperationsCounts(tenantId: string) {
  const [
    totalLeads,
    mappedLeads,
    leadEvents,
    webhookEvents,
    locations,
    mappedBusinesses,
    serviceCategories,
    classifiedLeads,
    reportingJobs,
    reportingSnapshots,
    syncRuns,
    syncErrors,
  ] = await Promise.all([
    prisma.yelpLead.count({ where: { tenantId } }),
    prisma.crmLeadMapping.count({
      where: { tenantId, state: { in: ["MATCHED", "MANUAL_OVERRIDE"] } },
    }),
    prisma.yelpLeadEvent.count({ where: { tenantId } }),
    prisma.yelpWebhookEvent.count({ where: { tenantId } }),
    prisma.location.count({ where: { tenantId } }),
    prisma.business.count({ where: { tenantId, locationId: { not: null } } }),
    prisma.serviceCategory.count({ where: { tenantId } }),
    prisma.yelpLead.count({
      where: { tenantId, serviceCategoryId: { not: null } },
    }),
    prisma.yelpReportingJob.count({ where: { tenantId } }),
    prisma.yelpReportingSnapshot.count({ where: { tenantId } }),
    prisma.syncRun.count({ where: { tenantId } }),
    prisma.syncError.count({ where: { tenantId } }),
  ]);

  return {
    totalLeads,
    mappedLeads,
    leadEvents,
    webhookEvents,
    locations,
    mappedBusinesses,
    serviceCategories,
    classifiedLeads,
    reportingJobs,
    reportingSnapshots,
    syncRuns,
    syncErrors,
  };
}

export async function listRecentWebhookEvents(tenantId: string, take = 8) {
  return prisma.yelpWebhookEvent.findMany({
    where: { tenantId },
    include: {
      lead: {
        select: {
          id: true,
          externalLeadId: true,
          customerName: true,
        },
      },
      syncRun: {
        select: {
          id: true,
          type: true,
          status: true,
        },
      },
    },
    orderBy: { receivedAt: "desc" },
    take,
  });
}

type WebhookAggregate = {
  acceptedLast24h: bigint;
  queued: bigint;
  processing: bigint;
  completed: bigint;
  partial: bigint;
  failed: bigint;
  skipped: bigint;
  failedLast24h: bigint;
  oldestPendingId: string | null;
  oldestPendingReceivedAt: Date | null;
  oldestPendingStatus: string | null;
};

type ReconcileAggregate = {
  queued: bigint;
  processing: bigint;
  completed: bigint;
  partial: bigint;
  failed: bigint;
  skipped: bigint;
  completedLast24h: bigint;
  failedLast24h: bigint;
  oldestPendingId: string | null;
  oldestPendingType: string | null;
  oldestPendingStatus: string | null;
  oldestPendingStartedAt: Date | null;
  oldestPendingCreatedAt: Date | null;
  oldestPendingErrorSummary: string | null;
};

type WebhookAttentionRow = {
  id: string;
  receivedAt: Date;
  eventKey: string;
  deliveryId: string | null;
  status: string;
  errorJson: Prisma.JsonValue | null;
  leadId: string | null;
  externalLeadId: string | null;
  externalBusinessId: string | null;
  customerName: string | null;
  businessId: string | null;
  businessName: string | null;
  encryptedYelpBusinessId: string | null;
  syncRunId: string | null;
  syncRunType: string | null;
  syncRunStatus: string | null;
  syncRunStartedAt: Date | null;
  syncRunFinishedAt: Date | null;
  syncRunErrorSummary: string | null;
  syncErrorCount: bigint;
};

function toCount(value: bigint | null | undefined) {
  return Number(value ?? 0n);
}

export async function getWebhookReconcileDrilldown(
  tenantId: string,
  now = new Date(),
) {
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1000);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [webhookRows, reconcileRows, attentionRows] = await Promise.all([
    prisma.$queryRaw<WebhookAggregate[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE event."receivedAt" >= ${last24h}) AS "acceptedLast24h",
          COUNT(*) FILTER (WHERE event."status" = 'QUEUED') AS "queued",
          COUNT(*) FILTER (WHERE event."status" = 'PROCESSING') AS "processing",
          COUNT(*) FILTER (WHERE event."status" = 'COMPLETED') AS "completed",
          COUNT(*) FILTER (WHERE event."status" = 'PARTIAL') AS "partial",
          COUNT(*) FILTER (WHERE event."status" = 'FAILED') AS "failed",
          COUNT(*) FILTER (WHERE event."status" = 'SKIPPED') AS "skipped",
          COUNT(*) FILTER (
            WHERE event."status" IN ('PARTIAL', 'FAILED')
              AND event."receivedAt" >= ${last24h}
          ) AS "failedLast24h",
          pending."id" AS "oldestPendingId",
          pending."receivedAt" AS "oldestPendingReceivedAt",
          pending."status"::text AS "oldestPendingStatus"
        FROM "YelpWebhookEvent" event
        LEFT JOIN LATERAL (
          SELECT candidate."id", candidate."receivedAt", candidate."status"
          FROM "YelpWebhookEvent" candidate
          WHERE candidate."tenantId" = ${tenantId}
            AND candidate."status" IN ('QUEUED', 'PROCESSING')
          ORDER BY candidate."receivedAt" ASC
          LIMIT 1
        ) pending ON TRUE
        WHERE event."tenantId" = ${tenantId}
        GROUP BY pending."id", pending."receivedAt", pending."status"
      `),
    prisma.$queryRaw<ReconcileAggregate[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE run."status" = 'QUEUED') AS "queued",
          COUNT(*) FILTER (WHERE run."status" = 'PROCESSING') AS "processing",
          COUNT(*) FILTER (WHERE run."status" = 'COMPLETED') AS "completed",
          COUNT(*) FILTER (WHERE run."status" = 'PARTIAL') AS "partial",
          COUNT(*) FILTER (WHERE run."status" = 'FAILED') AS "failed",
          COUNT(*) FILTER (WHERE run."status" = 'SKIPPED') AS "skipped",
          COUNT(*) FILTER (
            WHERE run."status" = 'COMPLETED'
              AND run."startedAt" >= ${last24h}
          ) AS "completedLast24h",
          COUNT(*) FILTER (
            WHERE run."status" IN ('PARTIAL', 'FAILED')
              AND run."startedAt" >= ${last24h}
          ) AS "failedLast24h",
          pending."id" AS "oldestPendingId",
          pending."type"::text AS "oldestPendingType",
          pending."status"::text AS "oldestPendingStatus",
          pending."startedAt" AS "oldestPendingStartedAt",
          pending."createdAt" AS "oldestPendingCreatedAt",
          pending."errorSummary" AS "oldestPendingErrorSummary"
        FROM "SyncRun" run
        LEFT JOIN LATERAL (
          SELECT candidate."id", candidate."type", candidate."status",
            candidate."startedAt", candidate."createdAt", candidate."errorSummary"
          FROM "SyncRun" candidate
          WHERE candidate."tenantId" = ${tenantId}
            AND candidate."type" IN ('YELP_LEADS_WEBHOOK', 'YELP_LEADS_BACKFILL')
            AND candidate."status" IN ('QUEUED', 'PROCESSING')
          ORDER BY candidate."startedAt" ASC, candidate."createdAt" ASC
          LIMIT 1
        ) pending ON TRUE
        WHERE run."tenantId" = ${tenantId}
          AND run."type" IN ('YELP_LEADS_WEBHOOK', 'YELP_LEADS_BACKFILL')
        GROUP BY pending."id", pending."type", pending."status", pending."startedAt",
          pending."createdAt", pending."errorSummary"
      `),
    prisma.$queryRaw<WebhookAttentionRow[]>(Prisma.sql`
        SELECT
          event."id",
          event."receivedAt",
          event."eventKey",
          event."deliveryId",
          event."status"::text AS "status",
          event."errorJson",
          lead."id" AS "leadId",
          lead."externalLeadId",
          lead."externalBusinessId",
          lead."customerName",
          business."id" AS "businessId",
          business."name" AS "businessName",
          business."encryptedYelpBusinessId",
          run."id" AS "syncRunId",
          run."type"::text AS "syncRunType",
          run."status"::text AS "syncRunStatus",
          run."startedAt" AS "syncRunStartedAt",
          run."finishedAt" AS "syncRunFinishedAt",
          run."errorSummary" AS "syncRunErrorSummary",
          COALESCE(error_count."count", 0) AS "syncErrorCount"
        FROM "YelpWebhookEvent" event
        LEFT JOIN "YelpLead" lead ON lead."id" = event."leadId"
        LEFT JOIN "Business" business ON business."id" = lead."businessId"
        LEFT JOIN "SyncRun" run ON run."id" = event."syncRunId"
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS "count"
          FROM "SyncError" sync_error
          WHERE sync_error."syncRunId" = run."id"
        ) error_count ON TRUE
        WHERE event."tenantId" = ${tenantId}
          AND (
            event."status" IN ('PARTIAL', 'FAILED')
            OR (
              event."status" IN ('QUEUED', 'PROCESSING')
              AND event."receivedAt" <= ${staleBefore}
            )
          )
        ORDER BY event."status" DESC, event."receivedAt" ASC
        LIMIT 12
      `),
  ]);
  const webhook = webhookRows[0];
  const reconcile = reconcileRows[0];
  const oldestPending =
    webhook?.oldestPendingId &&
    webhook.oldestPendingReceivedAt &&
    webhook.oldestPendingStatus
      ? {
          id: webhook.oldestPendingId,
          receivedAt: webhook.oldestPendingReceivedAt,
          status: webhook.oldestPendingStatus as SyncRunStatus,
        }
      : null;
  const oldestPendingReconcile =
    reconcile?.oldestPendingId &&
    reconcile.oldestPendingType &&
    reconcile.oldestPendingStatus &&
    reconcile.oldestPendingStartedAt &&
    reconcile.oldestPendingCreatedAt
      ? {
          id: reconcile.oldestPendingId,
          type: reconcile.oldestPendingType as SyncRunType,
          status: reconcile.oldestPendingStatus as SyncRunStatus,
          startedAt: reconcile.oldestPendingStartedAt,
          createdAt: reconcile.oldestPendingCreatedAt,
          errorSummary: reconcile.oldestPendingErrorSummary,
        }
      : null;
  const attentionEvents = attentionRows.map((event) => ({
    id: event.id,
    receivedAt: event.receivedAt,
    eventKey: event.eventKey,
    deliveryId: event.deliveryId,
    status: event.status as SyncRunStatus,
    errorJson: event.errorJson,
    lead: event.leadId
      ? {
          id: event.leadId,
          externalLeadId: event.externalLeadId ?? "",
          externalBusinessId: event.externalBusinessId,
          customerName: event.customerName,
          business: event.businessId
            ? {
                id: event.businessId,
                name: event.businessName ?? "Unknown business",
                encryptedYelpBusinessId: event.encryptedYelpBusinessId,
              }
            : null,
        }
      : null,
    syncRun:
      event.syncRunId && event.syncRunType && event.syncRunStatus
        ? {
            id: event.syncRunId,
            type: event.syncRunType as SyncRunType,
            status: event.syncRunStatus as SyncRunStatus,
            startedAt: event.syncRunStartedAt ?? new Date(0),
            finishedAt: event.syncRunFinishedAt,
            errorSummary: event.syncRunErrorSummary,
            _count: { errors: toCount(event.syncErrorCount) },
          }
        : null,
  }));
  return {
    counts: {
      acceptedLast24h: toCount(webhook?.acceptedLast24h),
      queued: toCount(webhook?.queued),
      processing: toCount(webhook?.processing),
      completed: toCount(webhook?.completed),
      partial: toCount(webhook?.partial),
      failed: toCount(webhook?.failed),
      skipped: toCount(webhook?.skipped),
      failedLast24h: toCount(webhook?.failedLast24h),
    },
    reconcileCounts: {
      queued: toCount(reconcile?.queued),
      processing: toCount(reconcile?.processing),
      completed: toCount(reconcile?.completed),
      partial: toCount(reconcile?.partial),
      failed: toCount(reconcile?.failed),
      skipped: toCount(reconcile?.skipped),
      completedLast24h: toCount(reconcile?.completedLast24h),
      failedLast24h: toCount(reconcile?.failedLast24h),
    },
    oldestPending,
    oldestPendingReconcile,
    attentionEvents,
    recentEvents: [],
    staleThresholdMs: 10 * 60 * 1000,
  };
}

export async function listRecentLocations(tenantId: string, take = 8) {
  return prisma.location.findMany({
    where: { tenantId },
    include: {
      _count: {
        select: {
          businesses: true,
          yelpLeads: true,
          crmStatusEvents: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    take,
  });
}

export async function listRecentServiceCategories(tenantId: string, take = 8) {
  return prisma.serviceCategory.findMany({
    where: { tenantId },
    include: {
      _count: {
        select: {
          yelpLeads: true,
          yelpReportingSnapshots: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    take,
  });
}

export async function listRecentSyncRuns(
  tenantId: string,
  take = 10,
  types?: SyncRunType[],
) {
  return prisma.syncRun.findMany({
    where: {
      tenantId,
      ...(types?.length ? { type: { in: types } } : {}),
    },
    include: {
      business: {
        select: {
          id: true,
          name: true,
        },
      },
      location: {
        select: {
          id: true,
          name: true,
        },
      },
      lead: {
        select: {
          id: true,
          externalLeadId: true,
          customerName: true,
        },
      },
      reportingJob: {
        select: {
          id: true,
          granularity: true,
        },
      },
      _count: {
        select: {
          errors: true,
          webhookEvents: true,
        },
      },
    },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    take,
  });
}

export async function countSyncErrors(tenantId: string, types?: SyncRunType[]) {
  return prisma.syncError.count({
    where: {
      tenantId,
      ...(types?.length
        ? {
            syncRun: {
              type: { in: types },
            },
          }
        : {}),
    },
  });
}

export async function getLatestSuccessfulSyncRun(
  tenantId: string,
  types: SyncRunType[],
) {
  return prisma.syncRun.findFirst({
    where: {
      tenantId,
      type: {
        in: types,
      },
      status: {
        in: ["COMPLETED", "PARTIAL"],
      },
    },
    orderBy: [{ finishedAt: "desc" }, { startedAt: "desc" }],
  });
}
