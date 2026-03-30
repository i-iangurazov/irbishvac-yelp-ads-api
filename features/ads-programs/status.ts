import type { ProgramStatus } from "@prisma/client";

const currentLocalProgramStatuses = new Set<ProgramStatus>(["ACTIVE", "SCHEDULED", "QUEUED", "PROCESSING", "PARTIAL"]);
const currentUpstreamProgramStatuses = new Set(["ACTIVE", "SCHEDULED", "QUEUED", "PROCESSING", "PARTIAL"]);

export function isCurrentLocalProgramStatus(status: ProgramStatus) {
  return currentLocalProgramStatuses.has(status);
}

export function isCurrentUpstreamProgramStatus(status: string) {
  return currentUpstreamProgramStatuses.has(status);
}
