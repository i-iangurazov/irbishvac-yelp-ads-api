import "server-only";

import type { CrmLeadMappingState, Prisma, ReportGranularity, ReportStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

const resolvedCrmMappingStates: CrmLeadMappingState[] = ["MATCHED", "MANUAL_OVERRIDE"];

type ReportBreakdownLeadGroupKey = {
  businessId: string | null;
  locationId: string | null;
  serviceCategoryId: string | null;
  internalStatus: string;
};

function buildLeadBreakdownWhere(
  tenantId: string,
  params: {
    businessIds: string[];
    from: Date;
    to: Date;
    locationId?: string | null;
    serviceCategoryId?: string | null;
  }
): Prisma.YelpLeadWhereInput {
  return {
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
      : {}),
    ...(params.locationId
      ? {
          OR: [
            {
              locationId: params.locationId
            },
            {
              locationId: null,
              business: {
                locationId: params.locationId
              }
            }
          ]
        }
      : {}),
    ...(params.serviceCategoryId
      ? {
          serviceCategoryId: params.serviceCategoryId
        }
      : {})
  };
}

function getLeadGroupKey(group: ReportBreakdownLeadGroupKey) {
  return [
    group.businessId ?? "unknown-business",
    group.locationId ?? "unknown-location",
    group.serviceCategoryId ?? "unknown-service",
    group.internalStatus
  ].join("|");
}

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

export async function listReportRequestSummaries(
  tenantId: string,
  params?: {
    skip?: number;
    take?: number;
  }
) {
  return prisma.reportRequest.findMany({
    where: { tenantId },
    select: {
      id: true,
      businessId: true,
      granularity: true,
      status: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      business: {
        select: {
          id: true,
          name: true
        }
      },
      results: {
        select: {
          fetchedAt: true
        },
        orderBy: {
          fetchedAt: "desc"
        },
        take: 1
      }
    },
    orderBy: { createdAt: "desc" },
    ...(params?.skip !== undefined ? { skip: params.skip } : {}),
    ...(params?.take !== undefined ? { take: params.take } : {})
  });
}

export async function countReportRequests(tenantId: string) {
  return prisma.reportRequest.count({
    where: { tenantId }
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
    locationId?: string | null;
    serviceCategoryId?: string | null;
  }
) {
  return prisma.yelpLead.findMany({
    where: buildLeadBreakdownWhere(tenantId, params),
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

export async function listLeadAggregatesForReportBreakdown(
  tenantId: string,
  params: {
    businessIds: string[];
    from: Date;
    to: Date;
    locationId?: string | null;
    serviceCategoryId?: string | null;
  }
) {
  const where = buildLeadBreakdownWhere(tenantId, params);
  const groupBy: Prisma.YelpLeadScalarFieldEnum[] = ["businessId", "locationId", "serviceCategoryId", "internalStatus"];
  const [totalGroups, mappedGroups] = await Promise.all([
    prisma.yelpLead.groupBy({
      by: groupBy,
      where,
      _count: {
        id: true
      }
    }),
    prisma.yelpLead.groupBy({
      by: groupBy,
      where: {
        ...where,
        crmLeadMappings: {
          some: {
            state: {
              in: resolvedCrmMappingStates
            }
          }
        }
      },
      _count: {
        id: true
      }
    })
  ]);
  const businessIds = [
    ...new Set(totalGroups.map((group) => group.businessId).filter((businessId): businessId is string => Boolean(businessId)))
  ];
  const businesses =
    businessIds.length > 0
      ? await prisma.business.findMany({
          where: {
            tenantId,
            id: {
              in: businessIds
            }
          },
          select: {
            id: true,
            locationId: true
          }
        })
      : [];
  const businessLocationById = new Map(businesses.map((business) => [business.id, business.locationId]));
  const mappedCountByKey = new Map(
    mappedGroups.map((group) => [
      getLeadGroupKey(group),
      group._count.id
    ])
  );

  return totalGroups.map((group) => ({
    locationId: group.locationId ?? (group.businessId ? businessLocationById.get(group.businessId) ?? null : null),
    serviceCategoryId: group.serviceCategoryId,
    internalStatus: group.internalStatus,
    totalLeads: group._count.id,
    mappedLeads: mappedCountByKey.get(getLeadGroupKey(group)) ?? 0
  }));
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
