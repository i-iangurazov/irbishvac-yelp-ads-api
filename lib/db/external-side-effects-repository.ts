import "server-only";

import { Prisma, type ExternalSideEffectStatus } from "@prisma/client";

import { toJsonValue } from "@/lib/db/json";
import { prisma } from "@/lib/db/prisma";

export async function claimExternalSideEffect(params: {
  tenantId: string;
  idempotencyKey: string;
  provider: string;
  operation: string;
  businessId?: string | null;
  leadId?: string | null;
  automationAttemptId?: string | null;
  conversationActionId?: string | null;
  reportScheduleRunId?: string | null;
  requestJson?: unknown;
}) {
  try {
    const sideEffect = await prisma.externalSideEffect.create({
      data: {
        tenantId: params.tenantId,
        idempotencyKey: params.idempotencyKey,
        provider: params.provider,
        operation: params.operation,
        businessId: params.businessId ?? null,
        leadId: params.leadId ?? null,
        automationAttemptId: params.automationAttemptId ?? null,
        conversationActionId: params.conversationActionId ?? null,
        reportScheduleRunId: params.reportScheduleRunId ?? null,
        requestJson: params.requestJson === undefined ? undefined : toJsonValue(params.requestJson)
      }
    });

    return {
      claimed: true as const,
      sideEffect
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const sideEffect = await prisma.externalSideEffect.findUniqueOrThrow({
        where: {
          tenantId_idempotencyKey: {
            tenantId: params.tenantId,
            idempotencyKey: params.idempotencyKey
          }
        }
      });

      return {
        claimed: false as const,
        sideEffect
      };
    }

    throw error;
  }
}

export async function resetExternalSideEffectClaim(id: string, data?: {
  requestJson?: unknown;
}) {
  return prisma.externalSideEffect.update({
    where: { id },
    data: {
      status: "CLAIMED",
      claimedAt: new Date(),
      completedAt: null,
      errorSummary: null,
      ...(data?.requestJson !== undefined ? { requestJson: toJsonValue(data.requestJson) } : {})
    }
  });
}

export async function completeExternalSideEffect(
  id: string,
  data: {
    status: ExternalSideEffectStatus;
    conversationActionId?: string | null;
    reportScheduleRunId?: string | null;
    providerMessageId?: string | null;
    responseJson?: unknown;
    errorSummary?: string | null;
  }
) {
  return prisma.externalSideEffect.update({
    where: { id },
    data: {
      status: data.status,
      ...(data.conversationActionId !== undefined ? { conversationActionId: data.conversationActionId } : {}),
      ...(data.reportScheduleRunId !== undefined ? { reportScheduleRunId: data.reportScheduleRunId } : {}),
      ...(data.providerMessageId !== undefined ? { providerMessageId: data.providerMessageId } : {}),
      ...(data.responseJson !== undefined ? { responseJson: toJsonValue(data.responseJson) as Prisma.InputJsonValue } : {}),
      ...(data.errorSummary !== undefined ? { errorSummary: data.errorSummary } : {}),
      completedAt: new Date()
    }
  });
}
