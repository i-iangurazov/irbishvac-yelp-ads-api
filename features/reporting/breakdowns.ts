import type { CrmLeadMappingState, InternalLeadStatus } from "@prisma/client";

import { reportUnknownBucketValue, type ReportBreakdownFiltersInput } from "@/features/reporting/schemas";

type UnknownRecord = Record<string, unknown>;

export type ReportingDimension = "location" | "service";

export type ReportBreakdownLead = {
  createdAtYelp: Date;
  internalStatus: InternalLeadStatus;
  locationId?: string | null;
  serviceCategoryId?: string | null;
  business?: {
    locationId?: string | null;
  } | null;
  crmLeadMappings?: Array<{
    state: CrmLeadMappingState;
  }> | null;
};

export type ReportBreakdownResult = {
  business?: {
    locationId?: string | null;
  } | null;
  metricsSummaryJson?: unknown;
  payloadJson?: unknown;
};

export type ReportBreakdownOptions = {
  locations: ReadonlyArray<{ id: string; name: string }>;
  serviceCategories: ReadonlyArray<{ id: string; name: string; slug: string }>;
};

export type ReportBreakdownRow = {
  bucketId: string;
  bucketLabel: string;
  totalLeads: number;
  mappedLeads: number;
  active: number;
  contacted: number;
  booked: number;
  scheduled: number;
  jobInProgress: number;
  completed: number;
  won: number;
  lost: number;
  mappingRate: number;
  bookedRate: number;
  scheduledRate: number;
  completionRate: number;
  winRate: number;
  closeRate: number;
  yelpSpendCents: number;
  costPerLeadCents: number | null;
  costPerBookedJobCents: number | null;
  costPerCompletedJobCents: number | null;
  leadSharePct: number;
  spendSharePct: number;
};

type SpendEntry = {
  date: Date | null;
  locationBucketId: string;
  serviceBucketId: string;
  yelpSpendCents: number;
};

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function getString(record: UnknownRecord | null, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getNumber(record: UnknownRecord | null, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function roundPct(value: number) {
  return Number(value.toFixed(1));
}

function isResolvedMappingState(state: CrmLeadMappingState | null | undefined) {
  return state === "MATCHED" || state === "MANUAL_OVERRIDE";
}

function inRange(date: Date | null, from: Date, to: Date) {
  if (!date) {
    return true;
  }

  return date.getTime() >= from.getTime() && date.getTime() <= to.getTime();
}

function resolveLeadLocationBucketId(lead: ReportBreakdownLead) {
  return lead.locationId ?? lead.business?.locationId ?? reportUnknownBucketValue;
}

function resolveLeadServiceBucketId(lead: ReportBreakdownLead) {
  return lead.serviceCategoryId ?? reportUnknownBucketValue;
}

function resolveLocationLabel(bucketId: string, options: ReportBreakdownOptions) {
  if (bucketId === reportUnknownBucketValue) {
    return "Unknown location";
  }

  return options.locations.find((location) => location.id === bucketId)?.name ?? "Unknown location";
}

function resolveServiceLabel(bucketId: string, options: ReportBreakdownOptions) {
  if (bucketId === reportUnknownBucketValue) {
    return "Unknown service";
  }

  return options.serviceCategories.find((serviceCategory) => serviceCategory.id === bucketId)?.name ?? "Unknown service";
}

function buildServiceLookup(options: ReportBreakdownOptions) {
  const byId = new Map(options.serviceCategories.map((serviceCategory) => [serviceCategory.id, serviceCategory.id]));
  const bySlug = new Map(options.serviceCategories.map((serviceCategory) => [serviceCategory.slug.toLowerCase(), serviceCategory.id]));
  const byName = new Map(options.serviceCategories.map((serviceCategory) => [serviceCategory.name.toLowerCase(), serviceCategory.id]));

  return {
    byId,
    bySlug,
    byName
  };
}

function resolveServiceBucketIdFromRow(row: UnknownRecord | null, options: ReportBreakdownOptions) {
  if (!row) {
    return reportUnknownBucketValue;
  }

  const lookup = buildServiceLookup(options);
  const byId = getString(row, ["serviceCategoryId", "service_category_id"]);

  if (byId && lookup.byId.has(byId)) {
    return lookup.byId.get(byId)!;
  }

  const slug = getString(row, ["serviceCategorySlug", "service_category_slug", "serviceSlug", "service_slug"]);

  if (slug && lookup.bySlug.has(slug.toLowerCase())) {
    return lookup.bySlug.get(slug.toLowerCase())!;
  }

  const name = getString(row, ["serviceCategory", "service_category", "service", "serviceName", "service_name"]);

  if (name && lookup.byName.has(name.toLowerCase())) {
    return lookup.byName.get(name.toLowerCase())!;
  }

  return reportUnknownBucketValue;
}

function resolveSpendDate(row: UnknownRecord | null) {
  return parseDate(getString(row, ["date", "day", "month", "windowStart", "window_start"]));
}

function getResultTotals(result: ReportBreakdownResult) {
  const metricsRecord = asRecord(result.metricsSummaryJson);
  const payloadRecord = asRecord(result.payloadJson);
  const totalsRecord = asRecord(payloadRecord?.totals);

  return {
    adSpendCents: getNumber(metricsRecord, ["adSpendCents"]) ?? getNumber(totalsRecord, ["adSpendCents"]) ?? 0
  };
}

function buildSpendEntries(
  results: ReportBreakdownResult[],
  options: ReportBreakdownOptions
) {
  const entries: SpendEntry[] = [];

  for (const result of results) {
    const payloadRecord = asRecord(result.payloadJson);
    const payloadRows = Array.isArray(payloadRecord?.rows) ? payloadRecord.rows : [];
    const locationBucketId = result.business?.locationId ?? reportUnknownBucketValue;
    let appendedRowLevelSpend = false;

    for (const row of payloadRows) {
      const rowRecord = asRecord(row);
      const spendCents = getNumber(rowRecord, ["adSpendCents"]);

      if (typeof spendCents !== "number" || spendCents <= 0) {
        continue;
      }

      entries.push({
        date: resolveSpendDate(rowRecord),
        locationBucketId,
        serviceBucketId: resolveServiceBucketIdFromRow(rowRecord, options),
        yelpSpendCents: spendCents
      });
      appendedRowLevelSpend = true;
    }

    if (!appendedRowLevelSpend) {
      const totals = getResultTotals(result);

      if (totals.adSpendCents > 0) {
        entries.push({
          date: null,
          locationBucketId,
          serviceBucketId: reportUnknownBucketValue,
          yelpSpendCents: totals.adSpendCents
        });
      }
    }
  }

  return entries;
}

function matchesBucketFilter(bucketId: string, selected?: string) {
  if (!selected) {
    return true;
  }

  return bucketId === selected;
}

export function buildReportBreakdown(params: {
  view: ReportingDimension;
  filters: Pick<ReportBreakdownFiltersInput, "from" | "to" | "locationId" | "serviceCategoryId"> & {
    from: string;
    to: string;
  };
  leads: ReportBreakdownLead[];
  results: ReportBreakdownResult[];
  options: ReportBreakdownOptions;
}) {
  const from = new Date(`${params.filters.from}T00:00:00.000Z`);
  const to = new Date(`${params.filters.to}T23:59:59.999Z`);
  const rows = new Map<string, ReportBreakdownRow>();

  const ensureRow = (bucketId: string) => {
    const existing = rows.get(bucketId);

    if (existing) {
      return existing;
    }

    const row: ReportBreakdownRow = {
      bucketId,
      bucketLabel:
        params.view === "location" ? resolveLocationLabel(bucketId, params.options) : resolveServiceLabel(bucketId, params.options),
      totalLeads: 0,
      mappedLeads: 0,
      active: 0,
      contacted: 0,
      booked: 0,
      scheduled: 0,
      jobInProgress: 0,
      completed: 0,
      won: 0,
      lost: 0,
      mappingRate: 0,
      bookedRate: 0,
      scheduledRate: 0,
      completionRate: 0,
      winRate: 0,
      closeRate: 0,
      yelpSpendCents: 0,
      costPerLeadCents: null,
      costPerBookedJobCents: null,
      costPerCompletedJobCents: null,
      leadSharePct: 0,
      spendSharePct: 0
    };

    rows.set(bucketId, row);
    return row;
  };

  for (const lead of params.leads) {
    if (!inRange(lead.createdAtYelp, from, to)) {
      continue;
    }

    const leadLocationBucketId = resolveLeadLocationBucketId(lead);
    const leadServiceBucketId = resolveLeadServiceBucketId(lead);

    if (!matchesBucketFilter(leadLocationBucketId, params.filters.locationId)) {
      continue;
    }

    if (!matchesBucketFilter(leadServiceBucketId, params.filters.serviceCategoryId)) {
      continue;
    }

    const row = ensureRow(params.view === "location" ? leadLocationBucketId : leadServiceBucketId);

    row.totalLeads += 1;

    if (isResolvedMappingState(lead.crmLeadMappings?.[0]?.state)) {
      row.mappedLeads += 1;
    }

    if (lead.internalStatus === "ACTIVE") {
      row.active += 1;
    }

    if (lead.internalStatus === "CONTACTED") {
      row.contacted += 1;
    }

    if (lead.internalStatus === "BOOKED") {
      row.booked += 1;
    }

    if (lead.internalStatus === "SCHEDULED") {
      row.scheduled += 1;
    }

    if (lead.internalStatus === "JOB_IN_PROGRESS") {
      row.jobInProgress += 1;
    }

    if (lead.internalStatus === "COMPLETED" || lead.internalStatus === "CLOSED_WON") {
      row.completed += 1;
    }

    if (lead.internalStatus === "CLOSED_WON") {
      row.won += 1;
    }

    if (lead.internalStatus === "CLOSED_LOST" || lead.internalStatus === "LOST") {
      row.lost += 1;
    }
  }

  const spendEntries = buildSpendEntries(params.results, params.options);

  for (const entry of spendEntries) {
    if (!inRange(entry.date, from, to)) {
      continue;
    }

    if (!matchesBucketFilter(entry.locationBucketId, params.filters.locationId)) {
      continue;
    }

    if (!matchesBucketFilter(entry.serviceBucketId, params.filters.serviceCategoryId)) {
      continue;
    }

    const row = ensureRow(params.view === "location" ? entry.locationBucketId : entry.serviceBucketId);
    row.yelpSpendCents += entry.yelpSpendCents;
  }

  const outputRows = [...rows.values()].sort((left, right) => {
    if (left.bucketId === reportUnknownBucketValue && right.bucketId !== reportUnknownBucketValue) {
      return 1;
    }

    if (right.bucketId === reportUnknownBucketValue && left.bucketId !== reportUnknownBucketValue) {
      return -1;
    }

    if (left.totalLeads !== right.totalLeads) {
      return right.totalLeads - left.totalLeads;
    }

    if (left.yelpSpendCents !== right.yelpSpendCents) {
      return right.yelpSpendCents - left.yelpSpendCents;
    }

    return left.bucketLabel.localeCompare(right.bucketLabel);
  });

  const totals = outputRows.reduce(
    (combined, row) => ({
      totalLeads: combined.totalLeads + row.totalLeads,
      mappedLeads: combined.mappedLeads + row.mappedLeads,
      active: combined.active + row.active,
      contacted: combined.contacted + row.contacted,
      booked: combined.booked + row.booked,
      scheduled: combined.scheduled + row.scheduled,
      jobInProgress: combined.jobInProgress + row.jobInProgress,
      completed: combined.completed + row.completed,
      won: combined.won + row.won,
      lost: combined.lost + row.lost,
      yelpSpendCents: combined.yelpSpendCents + row.yelpSpendCents
    }),
    {
      totalLeads: 0,
      mappedLeads: 0,
      active: 0,
      contacted: 0,
      booked: 0,
      scheduled: 0,
      jobInProgress: 0,
      completed: 0,
      won: 0,
      lost: 0,
      yelpSpendCents: 0
    }
  );

  for (const row of outputRows) {
    row.mappingRate = row.totalLeads > 0 ? roundPct((row.mappedLeads / row.totalLeads) * 100) : 0;
    row.bookedRate = row.totalLeads > 0 ? roundPct((row.booked / row.totalLeads) * 100) : 0;
    row.scheduledRate = row.totalLeads > 0 ? roundPct((row.scheduled / row.totalLeads) * 100) : 0;
    row.completionRate = row.totalLeads > 0 ? roundPct((row.completed / row.totalLeads) * 100) : 0;
    row.winRate = row.totalLeads > 0 ? roundPct((row.won / row.totalLeads) * 100) : 0;
    row.closeRate = row.totalLeads > 0 ? roundPct((row.completed / row.totalLeads) * 100) : 0;
    row.costPerLeadCents = row.totalLeads > 0 ? Math.round(row.yelpSpendCents / row.totalLeads) : null;
    row.costPerBookedJobCents = row.booked > 0 ? Math.round(row.yelpSpendCents / row.booked) : null;
    row.costPerCompletedJobCents = row.completed > 0 ? Math.round(row.yelpSpendCents / row.completed) : null;
    row.leadSharePct = totals.totalLeads > 0 ? roundPct((row.totalLeads / totals.totalLeads) * 100) : 0;
    row.spendSharePct = totals.yelpSpendCents > 0 ? roundPct((row.yelpSpendCents / totals.yelpSpendCents) * 100) : 0;
  }

  return {
    view: params.view,
    rows: outputRows,
    totals: {
      ...totals,
      mappingRate: totals.totalLeads > 0 ? roundPct((totals.mappedLeads / totals.totalLeads) * 100) : 0,
      bookedRate: totals.totalLeads > 0 ? roundPct((totals.booked / totals.totalLeads) * 100) : 0,
      scheduledRate: totals.totalLeads > 0 ? roundPct((totals.scheduled / totals.totalLeads) * 100) : 0,
      completionRate: totals.totalLeads > 0 ? roundPct((totals.completed / totals.totalLeads) * 100) : 0,
      winRate: totals.totalLeads > 0 ? roundPct((totals.won / totals.totalLeads) * 100) : 0,
      closeRate: totals.totalLeads > 0 ? roundPct((totals.completed / totals.totalLeads) * 100) : 0,
      costPerLeadCents: totals.totalLeads > 0 ? Math.round(totals.yelpSpendCents / totals.totalLeads) : null,
      costPerBookedJobCents: totals.booked > 0 ? Math.round(totals.yelpSpendCents / totals.booked) : null,
      costPerCompletedJobCents: totals.completed > 0 ? Math.round(totals.yelpSpendCents / totals.completed) : null
    }
  };
}

export function buildBreakdownCsvRows(breakdown: { rows: ReportBreakdownRow[] }) {
  return breakdown.rows.map((row) => ({
    bucket: row.bucketLabel,
    yelpLeadIntakeCount: row.totalLeads,
    partnerMappedLeads: row.mappedLeads,
    partnerActive: row.active,
    partnerContacted: row.contacted,
    partnerBooked: row.booked,
    partnerScheduled: row.scheduled,
    partnerJobInProgress: row.jobInProgress,
    partnerCompleted: row.completed,
    partnerWon: row.won,
    partnerLost: row.lost,
    derivedMappingRatePct: row.mappingRate,
    derivedBookedRatePct: row.bookedRate,
    derivedScheduledRatePct: row.scheduledRate,
    derivedCompletionRatePct: row.completionRate,
    derivedWinRatePct: row.winRate,
    derivedCloseRatePct: row.closeRate,
    yelpSpendCents: row.yelpSpendCents,
    leadSharePct: row.leadSharePct,
    spendSharePct: row.spendSharePct,
    derivedCostPerLeadCents: row.costPerLeadCents,
    derivedCostPerBookedLeadCents: row.costPerBookedJobCents,
    derivedCostPerCompletedJobCents: row.costPerCompletedJobCents
  }));
}
