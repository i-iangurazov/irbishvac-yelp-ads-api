import "server-only";

import { z } from "zod";

import { listAiGenerationUsage } from "@/lib/db/ai-usage-repository";

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a YYYY-MM month.");

function parseMonth(month: string) {
  const value = monthSchema.parse(month);
  const [year, monthNumber] = value.split("-").map(Number);
  const since = new Date(Date.UTC(year, monthNumber - 1, 1));
  const until = new Date(Date.UTC(year, monthNumber, 1));

  return { value, since, until };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function csvValue(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const injectionSafe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${injectionSafe.replaceAll('"', '""')}"`;
}

export async function exportAiUsageToCsv(tenantId: string, month: string) {
  const period = parseMonth(month);
  const rows = await listAiGenerationUsage({
    tenantId,
    since: period.since,
    until: period.until,
  });
  const headers = [
    "period",
    "created_at_utc",
    "business_id",
    "correlation_id",
    "operation",
    "provider",
    "model",
    "result",
    "input_tokens",
    "output_tokens",
    "cache_write_tokens",
    "cache_read_tokens",
    "total_tokens",
    "latency_ms",
    "provider_cost_usd",
    "agency_markup_percent",
    "billable_cost_usd",
    "failure_reason",
  ];
  const body = rows.map((row) => {
    const rates = asRecord(row.rateSnapshotJson);
    const totalTokens =
      row.inputTokens +
      row.outputTokens +
      row.cacheCreationInputTokens +
      row.cacheReadInputTokens;

    return [
      period.value,
      row.createdAt.toISOString(),
      row.businessId,
      row.correlationId,
      row.operation,
      row.provider,
      row.model,
      row.resultStatus,
      row.inputTokens,
      row.outputTokens,
      row.cacheCreationInputTokens,
      row.cacheReadInputTokens,
      totalTokens,
      row.latencyMs,
      (row.providerCostMicroUsd / 1_000_000).toFixed(6),
      typeof rates.agencyMarkupPercent === "number"
        ? rates.agencyMarkupPercent
        : 0,
      (row.billableCostMicroUsd / 1_000_000).toFixed(6),
      row.failureReason,
    ]
      .map(csvValue)
      .join(",");
  });

  return [headers.map(csvValue).join(","), ...body].join("\n");
}
