import "server-only";

import type { AnthropicUsage } from "@/features/autoresponder/anthropic-client";
import { approvedLeadAiModelOptions } from "@/features/autoresponder/constants";
import { YelpValidationError } from "@/lib/yelp/errors";

const ESTIMATED_MAX_INPUT_TOKENS = 10_000;
const ESTIMATED_MAX_OUTPUT_TOKENS = 1_024;

export type AnthropicUsageLimits = {
  monthlyBudgetUsd: number;
  monthlyMessageLimit: number;
  monthlyTokenLimit: number;
  warningPercent: number;
  agencyMarkupPercent: number;
};

export class AnthropicHardLimitError extends YelpValidationError {
  readonly limitType: "MESSAGE_LIMIT" | "TOKEN_LIMIT" | "DOLLAR_LIMIT";

  constructor(limitType: AnthropicHardLimitError["limitType"]) {
    const label =
      limitType === "MESSAGE_LIMIT"
        ? "monthly message"
        : limitType === "TOKEN_LIMIT"
          ? "monthly token"
          : "monthly dollar";
    super(
      `Claude ${label} hard limit reached. Paid generation was stopped and the lead requires manual review.`,
    );
    this.name = "AnthropicHardLimitError";
    this.limitType = limitType;
  }
}

function startOfUtcMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function getPricing(model: string) {
  const option = approvedLeadAiModelOptions.find(
    (candidate) => candidate.value === model,
  );

  if (!option) {
    throw new YelpValidationError(
      "The selected Claude model is not approved for autoresponder use.",
    );
  }

  return option;
}

function buildRateSnapshot(model: string, agencyMarkupPercent: number) {
  const pricing = getPricing(model);

  return {
    provider: "ANTHROPIC",
    model: pricing.value,
    currency: "USD",
    inputUsdPerMillionTokens: pricing.inputUsdPerMillionTokens,
    outputUsdPerMillionTokens: pricing.outputUsdPerMillionTokens,
    cacheWriteUsdPerMillionTokens: pricing.cacheWriteUsdPerMillionTokens,
    cacheReadUsdPerMillionTokens: pricing.cacheReadUsdPerMillionTokens,
    agencyMarkupPercent,
  };
}

export function calculateAnthropicCostMicroUsd(
  model: string,
  usage: AnthropicUsage,
) {
  const pricing = getPricing(model);
  return Math.max(
    0,
    Math.ceil(
      usage.inputTokens * pricing.inputUsdPerMillionTokens +
        usage.outputTokens * pricing.outputUsdPerMillionTokens +
        usage.cacheCreationInputTokens * pricing.cacheWriteUsdPerMillionTokens +
        usage.cacheReadInputTokens * pricing.cacheReadUsdPerMillionTokens,
    ),
  );
}

function calculateBillableCostMicroUsd(
  providerCostMicroUsd: number,
  markupPercent: number,
) {
  return Math.max(
    0,
    Math.ceil(providerCostMicroUsd * (1 + markupPercent / 100)),
  );
}

export async function getAnthropicMonthlySpendState(params: {
  tenantId: string;
  limits: AnthropicUsageLimits;
  now?: Date;
}) {
  const since = startOfUtcMonth(params.now);
  const { getAiUsageTotals } = await import("@/lib/db/ai-usage-repository");
  const totals = await getAiUsageTotals({ tenantId: params.tenantId, since });
  const messages = totals._count._all;
  const tokens =
    (totals._sum.inputTokens ?? 0) +
    (totals._sum.outputTokens ?? 0) +
    (totals._sum.cacheCreationInputTokens ?? 0) +
    (totals._sum.cacheReadInputTokens ?? 0);
  const usedMicroUsd = totals._sum.providerCostMicroUsd ?? 0;
  const billableMicroUsd = totals._sum.billableCostMicroUsd ?? 0;
  const budgetMicroUsd = Math.round(params.limits.monthlyBudgetUsd * 1_000_000);
  const utilization = {
    messages:
      params.limits.monthlyMessageLimit > 0
        ? (messages / params.limits.monthlyMessageLimit) * 100
        : 100,
    tokens:
      params.limits.monthlyTokenLimit > 0
        ? (tokens / params.limits.monthlyTokenLimit) * 100
        : 100,
    dollars: budgetMicroUsd > 0 ? (usedMicroUsd / budgetMicroUsd) * 100 : 100,
  };

  return {
    periodStart: since,
    messages,
    messageLimit: params.limits.monthlyMessageLimit,
    tokens,
    tokenLimit: params.limits.monthlyTokenLimit,
    usedMicroUsd,
    billableMicroUsd,
    budgetMicroUsd,
    usedUsd: usedMicroUsd / 1_000_000,
    billableUsd: billableMicroUsd / 1_000_000,
    budgetUsd: budgetMicroUsd / 1_000_000,
    remainingUsd: Math.max(0, budgetMicroUsd - usedMicroUsd) / 1_000_000,
    utilization,
    warning:
      Math.max(utilization.messages, utilization.tokens, utilization.dollars) >=
      params.limits.warningPercent,
    hardLimitReached:
      messages >= params.limits.monthlyMessageLimit ||
      tokens >= params.limits.monthlyTokenLimit ||
      usedMicroUsd >= budgetMicroUsd,
  };
}

export async function reserveAnthropicGeneration(params: {
  tenantId: string;
  businessId?: string | null;
  leadId?: string | null;
  correlationId: string;
  operation: string;
  model: string;
  limits: AnthropicUsageLimits;
}) {
  const usage: AnthropicUsage = {
    inputTokens: ESTIMATED_MAX_INPUT_TOKENS,
    outputTokens: ESTIMATED_MAX_OUTPUT_TOKENS,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
  const providerCostMicroUsd = calculateAnthropicCostMicroUsd(
    params.model,
    usage,
  );
  const billableCostMicroUsd = calculateBillableCostMicroUsd(
    providerCostMicroUsd,
    params.limits.agencyMarkupPercent,
  );
  const { reserveAiGenerationUsage, createAiGenerationUsage } =
    await import("@/lib/db/ai-usage-repository");
  const result = await reserveAiGenerationUsage({
    tenantId: params.tenantId,
    businessId: params.businessId,
    leadId: params.leadId,
    correlationId: params.correlationId,
    operation: params.operation,
    model: params.model,
    reservedInputTokens: usage.inputTokens,
    reservedOutputTokens: usage.outputTokens,
    reservedProviderCostMicroUsd: providerCostMicroUsd,
    reservedBillableCostMicroUsd: billableCostMicroUsd,
    rateSnapshotJson: buildRateSnapshot(
      params.model,
      params.limits.agencyMarkupPercent,
    ),
    since: startOfUtcMonth(),
    limits: {
      messageLimit: params.limits.monthlyMessageLimit,
      tokenLimit: params.limits.monthlyTokenLimit,
      costLimitMicroUsd: Math.round(params.limits.monthlyBudgetUsd * 1_000_000),
    },
  });

  if (!result.reserved) {
    await createAiGenerationUsage({
      tenantId: params.tenantId,
      businessId: params.businessId ?? null,
      leadId: params.leadId ?? null,
      correlationId: params.correlationId,
      provider: "ANTHROPIC",
      operation: params.operation,
      model: params.model,
      resultStatus: "BLOCKED",
      rateSnapshotJson: buildRateSnapshot(
        params.model,
        params.limits.agencyMarkupPercent,
      ),
      failureReason: result.reason,
    });
    throw new AnthropicHardLimitError(result.reason);
  }

  return result;
}

export async function settleAnthropicGeneration(params: {
  tenantId: string;
  correlationId: string;
  model: string;
  limits: AnthropicUsageLimits;
  usage: AnthropicUsage | null;
  latencyMs: number;
  resultStatus: "SUCCESS" | "FAILED";
  failureReason?: string | null;
}) {
  const usage = params.usage ?? {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
  const providerCostMicroUsd = calculateAnthropicCostMicroUsd(
    params.model,
    usage,
  );
  const billableCostMicroUsd = calculateBillableCostMicroUsd(
    providerCostMicroUsd,
    params.limits.agencyMarkupPercent,
  );
  const { settleAiGenerationUsage } =
    await import("@/lib/db/ai-usage-repository");

  await settleAiGenerationUsage({
    tenantId: params.tenantId,
    correlationId: params.correlationId,
    resultStatus: params.resultStatus,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheCreationInputTokens: usage.cacheCreationInputTokens,
    cacheReadInputTokens: usage.cacheReadInputTokens,
    latencyMs: params.latencyMs,
    providerCostMicroUsd,
    billableCostMicroUsd,
    rateSnapshotJson: buildRateSnapshot(
      params.model,
      params.limits.agencyMarkupPercent,
    ),
    failureReason: params.failureReason,
  });

  return { providerCostMicroUsd, billableCostMicroUsd };
}
