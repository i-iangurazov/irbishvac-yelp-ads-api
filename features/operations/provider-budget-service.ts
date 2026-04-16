import "server-only";

import { incrementOperationalMetricCounter } from "@/lib/db/metrics-repository";
import { YelpValidationError } from "@/lib/yelp/errors";

type ProviderName = "YELP" | "SMTP" | "OPENAI" | "SERVICETITAN";

const hourlyProviderBudgets: Record<ProviderName, number> = {
  YELP: 600,
  SMTP: 250,
  OPENAI: 300,
  SERVICETITAN: 500
};

export async function claimProviderRequestBudget(params: {
  tenantId: string;
  provider: ProviderName;
  operation: string;
  businessId?: string | null;
}) {
  const providerMetricKey = `provider.${params.provider.toLowerCase()}.requests`;
  const total = await incrementOperationalMetricCounter({
    tenantId: params.tenantId,
    metricKey: providerMetricKey,
    bucketMinutes: 60,
    dimensions: {
      provider: params.provider
    }
  });

  await incrementOperationalMetricCounter({
    tenantId: params.tenantId,
    metricKey: providerMetricKey,
    bucketMinutes: 60,
    dimensions: {
      provider: params.provider,
      operation: params.operation,
      ...(params.businessId ? { businessId: params.businessId } : {})
    }
  });

  const limit = hourlyProviderBudgets[params.provider];

  if (total.totalValue > limit) {
    await incrementOperationalMetricCounter({
      tenantId: params.tenantId,
      metricKey: "provider.rate_budget.rejected",
      bucketMinutes: 60,
      dimensions: {
        provider: params.provider,
        operation: params.operation
      }
    });

    throw new YelpValidationError(
      `${params.provider} request budget exceeded for this tenant. Pause retries and review provider health before continuing.`
    );
  }

  return {
    provider: params.provider,
    operation: params.operation,
    used: total.totalValue,
    limit
  };
}
