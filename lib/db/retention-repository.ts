import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { toJsonValue } from "@/lib/db/json";

export async function listWebhookEventsForRetention(before: Date, limit: number) {
  return prisma.yelpWebhookEvent.findMany({
    where: {
      receivedAt: {
        lt: before
      },
      updatedAt: {
        lt: before
      }
    },
    select: {
      id: true,
      tenantId: true,
      headersJson: true,
      errorJson: true,
      payloadJson: true
    },
    orderBy: {
      receivedAt: "asc"
    },
    take: limit * 2
  });
}

export async function redactWebhookEvents(ids: string[], payloadJson: unknown) {
  if (ids.length === 0) {
    return;
  }

  await prisma.yelpWebhookEvent.updateMany({
    where: {
      id: {
        in: ids
      }
    },
    data: {
      headersJson: Prisma.JsonNull,
      errorJson: Prisma.JsonNull,
      payloadJson: toJsonValue(payloadJson)
    }
  });
}

export async function listSyncRunsForRetention(before: Date, limit: number) {
  return prisma.syncRun.findMany({
    where: {
      createdAt: {
        lt: before
      },
      updatedAt: {
        lt: before
      }
    },
    select: {
      id: true,
      tenantId: true,
      requestJson: true,
      responseJson: true
    },
    orderBy: {
      createdAt: "asc"
    },
    take: limit * 2
  });
}

export async function redactSyncRuns(ids: string[]) {
  if (ids.length === 0) {
    return;
  }

  await prisma.syncRun.updateMany({
    where: {
      id: {
        in: ids
      }
    },
    data: {
      requestJson: Prisma.JsonNull,
      responseJson: Prisma.JsonNull
    }
  });
}

export async function listAuditEventsForRetention(before: Date, limit: number) {
  return prisma.auditEvent.findMany({
    where: {
      createdAt: {
        lt: before
      },
      updatedAt: {
        lt: before
      }
    },
    select: {
      id: true,
      tenantId: true,
      createdAt: true,
      requestSummaryJson: true,
      responseSummaryJson: true,
      beforeJson: true,
      afterJson: true,
      rawPayloadSummaryJson: true
    },
    orderBy: {
      createdAt: "asc"
    },
    take: limit * 2
  });
}

export async function redactAuditEventRawPayload(ids: string[]) {
  if (ids.length === 0) {
    return;
  }

  await prisma.auditEvent.updateMany({
    where: {
      id: {
        in: ids
      }
    },
    data: {
      rawPayloadSummaryJson: Prisma.JsonNull
    }
  });
}

export async function redactAuditEventDebugSummaries(ids: string[]) {
  if (ids.length === 0) {
    return;
  }

  await prisma.auditEvent.updateMany({
    where: {
      id: {
        in: ids
      }
    },
    data: {
      requestSummaryJson: Prisma.JsonNull,
      responseSummaryJson: Prisma.JsonNull,
      beforeJson: Prisma.JsonNull,
      afterJson: Prisma.JsonNull
    }
  });
}

export async function listConversationTurnsForRetention(before: Date, limit: number) {
  return prisma.leadConversationAutomationTurn.findMany({
    where: {
      createdAt: {
        lt: before
      },
      updatedAt: {
        lt: before
      }
    },
    select: {
      id: true,
      tenantId: true,
      renderedSubject: true,
      renderedBody: true,
      metadataJson: true
    },
    orderBy: {
      createdAt: "asc"
    },
    take: limit * 2
  });
}

export async function redactConversationTurns(ids: string[], metadataJson: unknown) {
  if (ids.length === 0) {
    return;
  }

  await prisma.leadConversationAutomationTurn.updateMany({
    where: {
      id: {
        in: ids
      }
    },
    data: {
      renderedSubject: null,
      renderedBody: null,
      metadataJson: toJsonValue(metadataJson)
    }
  });
}

export async function listSyncErrorsForRetention(before: Date, limit: number) {
  return prisma.syncError.findMany({
    where: {
      occurredAt: {
        lt: before
      },
      updatedAt: {
        lt: before
      }
    },
    select: {
      id: true,
      tenantId: true,
      detailsJson: true
    },
    orderBy: {
      occurredAt: "asc"
    },
    take: limit * 2
  });
}

export async function redactSyncErrors(ids: string[]) {
  if (ids.length === 0) {
    return;
  }

  await prisma.syncError.updateMany({
    where: {
      id: {
        in: ids
      }
    },
    data: {
      detailsJson: Prisma.JsonNull
    }
  });
}
