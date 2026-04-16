import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { toJsonValue } from "@/lib/db/json";

const leadSyncTypes = ["YELP_LEADS_WEBHOOK", "YELP_LEADS_BACKFILL"] as const;

type OperatorIssueListFilters = {
  issueType?: string;
  businessId?: string;
  locationId?: string;
  severity?: string;
  status?: string;
  olderThanDays?: number;
};

function buildOperatorIssueWhere(tenantId: string, filters?: OperatorIssueListFilters): Prisma.OperatorIssueWhereInput {
  return {
    tenantId,
    ...(filters?.issueType ? { issueType: filters.issueType as never } : {}),
    ...(filters?.businessId ? { businessId: filters.businessId } : {}),
    ...(filters?.locationId ? { locationId: filters.locationId } : {}),
    ...(filters?.severity ? { severity: filters.severity as never } : {}),
    ...(filters?.status ? { status: filters.status as never } : {}),
    ...(filters?.olderThanDays
      ? {
          firstDetectedAt: {
            lte: new Date(Date.now() - filters.olderThanDays * 24 * 60 * 60 * 1000)
          }
        }
      : {})
  };
}

export async function listExistingOperatorIssues(tenantId: string) {
  return prisma.operatorIssue.findMany({
    where: { tenantId },
    select: {
      id: true,
      dedupeKey: true,
      status: true,
      detectedCount: true
    }
  });
}

export async function createOperatorIssue(
  tenantId: string,
  data: Omit<Prisma.OperatorIssueUncheckedCreateInput, "tenantId">
) {
  return prisma.operatorIssue.create({
    data: {
      ...data,
      tenantId
    }
  });
}

export async function getOperatorIssueByDedupeKey(tenantId: string, dedupeKey: string) {
  return prisma.operatorIssue.findUnique({
    where: {
      tenantId_dedupeKey: {
        tenantId,
        dedupeKey
      }
    }
  });
}

export async function updateOperatorIssue(id: string, data: Parameters<typeof prisma.operatorIssue.update>[0]["data"]) {
  return prisma.operatorIssue.update({
    where: { id },
    data
  });
}

export async function getOperatorIssueById(tenantId: string, issueId: string) {
  return prisma.operatorIssue.findFirstOrThrow({
    where: {
      tenantId,
      id: issueId
    },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          encryptedYelpBusinessId: true
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
          customerName: true,
          customerEmail: true,
          internalStatus: true,
          replyState: true,
          latestInteractionAt: true,
          business: {
            select: {
              id: true,
              name: true
            }
          }
        }
      },
      reportRequest: {
        select: {
          id: true,
          status: true,
          granularity: true,
          startDate: true,
          endDate: true,
          business: {
            select: {
              id: true,
              name: true
            }
          }
        }
      },
      reportScheduleRun: {
        include: {
          schedule: {
            select: {
              id: true,
              name: true,
              cadence: true
            }
          },
          location: {
            select: {
              id: true,
              name: true
            }
          },
          reportRequest: {
            select: {
              id: true,
              status: true
            }
          }
        }
      },
      syncRun: {
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
          errors: true
        }
      },
      resolvedBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      ignoredBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });
}

export async function listOperatorIssues(
  tenantId: string,
  filters?: OperatorIssueListFilters & {
    skip?: number;
    take?: number;
  }
) {
  return prisma.operatorIssue.findMany({
    where: buildOperatorIssueWhere(tenantId, filters),
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
      reportScheduleRun: {
        include: {
          schedule: {
            select: {
              id: true,
              name: true
            }
          }
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
    orderBy: [
      { status: "asc" },
      { severity: "desc" },
      { lastDetectedAt: "desc" },
      { createdAt: "desc" }
    ],
    ...(filters?.skip !== undefined ? { skip: filters.skip } : {}),
    ...(filters?.take !== undefined ? { take: filters.take } : {})
  });
}

export async function countOperatorIssues(tenantId: string, filters?: OperatorIssueListFilters) {
  return prisma.operatorIssue.count({
    where: buildOperatorIssueWhere(tenantId, filters)
  });
}

export async function getOperatorIssueSummaryCounts(tenantId: string) {
  const [total, open, highSeverity, retryableOpen, deliveryFailures, unmappedLeads, staleLeads] = await Promise.all([
    prisma.operatorIssue.count({
      where: {
        tenantId
      }
    }),
    prisma.operatorIssue.count({
      where: {
        tenantId,
        status: "OPEN"
      }
    }),
    prisma.operatorIssue.count({
      where: {
        tenantId,
        status: "OPEN",
        severity: {
          in: ["HIGH", "CRITICAL"]
        }
      }
    }),
    prisma.operatorIssue.count({
      where: {
        tenantId,
        status: "OPEN",
        issueType: {
          in: ["LEAD_SYNC_FAILURE", "CRM_SYNC_FAILURE", "AUTORESPONDER_FAILURE", "REPORT_DELIVERY_FAILURE"]
        }
      }
    }),
    prisma.operatorIssue.count({
      where: {
        tenantId,
        issueType: "REPORT_DELIVERY_FAILURE",
        status: "OPEN"
      }
    }),
    prisma.operatorIssue.count({
      where: {
        tenantId,
        issueType: "UNMAPPED_LEAD",
        status: "OPEN"
      }
    }),
    prisma.operatorIssue.count({
      where: {
        tenantId,
        issueType: "STALE_LEAD",
        status: "OPEN"
      }
    })
  ]);

  return {
    total,
    open,
    highSeverity,
    retryableOpen,
    deliveryFailures,
    unmappedLeads,
    staleLeads
  };
}

export async function listOperatorIssuesByIds(tenantId: string, issueIds: string[]) {
  return prisma.operatorIssue.findMany({
    where: {
      tenantId,
      id: {
        in: issueIds
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
      reportScheduleRun: {
        include: {
          schedule: {
            select: {
              id: true,
              name: true
            }
          }
        }
      },
      syncRun: {
        select: {
          id: true,
          type: true,
          status: true
        }
      }
    }
  });
}

export async function listOperatorIssueFilterOptions(tenantId: string) {
  const [businesses, locations] = await Promise.all([
    prisma.business.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true
      },
      orderBy: [{ name: "asc" }]
    }),
    prisma.location.findMany({
      where: {
        tenantId,
        isActive: true
      },
      select: {
        id: true,
        name: true
      },
      orderBy: [{ name: "asc" }]
    })
  ]);

  return {
    businesses,
    locations
  };
}

export async function listOpenOperatorIssuesForLeadIds(tenantId: string, leadIds: string[]) {
  if (leadIds.length === 0) {
    return [];
  }

  return prisma.operatorIssue.findMany({
    where: {
      tenantId,
      status: "OPEN",
      leadId: {
        in: leadIds
      }
    },
    select: {
      id: true,
      leadId: true,
      issueType: true,
      severity: true,
      summary: true,
      lastDetectedAt: true
    },
    orderBy: [{ severity: "desc" }, { lastDetectedAt: "desc" }, { createdAt: "desc" }]
  });
}

export async function listOpenOperatorIssuesForLead(tenantId: string, leadId: string, take = 10) {
  return prisma.operatorIssue.findMany({
    where: {
      tenantId,
      status: "OPEN",
      leadId
    },
    select: {
      id: true,
      issueType: true,
      severity: true,
      summary: true,
      lastDetectedAt: true,
      syncRunId: true
    },
    orderBy: [{ severity: "desc" }, { lastDetectedAt: "desc" }, { createdAt: "desc" }],
    take
  });
}

export async function listOpenOperatorIssuesForReportScheduleRunIds(tenantId: string, runIds: string[]) {
  if (runIds.length === 0) {
    return [];
  }

  return prisma.operatorIssue.findMany({
    where: {
      tenantId,
      status: "OPEN",
      reportScheduleRunId: {
        in: runIds
      }
    },
    select: {
      id: true,
      reportScheduleRunId: true,
      issueType: true,
      severity: true,
      summary: true,
      lastDetectedAt: true
    },
    orderBy: [{ severity: "desc" }, { lastDetectedAt: "desc" }, { createdAt: "desc" }]
  });
}

export async function listLeadSyncFailureCandidates(tenantId: string) {
  return prisma.syncRun.findMany({
    where: {
      tenantId,
      type: {
        in: [...leadSyncTypes]
      },
      status: {
        in: ["FAILED", "PARTIAL"]
      }
    },
    include: {
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
          name: true
        }
      },
      lead: {
        select: {
          id: true,
          externalLeadId: true,
          customerName: true,
          businessId: true,
          locationId: true
        }
      },
      errors: {
        orderBy: [{ occurredAt: "desc" }],
        take: 3
      }
    },
    orderBy: [{ startedAt: "desc" }]
  });
}

export async function listUnmappedLeadCandidates(tenantId: string) {
  return prisma.yelpLead.findMany({
    where: {
      tenantId,
      OR: [
        {
          crmLeadMappings: {
            none: {}
          }
        },
        {
          crmLeadMappings: {
            some: {
              state: "UNRESOLVED"
            }
          }
        }
      ]
    },
    include: {
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
          name: true
        }
      },
      serviceCategory: {
        select: {
          id: true,
          name: true
        }
      },
      crmLeadMappings: {
        take: 1
      }
    },
    orderBy: [{ createdAtYelp: "desc" }]
  });
}

export async function listCrmSyncFailureCandidates(tenantId: string) {
  return prisma.syncRun.findMany({
    where: {
      tenantId,
      type: {
        in: ["CRM_LEAD_ENRICHMENT", "LOCATION_MAPPING", "SERVICE_MAPPING"]
      },
      status: {
        in: ["FAILED", "PARTIAL"]
      }
    },
    include: {
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
          name: true
        }
      },
      lead: {
        select: {
          id: true,
          externalLeadId: true,
          customerName: true,
          businessId: true,
          locationId: true
        }
      },
      errors: {
        orderBy: [{ occurredAt: "desc" }],
        take: 3
      }
    },
    orderBy: [{ startedAt: "desc" }]
  });
}

export async function listStaleLifecycleSyncCandidates(tenantId: string, staleBefore: Date) {
  return prisma.crmLeadMapping.findMany({
    where: {
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
      ],
      AND: [
        {
          OR: [
            {
              lastSyncedAt: null
            },
            {
              lastSyncedAt: {
                lte: staleBefore
              }
            }
          ]
        }
      ]
    },
    include: {
      lead: {
        include: {
          business: {
            select: {
              id: true,
              name: true,
              locationId: true
            }
          },
          serviceCategory: {
            select: {
              id: true,
              name: true
            }
          }
        }
      },
      location: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: [{ lastSyncedAt: "asc" }, { updatedAt: "asc" }]
  });
}

export async function listMappingConflictCandidates(tenantId: string) {
  return prisma.crmLeadMapping.findMany({
    where: {
      tenantId,
      state: "CONFLICT"
    },
    include: {
      lead: {
        include: {
          business: {
            select: {
              id: true,
              name: true,
              locationId: true
            }
          }
        }
      },
      location: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: [{ updatedAt: "desc" }]
  });
}

export async function listAutoresponderFailureCandidates(tenantId: string, pendingBefore: Date) {
  return prisma.leadAutomationAttempt.findMany({
    where: {
      tenantId,
      OR: [
        {
          status: "FAILED"
        },
        {
          status: "PENDING",
          OR: [
            {
              dueAt: {
                lte: pendingBefore
              }
            },
            {
              dueAt: null,
              triggeredAt: {
                lte: pendingBefore
              }
            }
          ]
        }
      ]
    },
    include: {
      lead: {
        include: {
          business: {
            select: {
              id: true,
              name: true,
              locationId: true
            }
          }
        }
      },
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
          name: true
        }
      },
      serviceCategory: {
        select: {
          id: true,
          name: true
        }
      },
      rule: {
        select: {
          id: true,
          name: true,
          cadence: true
        }
      },
      template: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: [{ dueAt: "asc" }, { triggeredAt: "desc" }]
  });
}

export async function listReportDeliveryFailureCandidates(tenantId: string) {
  return prisma.reportScheduleRun.findMany({
    where: {
      tenantId,
      OR: [
        {
          generationStatus: "FAILED"
        },
        {
          deliveryStatus: "FAILED"
        }
      ]
    },
    include: {
      schedule: {
        select: {
          id: true,
          name: true,
          cadence: true
        }
      },
      location: {
        select: {
          id: true,
          name: true
        }
      },
      reportRequest: {
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          business: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    },
    orderBy: [{ scheduledFor: "desc" }, { createdAt: "desc" }]
  });
}

export async function listStaleLeadCandidates(tenantId: string, staleBefore: Date) {
  return prisma.yelpLead.findMany({
    where: {
      tenantId,
      internalStatus: {
        in: ["ACTIVE", "NEW", "CONTACTED", "BOOKED", "SCHEDULED", "JOB_IN_PROGRESS"]
      },
      OR: [
        {
          latestInteractionAt: {
            lte: staleBefore
          }
        },
        {
          latestInteractionAt: null,
          createdAtYelp: {
            lte: staleBefore
          }
        }
      ]
    },
    include: {
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
          name: true
        }
      },
      serviceCategory: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: [{ latestInteractionAt: "asc" }, { createdAtYelp: "asc" }]
  });
}

export async function listIssueAuditContext(tenantId: string, correlationId: string, take = 25) {
  return prisma.auditEvent.findMany({
    where: {
      tenantId,
      correlationId
    },
    include: {
      actor: true,
      business: true,
      program: true,
      reportRequest: true
    },
    orderBy: [{ createdAt: "desc" }],
    take
  });
}

export async function updateOperatorIssueDetails(id: string, detailsJson: unknown) {
  return prisma.operatorIssue.update({
    where: { id },
    data: {
      detailsJson: toJsonValue(detailsJson)
    }
  });
}
