import "server-only";

import type { JobStatus, JobType, ProgramStatus, ProgramType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function listPrograms(tenantId: string, businessId?: string) {
  return prisma.program.findMany({
    where: {
      tenantId,
      ...(businessId ? { businessId } : {})
    },
    include: {
      business: true,
      jobs: {
        orderBy: { createdAt: "desc" },
        take: 5
      }
    },
    orderBy: { updatedAt: "desc" }
  });
}

export async function getProgramById(programId: string, tenantId: string) {
  return prisma.program.findFirstOrThrow({
    where: { id: programId, tenantId },
    include: {
      business: true,
      jobs: {
        orderBy: { createdAt: "desc" }
      },
      featureSnapshots: {
        orderBy: { capturedAt: "desc" }
      },
      auditEvents: {
        orderBy: { createdAt: "desc" },
        take: 30
      }
    }
  });
}

export async function createProgramRecord(
  tenantId: string,
  businessId: string,
  data: Omit<Prisma.ProgramUncheckedCreateInput, "tenantId" | "businessId">
) {
  return prisma.program.create({
    data: {
      ...data,
      tenantId,
      businessId
    }
  });
}

export async function updateProgramRecord(programId: string, tenantId: string, data: Prisma.ProgramUncheckedUpdateInput) {
  return prisma.program.updateMany({
    where: { id: programId, tenantId },
    data
  });
}

export async function listProgramFeatures(programId: string, tenantId: string) {
  return prisma.programFeatureSnapshot.findMany({
    where: { programId, tenantId },
    orderBy: { capturedAt: "desc" }
  });
}

export async function createProgramFeatureSnapshot(data: Prisma.ProgramFeatureSnapshotUncheckedCreateInput) {
  return prisma.programFeatureSnapshot.create({
    data
  });
}

export async function createProgramJob(
  tenantId: string,
  businessId: string,
  data: {
    programId?: string | null;
    type: JobType;
    status: JobStatus;
    correlationId: string;
    upstreamJobId?: string | null;
    requestJson?: Prisma.InputJsonValue;
    responseJson?: Prisma.InputJsonValue;
    errorJson?: Prisma.InputJsonValue;
  }
) {
  return prisma.programJob.create({
    data: {
      tenantId,
      businessId,
      ...data
    }
  });
}

export async function updateProgramJob(jobId: string, data: Prisma.ProgramJobUncheckedUpdateInput) {
  return prisma.programJob.update({
    where: { id: jobId },
    data
  });
}

export async function getProgramJob(jobId: string, tenantId: string) {
  return prisma.programJob.findFirstOrThrow({
    where: { id: jobId, tenantId },
    include: {
      business: true,
      program: true
    }
  });
}

export async function listPendingProgramJobs(limit = 25) {
  return prisma.programJob.findMany({
    where: {
      upstreamJobId: { not: null },
      status: {
        in: ["QUEUED", "PROCESSING"]
      }
    },
    include: {
      business: true,
      program: true
    },
    orderBy: [{ lastPolledAt: "asc" }, { submittedAt: "asc" }],
    take: limit
  });
}

export async function countProgramsByStatus(tenantId: string, status: ProgramStatus) {
  return prisma.program.count({
    where: { tenantId, status }
  });
}

export async function countProgramsByType(tenantId: string, type: ProgramType) {
  return prisma.program.count({
    where: { tenantId, type }
  });
}
