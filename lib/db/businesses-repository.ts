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
      programs: {
        orderBy: { updatedAt: "desc" }
      },
      auditEvents: {
        orderBy: { createdAt: "desc" },
        take: 20
      },
      reportRequests: {
        orderBy: { createdAt: "desc" },
        take: 10
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
