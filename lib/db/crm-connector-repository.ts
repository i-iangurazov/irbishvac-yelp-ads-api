import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { toJsonValue } from "@/lib/db/json";

const connectorSyncTypes = ["CRM_LEAD_ENRICHMENT", "LOCATION_MAPPING", "SERVICE_MAPPING"] as const;
const connectorIssueTypes = ["CRM_SYNC_FAILURE", "UNMAPPED_LEAD", "MAPPING_CONFLICT", "STALE_LEAD"] as const;

export async function getConnectorInventoryCounts(tenantId: string) {
  const [
    totalBusinesses,
    businessesWithLocation,
    totalLocations,
    locationsWithExternalReference,
    totalServiceCategories,
    serviceCategoriesWithCodes,
    mappedLeads,
    unresolvedLeadMappings,
    openConnectorIssues
  ] = await Promise.all([
    prisma.business.count({ where: { tenantId } }),
    prisma.business.count({ where: { tenantId, locationId: { not: null } } }),
    prisma.location.count({ where: { tenantId, isActive: true } }),
    prisma.location.count({
      where: {
        tenantId,
        isActive: true,
        externalCrmLocationId: {
          not: null
        }
      }
    }),
    prisma.serviceCategory.count({ where: { tenantId } }),
    prisma.serviceCategory.count({
      where: {
        tenantId,
        NOT: {
          crmCodesJson: {
            equals: []
          }
        }
      }
    }),
    prisma.crmLeadMapping.count({
      where: {
        tenantId,
        state: {
          in: ["MATCHED", "MANUAL_OVERRIDE"]
        }
      }
    }),
    prisma.crmLeadMapping.count({
      where: {
        tenantId,
        state: {
          in: ["UNRESOLVED", "CONFLICT", "ERROR"]
        }
      }
    }),
    prisma.operatorIssue.count({
      where: {
        tenantId,
        status: "OPEN",
        issueType: {
          in: [...connectorIssueTypes]
        }
      }
    })
  ]);

  return {
    totalBusinesses,
    businessesWithLocation,
    businessesWithoutLocation: Math.max(0, totalBusinesses - businessesWithLocation),
    totalLocations,
    locationsWithExternalReference,
    locationsWithoutExternalReference: Math.max(0, totalLocations - locationsWithExternalReference),
    totalServiceCategories,
    serviceCategoriesWithCodes,
    serviceCategoriesWithoutCodes: Math.max(0, totalServiceCategories - serviceCategoriesWithCodes),
    mappedLeads,
    unresolvedLeadMappings,
    openConnectorIssues
  };
}

export async function listConnectorBusinesses(tenantId: string) {
  return prisma.business.findMany({
    where: { tenantId },
    include: {
      location: {
        select: {
          id: true,
          name: true,
          externalCrmLocationId: true
        }
      },
      _count: {
        select: {
          yelpLeads: true
        }
      }
    },
    orderBy: [{ name: "asc" }]
  });
}

export async function listConnectorLocations(tenantId: string) {
  return prisma.location.findMany({
    where: {
      tenantId,
      isActive: true
    },
    include: {
      _count: {
        select: {
          businesses: true,
          yelpLeads: true,
          crmLeadMappings: true
        }
      }
    },
    orderBy: [{ name: "asc" }]
  });
}

export async function listConnectorServiceCategories(tenantId: string) {
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
    orderBy: [{ name: "asc" }]
  });
}

export async function updateBusinessLocationAssignment(tenantId: string, businessId: string, locationId: string | null) {
  return prisma.business.update({
    where: {
      id: businessId
    },
    data: {
      locationId
    },
    include: {
      location: {
        select: {
          id: true,
          name: true,
          externalCrmLocationId: true
        }
      }
    }
  });
}

export async function updateLocationConnectorReference(
  tenantId: string,
  locationId: string,
  data: {
    externalCrmLocationId: string | null;
    metadataJson?: unknown;
    rawSnapshotJson?: unknown;
  }
) {
  return prisma.location.update({
    where: {
      id: locationId
    },
    data: {
      externalCrmLocationId: data.externalCrmLocationId,
      ...(data.metadataJson !== undefined ? { metadataJson: toJsonValue(data.metadataJson) } : {}),
      ...(data.rawSnapshotJson !== undefined ? { rawSnapshotJson: toJsonValue(data.rawSnapshotJson) } : {})
    }
  });
}

export async function updateServiceCategoryConnectorCodes(
  tenantId: string,
  serviceCategoryId: string,
  data: {
    crmCodesJson: unknown;
    metadataJson?: unknown;
    rawSnapshotJson?: unknown;
  }
) {
  return prisma.serviceCategory.update({
    where: {
      id: serviceCategoryId
    },
    data: {
      crmCodesJson: toJsonValue(data.crmCodesJson),
      ...(data.metadataJson !== undefined ? { metadataJson: toJsonValue(data.metadataJson) } : {}),
      ...(data.rawSnapshotJson !== undefined ? { rawSnapshotJson: toJsonValue(data.rawSnapshotJson) } : {})
    }
  });
}

export async function createConnectorSyncRun(data: {
  tenantId: string;
  type: "LOCATION_MAPPING" | "SERVICE_MAPPING";
  correlationId: string;
  requestJson?: unknown;
}) {
  return prisma.syncRun.create({
    data: {
      tenantId: data.tenantId,
      type: data.type,
      status: "PROCESSING",
      sourceSystem: "CRM",
      capabilityKey: "hasCrmIntegration",
      correlationId: data.correlationId,
      requestJson: data.requestJson === undefined ? undefined : toJsonValue(data.requestJson)
    }
  });
}

export async function updateConnectorSyncRun(
  syncRunId: string,
  data: {
    status?: "COMPLETED" | "PARTIAL" | "FAILED";
    lastSuccessfulSyncAt?: Date | null;
    finishedAt?: Date | null;
    statsJson?: unknown;
    responseJson?: unknown;
    errorSummary?: string | null;
  }
) {
  return prisma.syncRun.update({
    where: { id: syncRunId },
    data: {
      ...(data.status ? { status: data.status } : {}),
      ...(data.lastSuccessfulSyncAt !== undefined ? { lastSuccessfulSyncAt: data.lastSuccessfulSyncAt } : {}),
      ...(data.finishedAt !== undefined ? { finishedAt: data.finishedAt } : {}),
      ...(data.statsJson !== undefined ? { statsJson: toJsonValue(data.statsJson) } : {}),
      ...(data.responseJson !== undefined ? { responseJson: toJsonValue(data.responseJson) } : {}),
      ...(data.errorSummary !== undefined ? { errorSummary: data.errorSummary } : {})
    }
  });
}

export async function createConnectorSyncError(data: {
  tenantId: string;
  syncRunId: string;
  category: string;
  code?: string | null;
  message: string;
  isRetryable?: boolean;
  detailsJson?: unknown;
}) {
  return prisma.syncError.create({
    data: {
      tenantId: data.tenantId,
      syncRunId: data.syncRunId,
      sourceSystem: "CRM",
      category: data.category,
      code: data.code ?? null,
      message: data.message,
      isRetryable: data.isRetryable ?? true,
      detailsJson: data.detailsJson === undefined ? undefined : toJsonValue(data.detailsJson)
    }
  });
}

export async function listRecentConnectorSyncRuns(tenantId: string, take = 10) {
  return prisma.syncRun.findMany({
    where: {
      tenantId,
      type: {
        in: [...connectorSyncTypes]
      }
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
      _count: {
        select: {
          errors: true
        }
      }
    },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    take
  });
}

export async function listOpenConnectorIssues(tenantId: string, take = 8) {
  return prisma.operatorIssue.findMany({
    where: {
      tenantId,
      status: "OPEN",
      issueType: {
        in: [...connectorIssueTypes]
      }
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
      syncRun: {
        select: {
          id: true,
          type: true,
          status: true
        }
      }
    },
    orderBy: [{ severity: "desc" }, { lastDetectedAt: "desc" }],
    take
  });
}

export async function findLocationByConnectorReference(tenantId: string, externalCrmLocationId: string) {
  return prisma.location.findFirst({
    where: {
      tenantId,
      externalCrmLocationId
    },
    select: {
      id: true,
      name: true,
      externalCrmLocationId: true
    }
  });
}

export async function countServiceTitanLifecycleCoverage(
  tenantId: string,
  params: {
    dueBefore: Date;
    staleBefore: Date;
  }
) {
  const resolvedWhere: Prisma.CrmLeadMappingWhereInput = {
    tenantId,
    state: {
      in: ["MATCHED", "MANUAL_OVERRIDE"]
    }
  };
  const pollableWhere: Prisma.CrmLeadMappingWhereInput = {
    ...resolvedWhere,
    OR: [
      {
        externalCrmLeadId: {
          not: null
        }
      },
      {
        externalJobId: {
          not: null
        }
      }
    ]
  };

  const [pollableLeadCount, manualOnlyMappedLeadCount, dueLeadCount, staleLeadCount] = await Promise.all([
    prisma.crmLeadMapping.count({
      where: pollableWhere
    }),
    prisma.crmLeadMapping.count({
      where: {
        ...resolvedWhere,
        externalCrmLeadId: null,
        externalJobId: null
      }
    }),
    prisma.crmLeadMapping.count({
      where: {
        ...pollableWhere,
        OR: [
          {
            lastSyncedAt: null
          },
          {
            lastSyncedAt: {
              lte: params.dueBefore
            }
          }
        ]
      }
    }),
    prisma.crmLeadMapping.count({
      where: {
        ...pollableWhere,
        OR: [
          {
            lastSyncedAt: null
          },
          {
            lastSyncedAt: {
              lte: params.staleBefore
            }
          }
        ]
      }
    })
  ]);

  return {
    pollableLeadCount,
    manualOnlyMappedLeadCount,
    dueLeadCount,
    staleLeadCount
  };
}

export async function listServiceTitanLifecycleCandidates(
  tenantId: string,
  params: {
    dueBefore?: Date;
    updatedAfter?: Date;
    take?: number;
  } = {}
) {
  const baseWhere: Prisma.CrmLeadMappingWhereInput = {
    tenantId,
    state: {
      in: ["MATCHED", "MANUAL_OVERRIDE"]
    },
    OR: [
      {
        externalCrmLeadId: {
          not: null
        }
      },
      {
        externalJobId: {
          not: null
        }
      }
    ]
  };

  const where =
    params.updatedAfter !== undefined
      ? {
          ...baseWhere,
          AND: [
            {
              OR: [
                {
                  updatedAt: {
                    gte: params.updatedAfter
                  }
                },
                {
                  matchedAt: {
                    gte: params.updatedAfter
                  }
                },
                {
                  lead: {
                    createdAtYelp: {
                      gte: params.updatedAfter
                    }
                  }
                }
              ]
            }
          ]
        }
      : params.dueBefore !== undefined
        ? {
            ...baseWhere,
            AND: [
              {
                OR: [
                  {
                    lastSyncedAt: null
                  },
                  {
                    lastSyncedAt: {
                      lte: params.dueBefore
                    }
                  }
                ]
              }
            ]
          }
        : baseWhere;

  return prisma.crmLeadMapping.findMany({
    where,
    include: {
      location: {
        select: {
          id: true,
          name: true,
          externalCrmLocationId: true
        }
      },
      lead: {
        select: {
          id: true,
          externalLeadId: true,
          customerName: true,
          businessId: true,
          locationId: true,
          internalStatus: true,
          createdAtYelp: true,
          latestInteractionAt: true,
          business: {
            select: {
              id: true,
              name: true,
              locationId: true
            }
          },
          location: {
            select: {
              id: true,
              name: true,
              externalCrmLocationId: true
            }
          },
          serviceCategory: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    },
    orderBy: [
      {
        lastSyncedAt: "asc"
      },
      {
        updatedAt: "asc"
      }
    ],
    take: params.take ?? 25
  });
}
