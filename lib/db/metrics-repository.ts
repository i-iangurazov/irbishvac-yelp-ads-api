import "server-only";

import type { OperationalMetricKind, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { toJsonValue } from "@/lib/db/json";

type MetricDimensions = Record<string, string | number | boolean | null | undefined>;

function normalizeDimensions(dimensions?: MetricDimensions) {
  const entries = Object.entries(dimensions ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, String(value)] as const);

  return {
    dimensionKey: entries.length > 0 ? entries.map(([key, value]) => `${key}=${value}`).join("|") : "all",
    dimensionsJson: entries.length > 0 ? Object.fromEntries(entries) : null
  };
}

function getMetricBucketStart(observedAt: Date, bucketMinutes = 60) {
  const bucketMs = bucketMinutes * 60 * 1000;
  const bucketStart = Math.floor(observedAt.getTime() / bucketMs) * bucketMs;
  return new Date(bucketStart);
}

async function upsertMetricBase(params: {
  tenantId: string;
  metricKey: string;
  kind: OperationalMetricKind;
  observedAt?: Date;
  bucketMinutes?: number;
  dimensions?: MetricDimensions;
  createData: Pick<Prisma.OperationalMetricRollupCreateInput, "totalValue" | "sampleCount" | "lastValue">;
  updateData: Pick<Prisma.OperationalMetricRollupUpdateInput, "totalValue" | "sampleCount" | "lastValue">;
}) {
  const observedAt = params.observedAt ?? new Date();
  const bucketMinutes = params.bucketMinutes ?? 60;
  const bucketStart = getMetricBucketStart(observedAt, bucketMinutes);
  const { dimensionKey, dimensionsJson } = normalizeDimensions(params.dimensions);

  return prisma.operationalMetricRollup.upsert({
    where: {
      tenantId_metricKey_bucketStart_dimensionKey: {
        tenantId: params.tenantId,
        metricKey: params.metricKey,
        bucketStart,
        dimensionKey
      }
    },
    update: params.updateData,
    create: {
      tenantId: params.tenantId,
      metricKey: params.metricKey,
      kind: params.kind,
      bucketStart,
      bucketMinutes,
      dimensionKey,
      dimensionsJson: dimensionsJson ? toJsonValue(dimensionsJson) : undefined,
      ...params.createData
    }
  });
}

export async function incrementOperationalMetricCounter(params: {
  tenantId: string;
  metricKey: string;
  amount?: number;
  observedAt?: Date;
  bucketMinutes?: number;
  dimensions?: MetricDimensions;
}) {
  const amount = params.amount ?? 1;

  return upsertMetricBase({
    tenantId: params.tenantId,
    metricKey: params.metricKey,
    kind: "COUNTER",
    observedAt: params.observedAt,
    bucketMinutes: params.bucketMinutes,
    dimensions: params.dimensions,
    createData: {
      totalValue: amount,
      sampleCount: 1,
      lastValue: amount
    },
    updateData: {
      totalValue: { increment: amount },
      sampleCount: { increment: 1 },
      lastValue: amount
    }
  });
}

export async function recordOperationalMetricDistribution(params: {
  tenantId: string;
  metricKey: string;
  value: number;
  observedAt?: Date;
  bucketMinutes?: number;
  dimensions?: MetricDimensions;
}) {
  const value = Math.max(0, Math.trunc(params.value));

  return upsertMetricBase({
    tenantId: params.tenantId,
    metricKey: params.metricKey,
    kind: "DISTRIBUTION",
    observedAt: params.observedAt,
    bucketMinutes: params.bucketMinutes,
    dimensions: params.dimensions,
    createData: {
      totalValue: value,
      sampleCount: 1,
      lastValue: value
    },
    updateData: {
      totalValue: { increment: value },
      sampleCount: { increment: 1 },
      lastValue: value
    }
  });
}

export async function setOperationalMetricGauge(params: {
  tenantId: string;
  metricKey: string;
  value: number;
  observedAt?: Date;
  bucketMinutes?: number;
  dimensions?: MetricDimensions;
}) {
  const value = Math.max(0, Math.trunc(params.value));

  return upsertMetricBase({
    tenantId: params.tenantId,
    metricKey: params.metricKey,
    kind: "GAUGE",
    observedAt: params.observedAt,
    bucketMinutes: params.bucketMinutes,
    dimensions: params.dimensions,
    createData: {
      totalValue: value,
      sampleCount: 1,
      lastValue: value
    },
    updateData: {
      totalValue: value,
      sampleCount: 1,
      lastValue: value
    }
  });
}

export async function listOperationalMetricRollups(params: {
  tenantId: string;
  metricKeys?: string[];
  since?: Date;
  bucketMinutes?: number;
}) {
  return prisma.operationalMetricRollup.findMany({
    where: {
      tenantId: params.tenantId,
      ...(params.metricKeys?.length ? { metricKey: { in: params.metricKeys } } : {}),
      ...(params.since ? { bucketStart: { gte: params.since } } : {}),
      ...(params.bucketMinutes ? { bucketMinutes: params.bucketMinutes } : {})
    },
    orderBy: [{ bucketStart: "asc" }, { metricKey: "asc" }, { dimensionKey: "asc" }]
  });
}
