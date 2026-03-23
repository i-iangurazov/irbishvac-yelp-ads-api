import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function createAuditEvent(data: Prisma.AuditEventUncheckedCreateInput) {
  return prisma.auditEvent.create({
    data
  });
}

export async function listAuditEvents(
  tenantId: string,
  filters?: {
    actorId?: string;
    businessId?: string;
    programId?: string;
    actionType?: string;
    status?: string;
    from?: Date;
    to?: Date;
  }
) {
  return prisma.auditEvent.findMany({
    where: {
      tenantId,
      ...(filters?.actorId ? { actorId: filters.actorId } : {}),
      ...(filters?.businessId ? { businessId: filters.businessId } : {}),
      ...(filters?.programId ? { programId: filters.programId } : {}),
      ...(filters?.actionType ? { actionType: filters.actionType } : {}),
      ...(filters?.status ? { status: filters.status as never } : {}),
      ...(filters?.from || filters?.to
        ? {
            createdAt: {
              ...(filters?.from ? { gte: filters.from } : {}),
              ...(filters?.to ? { lte: filters.to } : {})
            }
          }
        : {})
    },
    include: {
      actor: true,
      business: true,
      program: true
    },
    orderBy: { createdAt: "desc" }
  });
}
