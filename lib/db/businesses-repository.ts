import "server-only";

import { prisma } from "@/lib/db/prisma";
import { toJsonValue } from "@/lib/db/json";

export async function listBusinesses(tenantId: string, search?: string) {
  return prisma.business.findMany({
    where: {
      tenantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
              { state: { contains: search, mode: "insensitive" } }
            ]
          }
        : {})
    },
    include: {
      programs: true
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }]
  });
}

export async function getBusinessById(id: string, tenantId: string) {
  return prisma.business.findFirstOrThrow({
    where: { id, tenantId },
    include: {
      location: {
        select: {
          id: true,
          name: true,
          externalCrmLocationId: true
        }
      },
      mappings: {
        orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
        take: 5
      },
      programs: {
        orderBy: { updatedAt: "desc" }
      },
      yelpLeads: {
        orderBy: [{ latestInteractionAt: "desc" }, { createdAtYelp: "desc" }],
        take: 1,
        select: {
          id: true,
          latestInteractionAt: true,
          latestWebhookReceivedAt: true,
          latestWebhookStatus: true,
          lastSyncedAt: true
        }
      },
      leadAutomationOverrides: {
        take: 1,
        select: {
          isEnabled: true,
          defaultChannel: true,
          followUp24hEnabled: true,
          followUp7dEnabled: true,
          aiAssistEnabled: true,
          conversationAutomationEnabled: true,
          conversationMode: true
        }
      },
      leadAutomationAttempts: {
        where: {
          status: "SENT"
        },
        orderBy: [{ completedAt: "desc" }, { triggeredAt: "desc" }],
        take: 1,
        select: {
          id: true,
          cadence: true,
          channel: true,
          completedAt: true,
          triggeredAt: true,
          providerMessageId: true
        }
      },
      reportSchedules: {
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          isEnabled: true,
          deliverPerLocation: true,
          recipientEmailsJson: true,
          locationRecipientOverridesJson: true,
          lastSuccessfulDeliveryAt: true
        }
      },
      operatorIssues: {
        where: { status: "OPEN" },
        orderBy: [{ severity: "desc" }, { lastDetectedAt: "desc" }],
        take: 5
      },
      syncRuns: {
        orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
        take: 5,
        select: {
          id: true,
          type: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          lastSuccessfulSyncAt: true,
          errorSummary: true
        }
      },
      auditEvents: {
        orderBy: { createdAt: "desc" },
        take: 20
      },
      reportRequests: {
        orderBy: { createdAt: "desc" },
        take: 10
      },
      _count: {
        select: {
          yelpLeads: true,
          programs: true,
          reportSchedules: true,
          operatorIssues: true,
          mappings: true,
          leadAutomationOverrides: true,
          leadAutomationRules: true,
          leadAutomationTemplates: true
        }
      }
    }
  });
}

export async function getBusinessDeleteImpact(id: string, tenantId: string) {
  return prisma.business.findFirstOrThrow({
    where: { id, tenantId },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          mappings: true,
          programs: true,
          programJobs: true,
          featureSnapshots: true,
          reportRequests: true,
          reportResults: true,
          auditEvents: true
        }
      }
    }
  });
}

export async function findBusinessByEncryptedYelpBusinessId(tenantId: string, encryptedYelpBusinessId: string) {
  return prisma.business.findUnique({
    where: {
      tenantId_encryptedYelpBusinessId: {
        tenantId,
        encryptedYelpBusinessId
      }
    }
  });
}

export async function updateBusinessRecord(id: string, tenantId: string, data: { readinessJson?: unknown; rawSnapshotJson?: unknown }) {
  return prisma.business.updateMany({
    where: { id, tenantId },
    data: {
      ...(data.readinessJson === undefined ? {} : { readinessJson: toJsonValue(data.readinessJson) }),
      ...(data.rawSnapshotJson === undefined ? {} : { rawSnapshotJson: toJsonValue(data.rawSnapshotJson) })
    }
  });
}

export async function upsertBusiness(
  tenantId: string,
  encryptedYelpBusinessId: string,
  data: {
    name: string;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    categoriesJson?: unknown;
    readinessJson?: unknown;
    rawSnapshotJson?: unknown;
  }
) {
  return prisma.business.upsert({
    where: {
      tenantId_encryptedYelpBusinessId: {
        tenantId,
        encryptedYelpBusinessId
      }
    },
    update: {
      ...data,
      categoriesJson: toJsonValue(data.categoriesJson),
      readinessJson: toJsonValue(data.readinessJson),
      rawSnapshotJson: data.rawSnapshotJson ? toJsonValue(data.rawSnapshotJson) : undefined
    },
    create: {
      tenantId,
      encryptedYelpBusinessId,
      ...data,
      categoriesJson: toJsonValue(data.categoriesJson),
      readinessJson: toJsonValue(data.readinessJson),
      rawSnapshotJson: data.rawSnapshotJson ? toJsonValue(data.rawSnapshotJson) : undefined
    }
  });
}

export async function deleteBusinessRecord(id: string, tenantId: string) {
  return prisma.business.deleteMany({
    where: {
      id,
      tenantId
    }
  });
}
