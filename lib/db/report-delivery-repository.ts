import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function listReportSchedules(tenantId: string) {
  return prisma.reportSchedule.findMany({
    where: { tenantId },
    include: {
      business: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: [{ isEnabled: "desc" }, { updatedAt: "desc" }, { name: "asc" }]
  });
}

export async function listReportScheduleLocations(tenantId: string) {
  return prisma.location.findMany({
    where: {
      tenantId,
      isActive: true
    },
    select: {
      id: true,
      name: true
    },
    orderBy: [{ name: "asc" }]
  });
}

export async function getReportScheduleById(id: string, tenantId: string) {
  return prisma.reportSchedule.findFirstOrThrow({
    where: { id, tenantId },
    include: {
      business: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

export async function listEnabledReportSchedules(limit = 20) {
  return prisma.reportSchedule.findMany({
    where: { isEnabled: true },
    include: {
      business: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: [{ updatedAt: "asc" }],
    take: limit
  });
}

export async function createReportSchedule(tenantId: string, data: Prisma.ReportScheduleUncheckedCreateInput) {
  return prisma.reportSchedule.create({
    data: {
      ...data,
      tenantId
    }
  });
}

export async function updateReportSchedule(
  id: string,
  tenantId: string,
  data: Prisma.ReportScheduleUncheckedUpdateInput
) {
  return prisma.reportSchedule.updateMany({
    where: { id, tenantId },
    data
  });
}

export async function findReportScheduleRunByRunKey(runKey: string) {
  return prisma.reportScheduleRun.findUnique({
    where: { runKey },
    include: {
      schedule: true,
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
          endDate: true
        }
      }
    }
  });
}

export async function getReportScheduleRunById(id: string, tenantId: string) {
  return prisma.reportScheduleRun.findFirstOrThrow({
    where: { id, tenantId },
    include: {
      schedule: true,
      location: {
        select: {
          id: true,
          name: true
        }
      },
      reportRequest: {
        include: {
          business: true,
          results: {
            include: {
              business: true
            }
          }
        }
      }
    }
  });
}

export async function listReportScheduleRunsForOccurrence(params: {
  scheduleId: string;
  scheduledFor: Date;
  windowStart: Date;
  windowEnd: Date;
}) {
  return prisma.reportScheduleRun.findMany({
    where: {
      scheduleId: params.scheduleId,
      scheduledFor: params.scheduledFor,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd
    },
    include: {
      schedule: true,
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
          endDate: true
        }
      }
    }
  });
}

export async function listRecentReportScheduleRuns(tenantId: string, take = 20) {
  return prisma.reportScheduleRun.findMany({
    where: { tenantId },
    include: {
      schedule: {
        select: {
          id: true,
          name: true,
          cadence: true,
          timezone: true,
          deliverPerLocation: true,
          deliveryScope: true
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
    },
    orderBy: [{ createdAt: "desc" }],
    take
  });
}

export async function listPendingReportScheduleRuns(limit = 20) {
  return prisma.reportScheduleRun.findMany({
    where: {
      OR: [
        {
          generationStatus: {
            in: ["REQUESTED", "PROCESSING"]
          }
        },
        {
          generationStatus: "READY",
          deliveryStatus: "PENDING"
        }
      ]
    },
    include: {
      schedule: true,
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
          endDate: true
        }
      }
    },
    orderBy: [{ createdAt: "asc" }],
    take: limit
  });
}

export async function upsertReportScheduleRunByRunKey(
  runKey: string,
  data: {
    create: Prisma.ReportScheduleRunUncheckedCreateInput;
    update: Prisma.ReportScheduleRunUncheckedUpdateInput;
  }
) {
  return prisma.reportScheduleRun.upsert({
    where: { runKey },
    create: data.create,
    update: data.update
  });
}

export async function updateReportScheduleRun(
  id: string,
  data: Prisma.ReportScheduleRunUncheckedUpdateInput
) {
  return prisma.reportScheduleRun.update({
    where: { id },
    data
  });
}
