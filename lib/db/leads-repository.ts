import "server-only";

import type { Prisma, RecordSourceSystem, SyncRunStatus, SyncRunType } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { toJsonValue } from "@/lib/db/json";

type LeadRecordFilters = {
  businessId?: string;
  status?: SyncRunStatus | "NOT_RECEIVED";
  attention?: "NEEDS_ATTENTION";
  mappingState?: string;
  internalStatus?: string;
  from?: Date;
  to?: Date;
};

function buildLeadAttentionWhere(): Prisma.YelpLeadWhereInput {
  return {
    OR: [
      {
        latestWebhookStatus: {
          in: ["FAILED", "PARTIAL"]
        }
      },
      {
        webhookEvents: {
          some: {
            status: {
              in: ["FAILED", "PARTIAL"]
            }
          }
        }
      },
      {
        crmLeadMappings: {
          none: {}
        }
      },
      {
        crmLeadMappings: {
          some: {
            state: {
              in: ["UNRESOLVED", "CONFLICT", "ERROR"]
            }
          }
        }
      },
      {
        syncRuns: {
          some: {
            type: "CRM_LEAD_ENRICHMENT",
            status: {
              in: ["FAILED", "PARTIAL"]
            }
          }
        }
      },
      {
        automationAttempts: {
          some: {
            status: "FAILED"
          }
        }
      },
      {
        operatorIssues: {
          some: {
            status: "OPEN"
          }
        }
      }
    ]
  };
}

function buildLeadRecordWhere(tenantId: string, filters?: LeadRecordFilters): Prisma.YelpLeadWhereInput {
  const and: Prisma.YelpLeadWhereInput[] = [{ tenantId }];

  if (filters?.businessId) {
    and.push({ businessId: filters.businessId });
  }

  if (filters?.status) {
    if (filters.status === "NOT_RECEIVED") {
      and.push({
        latestWebhookStatus: null,
        lastSyncedAt: null
      });
    } else if (filters.status === "COMPLETED") {
      and.push({
        OR: [
          { latestWebhookStatus: "COMPLETED" },
          {
            latestWebhookStatus: null,
            lastSyncedAt: {
              not: null
            }
          }
        ]
      });
    } else {
      and.push({
        latestWebhookStatus: filters.status
      });
    }
  }

  if (filters?.attention) {
    and.push(buildLeadAttentionWhere());
  }

  if (filters?.mappingState) {
    and.push({
      crmLeadMappings: {
        some: {
          state: filters.mappingState as never
        }
      }
    });
  }

  if (filters?.internalStatus) {
    and.push({ internalStatus: filters.internalStatus as never });
  }

  if (filters?.from || filters?.to) {
    and.push({
      createdAtYelp: {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {})
      }
    });
  }

  return and.length === 1 ? and[0] : { AND: and };
}

export async function findBusinessesByExternalYelpBusinessId(externalBusinessId: string) {
  return prisma.business.findMany({
    where: {
      encryptedYelpBusinessId: externalBusinessId
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      encryptedYelpBusinessId: true,
      locationId: true
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
}

export async function findLeadRecordByExternalLeadId(tenantId: string, externalLeadId: string) {
  return prisma.yelpLead.findUnique({
    where: {
      tenantId_externalLeadId: {
        tenantId,
        externalLeadId
      }
    },
    select: {
      id: true,
      internalStatus: true,
      firstSeenAt: true,
      locationId: true,
      serviceCategoryId: true,
      mappedServiceLabel: true
    }
  });
}

export async function findWebhookEventByKey(tenantId: string, eventKey: string) {
  return prisma.yelpWebhookEvent.findUnique({
    where: {
      tenantId_eventKey: {
        tenantId,
        eventKey
      }
    },
    include: {
      syncRun: {
        include: {
          errors: true
        }
      }
    }
  });
}

export async function createLeadSyncRun(data: {
  tenantId: string;
  businessId?: string | null;
  leadId?: string | null;
  type?: SyncRunType;
  status?: SyncRunStatus;
  capabilityKey?: string | null;
  correlationId?: string | null;
  requestJson?: unknown;
}) {
  return prisma.syncRun.create({
    data: {
      tenantId: data.tenantId,
      businessId: data.businessId ?? null,
      leadId: data.leadId ?? null,
      type: data.type ?? "YELP_LEADS_WEBHOOK",
      status: data.status ?? "PROCESSING",
      sourceSystem: "YELP",
      capabilityKey: data.capabilityKey ?? null,
      correlationId: data.correlationId ?? null,
      requestJson: data.requestJson === undefined ? undefined : toJsonValue(data.requestJson)
    }
  });
}

export async function updateLeadSyncRun(
  id: string,
  data: {
    status?: SyncRunStatus;
    businessId?: string | null;
    leadId?: string | null;
    finishedAt?: Date | null;
    lastSuccessfulSyncAt?: Date | null;
    statsJson?: unknown;
    responseJson?: unknown;
    errorSummary?: string | null;
  }
) {
  return prisma.syncRun.update({
    where: { id },
    data: {
      ...(data.status ? { status: data.status } : {}),
      ...(data.businessId !== undefined ? { businessId: data.businessId } : {}),
      ...(data.leadId !== undefined ? { leadId: data.leadId } : {}),
      ...(data.finishedAt !== undefined ? { finishedAt: data.finishedAt } : {}),
      ...(data.lastSuccessfulSyncAt !== undefined ? { lastSuccessfulSyncAt: data.lastSuccessfulSyncAt } : {}),
      ...(data.statsJson !== undefined ? { statsJson: toJsonValue(data.statsJson) } : {}),
      ...(data.responseJson !== undefined ? { responseJson: toJsonValue(data.responseJson) } : {}),
      ...(data.errorSummary !== undefined ? { errorSummary: data.errorSummary } : {})
    }
  });
}

export async function createLeadSyncError(data: {
  tenantId: string;
  syncRunId: string;
  sourceSystem?: RecordSourceSystem;
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
      sourceSystem: data.sourceSystem ?? "YELP",
      category: data.category,
      code: data.code ?? null,
      message: data.message,
      isRetryable: data.isRetryable ?? true,
      detailsJson: data.detailsJson === undefined ? undefined : toJsonValue(data.detailsJson)
    }
  });
}

export async function createWebhookEventRecord(data: {
  tenantId: string;
  syncRunId: string;
  leadId?: string | null;
  eventKey: string;
  deliveryId?: string | null;
  topic: string;
  status?: SyncRunStatus;
  signatureVerified?: boolean;
  headersJson?: unknown;
  payloadJson: unknown;
  errorJson?: unknown;
}) {
  return prisma.yelpWebhookEvent.create({
    data: {
      tenantId: data.tenantId,
      syncRunId: data.syncRunId,
      leadId: data.leadId ?? null,
      eventKey: data.eventKey,
      deliveryId: data.deliveryId ?? null,
      topic: data.topic,
      status: data.status ?? "PROCESSING",
      signatureVerified: data.signatureVerified ?? false,
      headersJson: data.headersJson === undefined ? undefined : toJsonValue(data.headersJson),
      payloadJson: toJsonValue(data.payloadJson),
      errorJson: data.errorJson === undefined ? undefined : toJsonValue(data.errorJson)
    }
  });
}

export async function updateWebhookEventRecord(
  id: string,
  data: {
    leadId?: string | null;
    syncRunId?: string | null;
    deliveryId?: string | null;
    status?: SyncRunStatus;
    processedAt?: Date | null;
    headersJson?: unknown;
    payloadJson?: unknown;
    errorJson?: unknown;
  }
) {
  return prisma.yelpWebhookEvent.update({
    where: { id },
    data: {
      ...(data.leadId !== undefined ? { leadId: data.leadId } : {}),
      ...(data.syncRunId !== undefined ? { syncRunId: data.syncRunId } : {}),
      ...(data.deliveryId !== undefined ? { deliveryId: data.deliveryId } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.processedAt !== undefined ? { processedAt: data.processedAt } : {}),
      ...(data.headersJson !== undefined ? { headersJson: toJsonValue(data.headersJson) } : {}),
      ...(data.payloadJson !== undefined ? { payloadJson: toJsonValue(data.payloadJson) } : {}),
      ...(data.errorJson !== undefined ? { errorJson: toJsonValue(data.errorJson) } : {})
    }
  });
}

export async function listLeadWebhookSyncRunsForReconcile(limit = 20) {
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
  const candidateWhere = {
    type: "YELP_LEADS_WEBHOOK",
    OR: [
      {
        status: {
          in: ["QUEUED", "FAILED"]
        }
      },
      {
        status: "PROCESSING",
        updatedAt: {
          lte: staleBefore
        }
      }
    ]
  } satisfies Prisma.SyncRunWhereInput;
  const syncRunSelect = {
    id: true,
    tenantId: true,
    status: true,
    statsJson: true,
    updatedAt: true,
    errors: {
      orderBy: [{ occurredAt: "desc" }],
      take: 1
    }
  } satisfies Prisma.SyncRunSelect;

  const mappedRuns = await prisma.syncRun.findMany({
    where: {
      ...candidateWhere,
      businessId: {
        not: null
      }
    },
    select: syncRunSelect,
    orderBy: [{ createdAt: "desc" }, { startedAt: "desc" }],
    take: limit
  });

  if (mappedRuns.length >= limit) {
    return mappedRuns;
  }

  const unmappedRuns = await prisma.syncRun.findMany({
    where: {
      ...candidateWhere,
      businessId: null
    },
    select: syncRunSelect,
    orderBy: [{ createdAt: "desc" }, { startedAt: "desc" }],
    take: limit - mappedRuns.length
  });

  return [...mappedRuns, ...unmappedRuns];
}

export async function claimLeadWebhookSyncRunForProcessing(
  tenantId: string,
  syncRunId: string,
  now: Date,
  staleBefore = new Date(now.getTime() - 15 * 60 * 1000)
) {
  const result = await prisma.syncRun.updateMany({
    where: {
      id: syncRunId,
      tenantId,
      type: "YELP_LEADS_WEBHOOK",
      OR: [
        {
          status: "QUEUED"
        },
        {
          status: "PROCESSING",
          updatedAt: {
            lte: staleBefore
          }
        }
      ]
    },
    data: {
      status: "PROCESSING",
      finishedAt: null,
      errorSummary: null
    }
  });

  return result.count > 0;
}

export async function getLeadSyncRunById(tenantId: string, syncRunId: string) {
  return prisma.syncRun.findFirstOrThrow({
    where: {
      tenantId,
      id: syncRunId,
      type: {
        in: ["YELP_LEADS_WEBHOOK", "YELP_LEADS_BACKFILL"]
      }
    },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          encryptedYelpBusinessId: true,
          locationId: true
        }
      },
      lead: {
        select: {
          id: true,
          externalLeadId: true,
          customerName: true
        }
      },
      webhookEvents: {
        orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
        take: 1
      },
      errors: {
        orderBy: [{ occurredAt: "desc" }]
      }
    }
  });
}

export async function upsertLeadRecord(
  tenantId: string,
  externalLeadId: string,
  data: Omit<Prisma.YelpLeadUncheckedCreateInput, "tenantId" | "externalLeadId">
) {
  return prisma.yelpLead.upsert({
    where: {
      tenantId_externalLeadId: {
        tenantId,
        externalLeadId
      }
    },
    update: {
      ...data
    },
    create: {
      tenantId,
      externalLeadId,
      ...data
    }
  });
}

export async function updateLeadWebhookSnapshot(
  tenantId: string,
  leadId: string,
  data: {
    latestWebhookStatus?: SyncRunStatus | null;
    latestWebhookReceivedAt?: Date | null;
    latestWebhookErrorSummary?: string | null;
  }
) {
  return prisma.yelpLead.updateMany({
    where: {
      tenantId,
      id: leadId
    },
    data: {
      ...(data.latestWebhookStatus !== undefined ? { latestWebhookStatus: data.latestWebhookStatus } : {}),
      ...(data.latestWebhookReceivedAt !== undefined ? { latestWebhookReceivedAt: data.latestWebhookReceivedAt } : {}),
      ...(data.latestWebhookErrorSummary !== undefined ? { latestWebhookErrorSummary: data.latestWebhookErrorSummary } : {})
    }
  });
}

export async function upsertLeadEventRecords(
  tenantId: string,
  leadId: string,
  events: Array<{
    eventKey: string;
    externalEventId?: string | null;
    eventType: string;
    actorType?: string | null;
    occurredAt?: Date | null;
    isRead?: boolean;
    isReply?: boolean;
    payloadJson: unknown;
  }>
) {
  const results = await Promise.all(
    events.map((event) =>
      prisma.yelpLeadEvent.upsert({
        where: {
          tenantId_eventKey: {
            tenantId,
            eventKey: event.eventKey
          }
        },
        update: {
          leadId,
          externalEventId: event.externalEventId ?? null,
          eventType: event.eventType,
          actorType: event.actorType ?? null,
          occurredAt: event.occurredAt ?? null,
          isRead: event.isRead ?? false,
          isReply: event.isReply ?? false,
          payloadJson: toJsonValue(event.payloadJson)
        },
        create: {
          tenantId,
          leadId,
          eventKey: event.eventKey,
          externalEventId: event.externalEventId ?? null,
          eventType: event.eventType,
          actorType: event.actorType ?? null,
          occurredAt: event.occurredAt ?? null,
          isRead: event.isRead ?? false,
          isReply: event.isReply ?? false,
          payloadJson: toJsonValue(event.payloadJson)
        }
      })
    )
  );

  return results;
}

export async function listLeadRecords(
  tenantId: string,
  filters?: LeadRecordFilters & {
    skip?: number;
    take?: number;
  }
) {
  return prisma.yelpLead.findMany({
    where: buildLeadRecordWhere(tenantId, filters),
    include: {
      business: {
        select: {
          id: true,
          name: true,
          locationId: true,
          location: {
            select: {
              id: true,
              name: true
            }
          },
          encryptedYelpBusinessId: true
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
        include: {
          location: {
            select: {
              id: true,
              name: true
            }
          }
        },
        take: 1
      },
      crmStatusEvents: {
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 1
      },
      automationAttempts: {
        include: {
          template: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: [{ triggeredAt: "desc" }, { createdAt: "desc" }],
        take: 1
      },
      syncRuns: {
        where: {
          type: "CRM_LEAD_ENRICHMENT"
        },
        include: {
          errors: true
        },
        orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
        take: 2
      },
      _count: {
        select: {
          events: true,
          webhookEvents: true,
          crmStatusEvents: true,
          automationAttempts: true
        }
      }
    },
    ...(filters?.skip !== undefined ? { skip: filters.skip } : {}),
    ...(filters?.take !== undefined ? { take: filters.take } : {}),
    orderBy: [{ latestInteractionAt: "desc" }, { createdAtYelp: "desc" }, { updatedAt: "desc" }]
  });
}

export async function countLeadRecords(tenantId: string, filters?: LeadRecordFilters) {
  return prisma.yelpLead.count({
    where: buildLeadRecordWhere(tenantId, filters)
  });
}

export async function countLeadRecordsByBusiness(tenantId: string, filters?: Omit<LeadRecordFilters, "businessId">) {
  return prisma.yelpLead.groupBy({
    by: ["businessId"],
    where: buildLeadRecordWhere(tenantId, filters),
    _count: {
      _all: true
    }
  });
}

export async function listLeadBusinessOptions(tenantId: string) {
  return prisma.business.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      locationId: true,
      encryptedYelpBusinessId: true
    },
    orderBy: [{ name: "asc" }]
  });
}

export async function listFailedLeadWebhookEvents(tenantId: string, take = 6) {
  return prisma.yelpWebhookEvent.findMany({
    where: {
      tenantId,
      status: {
        in: ["FAILED", "PARTIAL"]
      }
    },
    include: {
      lead: {
        select: {
          id: true,
          externalLeadId: true,
          customerName: true,
          business: {
            select: {
              name: true
            }
          }
        }
      },
      syncRun: {
        include: {
          errors: true
        }
      }
    },
    orderBy: [{ receivedAt: "desc" }],
    take
  });
}

export async function listLeadBackfillRuns(tenantId: string, take = 6) {
  return prisma.syncRun.findMany({
    where: {
      tenantId,
      type: "YELP_LEADS_BACKFILL",
      capabilityKey: "hasLeadsApi"
    },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          locationId: true,
          encryptedYelpBusinessId: true
        }
      },
      errors: true
    },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    take
  });
}

export async function getLeadRecordById(tenantId: string, leadId: string) {
  return prisma.yelpLead.findFirstOrThrow({
    where: {
      tenantId,
      id: leadId
    },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          locationId: true,
          encryptedYelpBusinessId: true
        }
      },
      events: {
        orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }]
      },
      crmLeadMappings: {
        include: {
          location: {
            select: {
              id: true,
              name: true
            }
          },
          statusEvents: {
            orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }]
          }
        }
      },
      crmStatusEvents: {
        orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }]
      },
      automationAttempts: {
        include: {
          rule: {
            include: {
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
            }
          },
          template: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: [{ triggeredAt: "desc" }, { createdAt: "desc" }]
      },
      conversationActions: {
        include: {
          automationAttempt: {
            include: {
              rule: {
                include: {
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
                }
              },
              template: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        },
        orderBy: [{ createdAt: "desc" }, { completedAt: "desc" }]
      },
      conversationAutomationState: true,
      conversationAutomationTurns: {
        include: {
          template: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: [{ createdAt: "desc" }],
        take: 10
      },
      webhookEvents: {
        include: {
          syncRun: {
            include: {
              errors: true
            }
          }
        },
        orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }]
      },
      syncRuns: {
        include: {
          errors: true
        },
        orderBy: [{ startedAt: "desc" }]
      }
    }
  });
}
