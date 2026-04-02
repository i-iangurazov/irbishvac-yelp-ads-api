import "server-only";

import type { SyncRunType } from "@prisma/client";

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
    syncErrors
  ] = await Promise.all([
    prisma.yelpLead.count({ where: { tenantId } }),
    prisma.crmLeadMapping.count({ where: { tenantId } }),
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
