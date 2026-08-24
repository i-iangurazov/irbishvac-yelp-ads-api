export const YELP_REPORTING_TIMEZONE = "America/Los_Angeles";
export const YELP_PROGRAM_SPEND_SOURCE =
  "Yelp Program List · program_metrics.ad_cost";
export const YELP_DAILY_SNAPSHOT_SPEND_SOURCE =
  "Derived from daily Yelp Program List billing-period snapshots";

const SNAPSHOT_RETENTION_DAYS = 400;

export type ProgramSpendDailySnapshot = {
  observedDate: string;
  observedAt: string;
  amountCents: number;
  currency: string;
  feePeriod: string | null;
  source: typeof YELP_PROGRAM_SPEND_SOURCE;
};

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asSnapshot(value: unknown): ProgramSpendDailySnapshot | null {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.observedDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(record.observedDate) ||
    typeof record.observedAt !== "string" ||
    Number.isNaN(Date.parse(record.observedAt)) ||
    typeof record.amountCents !== "number" ||
    !Number.isFinite(record.amountCents) ||
    record.amountCents < 0 ||
    typeof record.currency !== "string"
  ) {
    return null;
  }

  return {
    observedDate: record.observedDate,
    observedAt: record.observedAt,
    amountCents: Math.round(record.amountCents),
    currency: record.currency,
    feePeriod: typeof record.feePeriod === "string" ? record.feePeriod : null,
    source: YELP_PROGRAM_SPEND_SOURCE,
  };
}

export function getDatePartsInTimeZone(
  now: Date,
  timeZone = YELP_REPORTING_TIMEZONE,
) {
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

export function getPacificDateKey(now: Date) {
  const { year, month, day } = getDatePartsInTimeZone(now);
  return `${year}-${month}-${day}`;
}

export function getPacificMtdDateRange(now = new Date()) {
  const { year, month, day } = getDatePartsInTimeZone(now);
  return {
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${day}`,
    timeZone: YELP_REPORTING_TIMEZONE,
  };
}

export function appendProgramSpendDailySnapshot(params: {
  existingConfiguration: unknown;
  observedAt: Date;
  amountCents: number | null | undefined;
  currency: string | null | undefined;
  feePeriod: string | null | undefined;
}) {
  const existing = asRecord(params.existingConfiguration);
  const previous = Array.isArray(existing?.programSpendDailySnapshots)
    ? existing.programSpendDailySnapshots
        .map(asSnapshot)
        .filter((snapshot): snapshot is ProgramSpendDailySnapshot =>
          Boolean(snapshot),
        )
    : [];

  if (
    typeof params.amountCents !== "number" ||
    !Number.isFinite(params.amountCents) ||
    params.amountCents < 0
  ) {
    return previous;
  }

  const next: ProgramSpendDailySnapshot = {
    observedDate: getPacificDateKey(params.observedAt),
    observedAt: params.observedAt.toISOString(),
    amountCents: Math.round(params.amountCents),
    currency: params.currency || "USD",
    feePeriod: params.feePeriod || null,
    source: YELP_PROGRAM_SPEND_SOURCE,
  };
  const byDate = new Map(
    [...previous, next].map((snapshot) => [snapshot.observedDate, snapshot]),
  );

  return [...byDate.values()]
    .sort((left, right) => left.observedDate.localeCompare(right.observedDate))
    .slice(-SNAPSHOT_RETENTION_DAYS);
}

export function deriveProgramMtdFromDailySnapshots(
  configuration: unknown,
  now = new Date(),
) {
  const record = asRecord(configuration);
  const snapshots = Array.isArray(record?.programSpendDailySnapshots)
    ? record.programSpendDailySnapshots
        .map(asSnapshot)
        .filter((snapshot): snapshot is ProgramSpendDailySnapshot =>
          Boolean(snapshot),
        )
        .sort((left, right) =>
          left.observedDate.localeCompare(right.observedDate),
        )
    : [];
  const range = getPacificMtdDateRange(now);
  const baseline = snapshots
    .filter((snapshot) => snapshot.observedDate < range.startDate)
    .at(-1);
  const inRange = snapshots.filter(
    (snapshot) =>
      snapshot.observedDate >= range.startDate &&
      snapshot.observedDate <= range.endDate,
  );

  if (!baseline || inRange.length === 0) {
    return null;
  }

  const currency = inRange.at(-1)!.currency;
  if (
    baseline.currency !== currency ||
    inRange.some((snapshot) => snapshot.currency !== currency)
  ) {
    return null;
  }

  let previousAmount = baseline.amountCents;
  let amountCents = 0;
  for (const snapshot of inRange) {
    amountCents +=
      snapshot.amountCents >= previousAmount
        ? snapshot.amountCents - previousAmount
        : snapshot.amountCents;
    previousAmount = snapshot.amountCents;
  }
  const latest = inRange.at(-1)!;

  return {
    amountCents,
    currency,
    periodStart: range.startDate,
    periodEnd: latest.observedDate,
    expectedPeriodEnd: range.endDate,
    lastSuccessfulSync: latest.observedAt,
    source: YELP_DAILY_SNAPSHOT_SPEND_SOURCE,
  };
}
