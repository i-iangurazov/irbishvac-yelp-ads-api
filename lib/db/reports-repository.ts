import "server-only";

import type { Prisma, ReportGranularity, ReportStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function listReportRequests(tenantId: string) {
  return prisma.reportRequest.findMany({
    where: { tenantId },
    include: {
      business: true,
      results: {
        include: {
          business: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function listReportBreakdownOptions(tenantId: string) {
  const [locations, serviceCategories] = await Promise.all([
    prisma.location.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true
      },
      orderBy: [{ name: "asc" }]
    }),
    prisma.serviceCategory.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        slug: true
      },
      orderBy: [{ name: "asc" }]
    })
  ]);

  return {
    locations,
    serviceCategories
  };
}

export async function getReportRequestById(id: string, tenantId: string) {
  return prisma.reportRequest.findFirstOrThrow({
    where: { id, tenantId },
    include: {
      business: true,
      results: {
        include: {
          business: true
        }
      },
      auditEvents: {
        orderBy: { createdAt: "desc" }
      }
    }
  });
}

export async function listLeadsForReportBreakdown(
  tenantId: string,
  params: {
    businessIds: string[];
    from: Date;
    to: Date;
  }
) {
  return prisma.yelpLead.findMany({
    where: {
      tenantId,
      createdAtYelp: {
        gte: params.from,
        lte: params.to
      },
      ...(params.businessIds.length > 0
        ? {
            businessId: {
              in: params.businessIds
            }
          }
        : {})
    },
    select: {
      id: true,
      createdAtYelp: true,
      internalStatus: true,
      locationId: true,
      serviceCategoryId: true,
      business: {
        select: {
          id: true,
          locationId: true
        }
      },
      crmLeadMappings: {
        select: {
          state: true
        },
        take: 1
      }
    }
  });
}

export async function createReportRequest(
  tenantId: string,
  data: Prisma.ReportRequestUncheckedCreateInput
) {
  return prisma.reportRequest.create({
    data: {
      ...data,
      tenantId
    }
  });
}

export async function updateReportRequest(id: string, data: Prisma.ReportRequestUncheckedUpdateInput) {
  return prisma.reportRequest.update({
    where: { id },
    data
  });
}

export async function listPendingReportRequests(limit = 10) {
  return prisma.reportRequest.findMany({
    where: {
      upstreamRequestId: { not: null },
      status: {
        in: ["REQUESTED", "PROCESSING"]
      }
    },
    include: {
      results: {
        include: {
          business: true
        }
      }
    },
    orderBy: { updatedAt: "asc" },
    take: limit
  });
}

export async function upsertReportResult(
  cacheKey: string,
  data: {
    tenantId: string;
    reportRequestId: string;
    businessId?: string | null;
    granularity: ReportGranularity;
    cacheKey: string;
    payloadJson: Prisma.InputJsonValue;
    metricsSummaryJson?: Prisma.InputJsonValue;
    rawStatus?: string | null;
  }
) {
  return prisma.reportResult.upsert({
    where: { cacheKey },
    update: {
      businessId: data.businessId ?? null,
      granularity: data.granularity,
      payloadJson: data.payloadJson,
      metricsSummaryJson: data.metricsSummaryJson,
      rawStatus: data.rawStatus ?? null
    },
    create: data
  });
}

export async function countReportsByStatus(tenantId: string, status: ReportStatus) {
  return prisma.reportRequest.count({
    where: { tenantId, status }
  });
}

export async function countReportsByGranularity(tenantId: string, granularity: ReportGranularity) {
  return prisma.reportRequest.count({
    where: { tenantId, granularity }
  });
}
