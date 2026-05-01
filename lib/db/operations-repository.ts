import "server-only";

import type { Prisma, SyncRunType } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

const leadReconcileSyncTypes: SyncRunType[] = ["YELP_LEADS_WEBHOOK", "YELP_LEADS_BACKFILL"];

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
    syncErrors
  ] = await Promise.all([
    prisma.yelpLead.count({ where: { tenantId } }),
    prisma.crmLeadMapping.count({ where: { tenantId, state: { in: ["MATCHED", "MANUAL_OVERRIDE"] } } }),
    prisma.yelpLeadEvent.count({ where: { tenantId } }),
    prisma.yelpWebhookEvent.count({ where: { tenantId } }),
    prisma.location.count({ where: { tenantId } }),
    prisma.business.count({ where: { tenantId, locationId: { not: null } } }),
    prisma.serviceCategory.count({ where: { tenantId } }),
    prisma.yelpLead.count({ where: { tenantId, serviceCategoryId: { not: null } } }),
    prisma.yelpReportingJob.count({ where: { tenantId } }),
    prisma.yelpReportingSnapshot.count({ where: { tenantId } }),
    prisma.syncRun.count({ where: { tenantId } }),
    prisma.syncError.count({ where: { tenantId } })
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
    syncErrors
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
          customerName: true
        }
      },
      syncRun: {
        select: {
          id: true,
          type: true,
          status: true
        }
      }
    },
    orderBy: { receivedAt: "desc" },
    take
  });
}

function buildWebhookAttentionWhere(tenantId: string, staleBefore: Date): Prisma.YelpWebhookEventWhereInput {
  return {
    tenantId,
    OR: [
      { status: { in: ["PARTIAL", "FAILED"] } },
      {
        status: {
          in: ["QUEUED", "PROCESSING"]
        },
        receivedAt: {
          lte: staleBefore
        }
      }
    ]
  };
}

export async function getWebhookReconcileDrilldown(tenantId: string, now = new Date()) {
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1000);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [
    statusCounts,
    acceptedLast24h,
    oldestPending,
    reconcileStatusCounts,
    oldestPendingReconcile,
    reconcileCompletedLast24h,
    reconcileFailedLast24h,
    attentionEvents,
    recentEvents
  ] = await Promise.all([
    prisma.yelpWebhookEvent.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true }
    }),
    prisma.yelpWebhookEvent.count({
      where: {
        tenantId,
        receivedAt: {
          gte: last24h
        }
      }
    }),
    prisma.yelpWebhookEvent.findFirst({
      where: {
        tenantId,
        status: {
          in: ["QUEUED", "PROCESSING"]
        }
      },
      orderBy: { receivedAt: "asc" },
      select: {
        id: true,
        receivedAt: true,
        status: true
      }
    }),
    prisma.syncRun.groupBy({
      by: ["status"],
      where: {
        tenantId,
        type: {
          in: leadReconcileSyncTypes
        }
      },
      _count: { _all: true }
    }),
    prisma.syncRun.findFirst({
      where: {
        tenantId,
        type: {
          in: leadReconcileSyncTypes
        },
        status: {
          in: ["QUEUED", "PROCESSING"]
        }
      },
      select: {
        id: true,
        type: true,
        status: true,
        startedAt: true,
        createdAt: true,
        errorSummary: true
      },
      orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }]
    }),
    prisma.syncRun.count({
      where: {
        tenantId,
        type: {
          in: leadReconcileSyncTypes
        },
        status: "COMPLETED",
        startedAt: {
          gte: last24h
        }
      }
    }),
    prisma.syncRun.count({
      where: {
        tenantId,
        type: {
          in: leadReconcileSyncTypes
        },
        status: {
          in: ["PARTIAL", "FAILED"]
        },
        startedAt: {
          gte: last24h
        }
      }
    }),
    prisma.yelpWebhookEvent.findMany({
      where: buildWebhookAttentionWhere(tenantId, staleBefore),
      include: {
        lead: {
          select: {
            id: true,
            externalLeadId: true,
            externalBusinessId: true,
            customerName: true,
            business: {
              select: {
                id: true,
                name: true,
                encryptedYelpBusinessId: true
              }
            }
          }
        },
        syncRun: {
          select: {
            id: true,
            type: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            errorSummary: true,
            _count: {
              select: {
                errors: true
              }
            }
          }
        }
      },
      orderBy: [{ status: "desc" }, { receivedAt: "asc" }],
      take: 12
    }),
    prisma.yelpWebhookEvent.findMany({
      where: { tenantId },
      include: {
        lead: {
          select: {
            id: true,
            externalLeadId: true,
            externalBusinessId: true,
            customerName: true,
            business: {
              select: {
                id: true,
                name: true,
                encryptedYelpBusinessId: true
              }
            }
          }
        },
        syncRun: {
          select: {
            id: true,
            type: true,
            status: true,
            errorSummary: true,
            _count: {
              select: {
                errors: true
              }
            }
          }
        }
      },
      orderBy: { receivedAt: "desc" },
      take: 8
    })
  ]);
  const statusCountMap = new Map(statusCounts.map((entry) => [entry.status, entry._count._all]));
  const reconcileStatusCountMap = new Map(reconcileStatusCounts.map((entry) => [entry.status, entry._count._all]));
  const failedLast24h = await prisma.yelpWebhookEvent.count({
    where: {
      tenantId,
      status: {
        in: ["PARTIAL", "FAILED"]
      },
      receivedAt: {
        gte: last24h
      }
    }
  });

  return {
    counts: {
      acceptedLast24h,
      queued: statusCountMap.get("QUEUED") ?? 0,
      processing: statusCountMap.get("PROCESSING") ?? 0,
      completed: statusCountMap.get("COMPLETED") ?? 0,
      partial: statusCountMap.get("PARTIAL") ?? 0,
      failed: statusCountMap.get("FAILED") ?? 0,
      skipped: statusCountMap.get("SKIPPED") ?? 0,
      failedLast24h
    },
    reconcileCounts: {
      queued: reconcileStatusCountMap.get("QUEUED") ?? 0,
      processing: reconcileStatusCountMap.get("PROCESSING") ?? 0,
      completed: reconcileStatusCountMap.get("COMPLETED") ?? 0,
      partial: reconcileStatusCountMap.get("PARTIAL") ?? 0,
      failed: reconcileStatusCountMap.get("FAILED") ?? 0,
      skipped: reconcileStatusCountMap.get("SKIPPED") ?? 0,
      completedLast24h: reconcileCompletedLast24h,
      failedLast24h: reconcileFailedLast24h
    },
    oldestPending,
    oldestPendingReconcile,
    attentionEvents,
    recentEvents,
    staleThresholdMs: 10 * 60 * 1000
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
          crmStatusEvents: true
        }
      }
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    take
  });
}

export async function listRecentServiceCategories(tenantId: string, take = 8) {
  return prisma.serviceCategory.findMany({
    where: { tenantId },
    include: {
      _count: {
        select: {
          yelpLeads: true,
          yelpReportingSnapshots: true
        }
      }
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    take
  });
}

export async function listRecentSyncRuns(tenantId: string, take = 10, types?: SyncRunType[]) {
  return prisma.syncRun.findMany({
    where: {
      tenantId,
      ...(types?.length ? { type: { in: types } } : {})
    },
    include: {
      business: {
        select: {
          id: true,
          name: true
        }
      },
      location: {
        select: {
          id: true,
          name: true
        }
      },
      lead: {
        select: {
          id: true,
          externalLeadId: true,
          customerName: true
        }
      },
      reportingJob: {
        select: {
          id: true,
          granularity: true
        }
      },
      _count: {
        select: {
          errors: true,
          webhookEvents: true
        }
      }
    },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    take
  });
}

export async function countSyncErrors(tenantId: string, types?: SyncRunType[]) {
  return prisma.syncError.count({
    where: {
      tenantId,
      ...(types?.length
        ? {
            syncRun: {
              type: { in: types }
            }
          }
        : {})
    }
  });
}

export async function getLatestSuccessfulSyncRun(tenantId: string, types: SyncRunType[]) {
  return prisma.syncRun.findFirst({
    where: {
      tenantId,
      type: {
        in: types
      },
      status: {
        in: ["COMPLETED", "PARTIAL"]
      }
    },
    orderBy: [{ finishedAt: "desc" }, { startedAt: "desc" }]
  });
}
