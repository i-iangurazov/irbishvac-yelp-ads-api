import { getProgramCampaignLayer } from "@/features/ads-programs/layers";

export const YELP_REPORTING_TIMEZONE = "America/Los_Angeles";
export const YELP_PROGRAM_SPEND_SOURCE =
  "Yelp Program List · program_metrics.ad_cost";

type ProgramMetricSource = {
  budgetCents: number | null;
  configurationJson: unknown;
  summaryJson: unknown;
  currency?: string;
  lastSyncedAt?: Date | string | null;
};

type ProgramSpendStatus = "current" | "stale" | "pending" | "error" | "missing";

type ProgramSpendState = {
  amountCents: number | null;
  mtdAmountCents: number | null;
  currency: string;
  periodLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  source: string;
  lastSuccessfulSync: string | null;
  status: ProgramSpendStatus;
  warning: string | null;
};

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonNegativeCents(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

function asIsoDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

function asIsoDateTime(value: unknown) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return null;
  }

  return value;
}

function getDatePartsInTimeZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

export function getPacificMtdDateRange(now = new Date()) {
  const { year, month, day } = getDatePartsInTimeZone(
    now,
    YELP_REPORTING_TIMEZONE,
  );

  return {
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${day}`,
    timeZone: YELP_REPORTING_TIMEZONE,
  };
}

export function getProgramSpendState(
  program: ProgramMetricSource,
  now = new Date(),
): ProgramSpendState {
  const configuration = asRecord(program.configurationJson);
  const evidence = asRecord(configuration?.programSpendEvidence);
  const expectedRange = getPacificMtdDateRange(now);
  const evidenceAmount = asNonNegativeCents(evidence?.amountCents);
  const evidenceStart = asIsoDate(evidence?.periodStart);
  const evidenceEnd = asIsoDate(evidence?.periodEnd);
  const evidenceSource =
    typeof evidence?.source === "string"
      ? evidence.source
      : "Yelp date-bounded reporting";
  const evidenceCurrency =
    typeof evidence?.currency === "string"
      ? evidence.currency
      : (program.currency ?? "USD");
  const evidenceSync = asIsoDateTime(evidence?.lastSuccessfulSync);

  if (
    evidence?.kind === "DATE_BOUNDED_MTD" &&
    evidenceAmount !== null &&
    evidenceStart &&
    evidenceEnd
  ) {
    const isCurrentRange =
      evidenceStart === expectedRange.startDate &&
      evidenceEnd === expectedRange.endDate;

    return {
      amountCents: evidenceAmount,
      mtdAmountCents: isCurrentRange ? evidenceAmount : null,
      currency: evidenceCurrency,
      periodLabel: `${evidenceStart} through ${evidenceEnd} · Pacific time`,
      periodStart: evidenceStart,
      periodEnd: evidenceEnd,
      source: evidenceSource,
      lastSuccessfulSync: evidenceSync,
      status: isCurrentRange ? "current" : "stale",
      warning: isCurrentRange
        ? null
        : "The date-bounded spend evidence is not for the current Pacific-time MTD range.",
    };
  }

  if (evidence?.status === "ERROR") {
    return {
      amountCents: null,
      mtdAmountCents: null,
      currency: evidenceCurrency,
      periodLabel: "Current Pacific-time MTD",
      periodStart: expectedRange.startDate,
      periodEnd: expectedRange.endDate,
      source: evidenceSource,
      lastSuccessfulSync: evidenceSync,
      status: "error",
      warning:
        typeof evidence.error === "string"
          ? evidence.error
          : "Yelp spend reporting failed.",
    };
  }

  if (evidence?.status === "PENDING") {
    return {
      amountCents: null,
      mtdAmountCents: null,
      currency: evidenceCurrency,
      periodLabel: "Current Pacific-time MTD",
      periodStart: expectedRange.startDate,
      periodEnd: expectedRange.endDate,
      source: evidenceSource,
      lastSuccessfulSync: evidenceSync,
      status: "pending",
      warning: "A date-bounded Yelp spend refresh is pending.",
    };
  }

  const summary = asRecord(program.summaryJson);
  const metrics = asRecord(summary?.program_metrics);
  const adCost = asNonNegativeCents(metrics?.ad_cost);
  const feePeriod =
    typeof metrics?.fee_period === "string" ? metrics.fee_period : null;
  const syncedAt =
    program.lastSyncedAt instanceof Date
      ? program.lastSyncedAt.toISOString()
      : asIsoDateTime(program.lastSyncedAt);

  if (adCost !== null) {
    return {
      amountCents: adCost,
      mtdAmountCents: null,
      currency:
        typeof metrics?.currency === "string"
          ? metrics.currency
          : (program.currency ?? "USD"),
      periodLabel: feePeriod
        ? `Yelp fee period: ${feePeriod}`
        : "Yelp billing period not specified",
      periodStart: null,
      periodEnd: null,
      source: YELP_PROGRAM_SPEND_SOURCE,
      lastSuccessfulSync: syncedAt,
      status: "current",
      warning:
        "Yelp Program List does not prove that ad_cost is calendar MTD. This amount is not used as MTD evidence.",
    };
  }

  return {
    amountCents: null,
    mtdAmountCents: null,
    currency: program.currency ?? "USD",
    periodLabel: "No reporting period available",
    periodStart: null,
    periodEnd: null,
    source: YELP_PROGRAM_SPEND_SOURCE,
    lastSuccessfulSync: syncedAt,
    status: "missing",
    warning: "Yelp has not returned spend for this campaign.",
  };
}

export function getProgramMtdSpendCents(program: ProgramMetricSource) {
  return getProgramSpendState(program).mtdAmountCents;
}

export function getProgramSpendPeriod(program: ProgramMetricSource) {
  return getProgramSpendState(program).periodLabel;
}

export function inferProgramCampaignLayer(program: ProgramMetricSource) {
  const storedLayer = getProgramCampaignLayer(program.configurationJson);

  if (storedLayer !== "GENERAL") {
    return storedLayer;
  }

  return program.budgetCents === 6_000_000 ? "MAIN" : "GENERAL";
}
