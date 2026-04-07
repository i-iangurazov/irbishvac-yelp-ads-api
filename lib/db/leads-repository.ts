import "server-only";

import type { Prisma, RecordSourceSystem, SyncRunStatus, SyncRunType } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { toJsonValue } from "@/lib/db/json";

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
      status: "PROCESSING",
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
    status?: SyncRunStatus;
    processedAt?: Date | null;
    errorJson?: unknown;
  }
) {
  return prisma.yelpWebhookEvent.update({
    where: { id },
    data: {
      ...(data.leadId !== undefined ? { leadId: data.leadId } : {}),
      ...(data.syncRunId !== undefined ? { syncRunId: data.syncRunId } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.processedAt !== undefined ? { processedAt: data.processedAt } : {}),
      ...(data.errorJson !== undefined ? { errorJson: toJsonValue(data.errorJson) } : {})
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
  filters?: {
    businessId?: string;
    mappingState?: string;
    internalStatus?: string;
    from?: Date;
    to?: Date;
  }
) {
  return prisma.yelpLead.findMany({
    where: {
      tenantId,
      ...(filters?.businessId ? { businessId: filters.businessId } : {}),
      ...(filters?.mappingState
        ? {
            crmLeadMappings: {
              some: {
                state: filters.mappingState as never
              }
            }
          }
        : {}),
      ...(filters?.internalStatus ? { internalStatus: filters.internalStatus as never } : {}),
      ...(filters?.from || filters?.to
        ? {
            createdAtYelp: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {})
            }
          }
        : {})
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
      webhookEvents: {
        orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
        take: 1
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
    orderBy: [{ latestInteractionAt: "desc" }, { createdAtYelp: "desc" }, { updatedAt: "desc" }]
  });
}

export async function countLeadRecords(tenantId: string) {
  return prisma.yelpLead.count({
    where: {
      tenantId
    }
  });
}

export async function listLeadBusinessOptions(tenantId: string) {
  return prisma.business.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
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
      type: "YELP_LEADS_BACKFILL"
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
