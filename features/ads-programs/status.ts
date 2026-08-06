import type { ProgramStatus } from "@prisma/client";

const currentLocalProgramStatuses = new Set<ProgramStatus>([
  "ACTIVE",
  "SCHEDULED",
  "QUEUED",
  "PROCESSING",
  "PARTIAL",
]);
const currentUpstreamProgramStatuses = new Set([
  "ACTIVE",
  "SCHEDULED",
  "QUEUED",
  "PROCESSING",
  "PARTIAL",
]);

export function isCurrentLocalProgramStatus(status: ProgramStatus) {
  return currentLocalProgramStatuses.has(status);
}

export function isCurrentUpstreamProgramStatus(status: string) {
  return currentUpstreamProgramStatuses.has(status);
}

function hasTestBusinessName(name: string) {
  return /\btest/i.test(name);
}

function hasNoYelpBusinessAccess(readinessJson: unknown) {
  if (
    typeof readinessJson !== "object" ||
    readinessJson === null ||
    Array.isArray(readinessJson)
  ) {
    return false;
  }

  return (
    (readinessJson as Record<string, unknown>).yelpBusinessSyncStatus ===
    "NO_ACCESS"
  );
}

export function isBusinessEligibleForProgramInventory(business: {
  name: string;
  readinessJson: unknown;
}) {
  return (
    !hasNoYelpBusinessAccess(business.readinessJson) &&
    !hasTestBusinessName(business.name)
  );
}
