import { ProgramStatus, ProgramType } from "@prisma/client";

import type { YelpUpstreamProgramDto } from "@/lib/yelp/schemas";

const supportedProgramTypes = new Set<ProgramType>(Object.values(ProgramType));

const upstreamStatusMap = new Map<string, ProgramStatus>([
  ["DRAFT", "DRAFT"],
  ["QUEUED", "QUEUED"],
  ["PROCESSING", "PROCESSING"],
  ["ACTIVE", "ACTIVE"],
  ["SCHEDULED", "SCHEDULED"],
  ["FAILED", "FAILED"],
  ["PARTIAL", "PARTIAL"],
  ["INACTIVE", "ENDED"],
  ["ENDED", "ENDED"]
]);

function coerceObject(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function dollarsFromCents(cents: number) {
  return String(cents / 100);
}

export function resolveSynchronizedProgramType(programType: string) {
  return supportedProgramTypes.has(programType as ProgramType) ? (programType as ProgramType) : null;
}

export function resolveSynchronizedProgramStatus(programStatus: string) {
  return upstreamStatusMap.get(programStatus) ?? "FAILED";
}

export function resolveSynchronizedBudgetCents(program: YelpUpstreamProgramDto) {
  if (typeof program.program_metrics?.budget === "number") {
    return program.program_metrics.budget;
  }

  if (typeof program.page_upgrade_info?.monthly_rate === "number") {
    return Math.round(program.page_upgrade_info.monthly_rate * 100);
  }

  return null;
}

export function resolveSynchronizedMaxBidCents(program: YelpUpstreamProgramDto) {
  return typeof program.program_metrics?.max_bid === "number" ? program.program_metrics.max_bid : null;
}

export function resolveSynchronizedIsAutobid(program: YelpUpstreamProgramDto) {
  return typeof program.program_metrics?.is_autobid === "boolean" ? program.program_metrics.is_autobid : null;
}

export function parseSynchronizedProgramDate(value: string | null | undefined) {
  if (!value || value === "9999-12-31") {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildSynchronizedProgramConfiguration(
  program: YelpUpstreamProgramDto,
  existingConfiguration: unknown,
  options: {
    budgetCents: number | null;
    maxBidCents: number | null;
    isAutobid: boolean | null;
    feePeriod: string | null;
    syncedAt: Date;
  }
) {
  const current = coerceObject(existingConfiguration);

  return {
    ...current,
    syncImportedFromYelp: true,
    syncSource: "PROGRAM_LIST",
    syncImportedAt: options.syncedAt.toISOString(),
    lastUpstreamProgramStatus: program.program_status,
    lastUpstreamPauseStatus: program.program_pause_status ?? null,
    activeFeatures: program.active_features,
    availableFeatures: program.available_features,
    adCategories: program.ad_categories,
    ...(program.start_date ? { startDate: program.start_date } : {}),
    ...(options.budgetCents != null ? { monthlyBudgetDollars: dollarsFromCents(options.budgetCents) } : {}),
    ...(options.maxBidCents != null ? { maxBidDollars: dollarsFromCents(options.maxBidCents) } : {}),
    ...(typeof options.isAutobid === "boolean" ? { isAutobid: options.isAutobid } : {}),
    ...(options.feePeriod ? { feePeriod: options.feePeriod } : {}),
    ...(program.page_upgrade_info ? { pageUpgradeInfo: program.page_upgrade_info } : {})
  };
}
