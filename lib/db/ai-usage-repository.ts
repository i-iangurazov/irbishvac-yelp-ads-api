import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

type AiUsageReservationLimits = {
  messageLimit: number;
  tokenLimit: number;
  costLimitMicroUsd: number;
};

type AiUsageReservation = {
  tenantId: string;
  businessId?: string | null;
  leadId?: string | null;
  correlationId: string;
  operation: string;
  model: string;
  reservedInputTokens: number;
  reservedOutputTokens: number;
  reservedProviderCostMicroUsd: number;
  reservedBillableCostMicroUsd: number;
  rateSnapshotJson: Prisma.InputJsonValue;
  since: Date;
  limits: AiUsageReservationLimits;
};

export async function getAiUsageTotals(params: {
  tenantId: string;
  since: Date;
  until?: Date;
}) {
  return prisma.aiGenerationUsage.aggregate({
    where: {
      tenantId: params.tenantId,
      resultStatus: { not: "BLOCKED" },
      createdAt: {
        gte: params.since,
        ...(params.until ? { lt: params.until } : {}),
      },
    },
    _count: { _all: true },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      cacheCreationInputTokens: true,
      cacheReadInputTokens: true,
      providerCostMicroUsd: true,
      billableCostMicroUsd: true,
    },
  });
}

export async function createAiGenerationUsage(
  data: Prisma.AiGenerationUsageUncheckedCreateInput,
) {
  return prisma.aiGenerationUsage.create({ data });
}

export async function reserveAiGenerationUsage(params: AiUsageReservation) {
  return prisma.$transaction(
    async (tx) => {
      const totals = await tx.aiGenerationUsage.aggregate({
        where: {
          tenantId: params.tenantId,
          createdAt: { gte: params.since },
          resultStatus: { not: "BLOCKED" },
        },
        _count: { _all: true },
        _sum: {
          inputTokens: true,
          outputTokens: true,
          cacheCreationInputTokens: true,
          cacheReadInputTokens: true,
          providerCostMicroUsd: true,
        },
      });
      const usedTokens =
        (totals._sum.inputTokens ?? 0) +
        (totals._sum.outputTokens ?? 0) +
        (totals._sum.cacheCreationInputTokens ?? 0) +
        (totals._sum.cacheReadInputTokens ?? 0);
      const usedCostMicroUsd = totals._sum.providerCostMicroUsd ?? 0;
      const reason: "MESSAGE_LIMIT" | "TOKEN_LIMIT" | "DOLLAR_LIMIT" | null =
        totals._count._all + 1 > params.limits.messageLimit
          ? "MESSAGE_LIMIT"
          : usedTokens +
                params.reservedInputTokens +
                params.reservedOutputTokens >
              params.limits.tokenLimit
            ? "TOKEN_LIMIT"
            : usedCostMicroUsd + params.reservedProviderCostMicroUsd >
                params.limits.costLimitMicroUsd
              ? "DOLLAR_LIMIT"
              : null;

      if (reason) {
        return {
          reserved: false as const,
          reason,
          totals: {
            messages: totals._count._all,
            tokens: usedTokens,
            providerCostMicroUsd: usedCostMicroUsd,
          },
        };
      }

      await tx.aiGenerationUsage.create({
        data: {
          tenantId: params.tenantId,
          businessId: params.businessId ?? null,
          leadId: params.leadId ?? null,
          correlationId: params.correlationId,
          provider: "ANTHROPIC",
          operation: params.operation,
          model: params.model,
          resultStatus: "RESERVED",
          inputTokens: params.reservedInputTokens,
          outputTokens: params.reservedOutputTokens,
          providerCostMicroUsd: params.reservedProviderCostMicroUsd,
          billableCostMicroUsd: params.reservedBillableCostMicroUsd,
          rateSnapshotJson: params.rateSnapshotJson,
        },
      });

      return {
        reserved: true as const,
        reason: null,
        totals: {
          messages: totals._count._all + 1,
          tokens:
            usedTokens +
            params.reservedInputTokens +
            params.reservedOutputTokens,
          providerCostMicroUsd:
            usedCostMicroUsd + params.reservedProviderCostMicroUsd,
        },
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function settleAiGenerationUsage(params: {
  tenantId: string;
  correlationId: string;
  resultStatus: "SUCCESS" | "FAILED";
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  latencyMs: number;
  providerCostMicroUsd: number;
  billableCostMicroUsd: number;
  rateSnapshotJson: Prisma.InputJsonValue;
  failureReason?: string | null;
}) {
  return prisma.aiGenerationUsage.update({
    where: {
      tenantId_correlationId: {
        tenantId: params.tenantId,
        correlationId: params.correlationId,
      },
    },
    data: {
      resultStatus: params.resultStatus,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      cacheCreationInputTokens: params.cacheCreationInputTokens,
      cacheReadInputTokens: params.cacheReadInputTokens,
      latencyMs: params.latencyMs,
      providerCostMicroUsd: params.providerCostMicroUsd,
      billableCostMicroUsd: params.billableCostMicroUsd,
      rateSnapshotJson: params.rateSnapshotJson,
      failureReason: params.failureReason ?? null,
    },
  });
}

export async function listAiGenerationUsage(params: {
  tenantId: string;
  since: Date;
  until: Date;
}) {
  return prisma.aiGenerationUsage.findMany({
    where: {
      tenantId: params.tenantId,
      createdAt: { gte: params.since, lt: params.until },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
