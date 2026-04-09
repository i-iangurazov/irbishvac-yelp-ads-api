import "server-only";

import type { Prisma, RecordSourceSystem, SyncRunStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { toJsonValue } from "@/lib/db/json";

export async function getLeadForCrmEnrichment(tenantId: string, leadId: string) {
  return prisma.yelpLead.findFirstOrThrow({
    where: {
      tenantId,
      id: leadId
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
          name: true,
          externalCrmLocationId: true
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
        }
      },
      crmStatusEvents: {
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }]
      }
    }
  });
}

export async function findLeadForCrmEnrichment(
  tenantId: string,
  identifiers: {
    leadId?: string | null;
    externalLeadId?: string | null;
  }
) {
  const filters = [
    identifiers.leadId ? { id: identifiers.leadId } : null,
    identifiers.externalLeadId ? { externalLeadId: identifiers.externalLeadId } : null
  ].filter(Boolean) as Prisma.YelpLeadWhereInput[];

  if (filters.length === 0) {
    return null;
  }

  return prisma.yelpLead.findFirst({
    where: {
      tenantId,
      OR: filters
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
          name: true,
          externalCrmLocationId: true
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
        }
      },
      crmStatusEvents: {
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }]
      }
    }
  });
}

export async function findCrmLeadMappingByExternalLeadId(tenantId: string, externalCrmLeadId: string) {
  return prisma.crmLeadMapping.findFirst({
    where: {
      tenantId,
      externalCrmLeadId
    },
    include: {
      lead: {
        select: {
          id: true,
          externalLeadId: true,
          customerName: true
        }
      }
    }
  });
}

export async function createCrmSyncRun(data: {
  tenantId: string;
  businessId?: string | null;
  locationId?: string | null;
  leadId: string;
  capabilityKey?: string | null;
  correlationId?: string | null;
  sourceSystem?: RecordSourceSystem;
  requestJson?: unknown;
}) {
  return prisma.syncRun.create({
    data: {
      tenantId: data.tenantId,
      businessId: data.businessId ?? null,
      locationId: data.locationId ?? null,
      leadId: data.leadId,
      type: "CRM_LEAD_ENRICHMENT",
      status: "PROCESSING",
      sourceSystem: data.sourceSystem ?? "INTERNAL",
      capabilityKey: data.capabilityKey ?? null,
      correlationId: data.correlationId ?? null,
      requestJson: data.requestJson === undefined ? undefined : toJsonValue(data.requestJson)
    }
  });
}

export async function updateCrmSyncRun(
  id: string,
  data: {
    status?: SyncRunStatus;
    locationId?: string | null;
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
      ...(data.locationId !== undefined ? { locationId: data.locationId } : {}),
      ...(data.finishedAt !== undefined ? { finishedAt: data.finishedAt } : {}),
      ...(data.lastSuccessfulSyncAt !== undefined ? { lastSuccessfulSyncAt: data.lastSuccessfulSyncAt } : {}),
      ...(data.statsJson !== undefined ? { statsJson: toJsonValue(data.statsJson) } : {}),
      ...(data.responseJson !== undefined ? { responseJson: toJsonValue(data.responseJson) } : {}),
      ...(data.errorSummary !== undefined ? { errorSummary: data.errorSummary } : {})
    }
  });
}

export async function getCrmSyncRunById(tenantId: string, syncRunId: string) {
  return prisma.syncRun.findFirstOrThrow({
    where: {
      tenantId,
      id: syncRunId,
      type: "CRM_LEAD_ENRICHMENT"
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
          customerName: true
        }
      },
      errors: {
        orderBy: [{ occurredAt: "desc" }]
      }
    }
  });
}

export async function createCrmSyncError(data: {
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
      sourceSystem: data.sourceSystem ?? "INTERNAL",
      category: data.category,
      code: data.code ?? null,
      message: data.message,
      isRetryable: data.isRetryable ?? false,
      detailsJson: data.detailsJson === undefined ? undefined : toJsonValue(data.detailsJson)
    }
  });
}

export async function upsertCrmLeadMappingRecord(
  tenantId: string,
  leadId: string,
  data: Omit<Prisma.CrmLeadMappingUncheckedCreateInput, "tenantId" | "leadId">
) {
  return prisma.crmLeadMapping.upsert({
    where: {
      leadId
    },
    update: {
      ...data
    },
    create: {
      tenantId,
      leadId,
      ...data
    },
    include: {
      location: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

export async function updateCrmLeadMappingRecord(
  id: string,
  data: Prisma.CrmLeadMappingUncheckedUpdateInput
) {
  return prisma.crmLeadMapping.update({
    where: { id },
    data,
    include: {
      location: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

export async function createCrmStatusEventRecord(data: {
  tenantId: string;
  leadId: string;
  crmLeadMappingId?: string | null;
  locationId?: string | null;
  externalStatusEventId?: string | null;
  status: Prisma.CrmStatusEventUncheckedCreateInput["status"];
  substatus?: string | null;
  sourceSystem?: RecordSourceSystem;
  occurredAt: Date;
  payloadJson: unknown;
}) {
  if (data.externalStatusEventId) {
    return prisma.crmStatusEvent.upsert({
      where: {
        tenantId_externalStatusEventId: {
          tenantId: data.tenantId,
          externalStatusEventId: data.externalStatusEventId
        }
      },
      update: {
        leadId: data.leadId,
        crmLeadMappingId: data.crmLeadMappingId ?? null,
        locationId: data.locationId ?? null,
        status: data.status,
        substatus: data.substatus ?? null,
        sourceSystem: data.sourceSystem ?? "CRM",
        occurredAt: data.occurredAt,
        payloadJson: toJsonValue(data.payloadJson)
      },
      create: {
        tenantId: data.tenantId,
        leadId: data.leadId,
        crmLeadMappingId: data.crmLeadMappingId ?? null,
        locationId: data.locationId ?? null,
        externalStatusEventId: data.externalStatusEventId,
        status: data.status,
        substatus: data.substatus ?? null,
        sourceSystem: data.sourceSystem ?? "CRM",
        occurredAt: data.occurredAt,
        payloadJson: toJsonValue(data.payloadJson)
      }
    });
  }

  return prisma.crmStatusEvent.create({
    data: {
      tenantId: data.tenantId,
      leadId: data.leadId,
      crmLeadMappingId: data.crmLeadMappingId ?? null,
      locationId: data.locationId ?? null,
      status: data.status,
      substatus: data.substatus ?? null,
      sourceSystem: data.sourceSystem ?? "INTERNAL",
      occurredAt: data.occurredAt,
      payloadJson: toJsonValue(data.payloadJson)
    }
  });
}

export async function updateLeadCrmFields(data: {
  leadId: string;
  internalStatus?: Prisma.YelpLeadUncheckedUpdateInput["internalStatus"];
  locationId?: string | null;
}) {
  return prisma.yelpLead.update({
    where: { id: data.leadId },
    data: {
      ...(data.internalStatus !== undefined ? { internalStatus: data.internalStatus } : {}),
      ...(data.locationId !== undefined ? { locationId: data.locationId } : {})
    }
  });
}

export async function listLeadOutcomeRows(tenantId: string) {
  return prisma.yelpLead.findMany({
    where: { tenantId },
    select: {
      internalStatus: true,
      crmLeadMappings: {
        select: {
          state: true
        },
        take: 1
      }
    }
  });
}
