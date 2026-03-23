import "server-only";

import type { AuditStatus, Prisma } from "@prisma/client";

import { createAuditEvent, listAuditEvents } from "@/lib/db/audit-repository";
import { toJsonValue } from "@/lib/db/json";
import { diffObjects } from "@/lib/utils/diff";

export async function recordAuditEvent(params: {
  tenantId: string;
  actorId?: string | null;
  businessId?: string | null;
  programId?: string | null;
  reportRequestId?: string | null;
  actionType: string;
  status: AuditStatus;
  correlationId?: string | null;
  upstreamReference?: string | null;
  requestSummary?: Prisma.InputJsonValue;
  responseSummary?: Prisma.InputJsonValue;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  rawPayloadSummary?: Prisma.InputJsonValue;
}) {
  const diff = diffObjects(params.before, params.after);

  return createAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId ?? undefined,
    businessId: params.businessId ?? undefined,
    programId: params.programId ?? undefined,
    reportRequestId: params.reportRequestId ?? undefined,
    actionType: params.actionType,
    status: params.status,
    correlationId: params.correlationId ?? undefined,
    upstreamReference: params.upstreamReference ?? undefined,
    requestSummaryJson: params.requestSummary ? toJsonValue(params.requestSummary) : undefined,
    responseSummaryJson: toJsonValue({
      summary: params.responseSummary,
      diff
    }),
    beforeJson: params.before ? toJsonValue(params.before) : undefined,
    afterJson: params.after ? toJsonValue(params.after) : undefined,
    rawPayloadSummaryJson: params.rawPayloadSummary ? toJsonValue(params.rawPayloadSummary) : undefined
  });
}

export async function getAuditLog(tenantId: string, filters?: Parameters<typeof listAuditEvents>[1]) {
  return listAuditEvents(tenantId, filters);
}
