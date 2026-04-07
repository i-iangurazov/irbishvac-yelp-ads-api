import type { CrmLeadMappingState, InternalLeadStatus, RecordSourceSystem, SyncRunStatus } from "@prisma/client";

const resolvedMappingStates = new Set<CrmLeadMappingState>(["MATCHED", "MANUAL_OVERRIDE"]);
const positiveCloseStatuses = new Set<InternalLeadStatus>(["COMPLETED", "CLOSED_WON"]);
const staleWindowMs = 1000 * 60 * 60 * 24 * 7;

export type CrmHealthStatus = "CURRENT" | "STALE" | "FAILED" | "UNRESOLVED" | "CONFLICT" | "ERROR";

export function isResolvedCrmMappingState(state: CrmLeadMappingState | null | undefined) {
  return state ? resolvedMappingStates.has(state) : false;
}

export function getMappingReferenceLabel(mapping: {
  externalCrmLeadId?: string | null;
  externalOpportunityId?: string | null;
  externalJobId?: string | null;
}) {
  return mapping.externalJobId ?? mapping.externalOpportunityId ?? mapping.externalCrmLeadId ?? "No CRM entity linked";
}

export function deriveCrmHealth(params: {
  mapping?: {
    state: CrmLeadMappingState;
    sourceSystem: RecordSourceSystem;
    matchedAt?: Date | null;
    lastSyncedAt?: Date | null;
    updatedAt?: Date | null;
    issueSummary?: string | null;
  } | null;
  recentSyncRuns?: Array<{
    status: SyncRunStatus;
    errorSummary?: string | null;
  }>;
  now?: Date;
}) {
  const mapping = params.mapping ?? null;
  const recentSyncRuns = params.recentSyncRuns ?? [];
  const latestSync = recentSyncRuns[0] ?? null;
  const hasFailedSync = recentSyncRuns.some((run) => run.status === "FAILED" || run.status === "PARTIAL");
  const now = params.now ?? new Date();

  if (!mapping || mapping.state === "UNRESOLVED") {
    return {
      status: (hasFailedSync ? "FAILED" : "UNRESOLVED") as CrmHealthStatus,
      message: hasFailedSync
        ? latestSync?.errorSummary ?? "CRM enrichment failed before a mapping was confirmed."
        : "No CRM entity is linked to this Yelp lead yet.",
      isStale: false,
      hasFailedSync
    };
  }

  if (mapping.state === "CONFLICT") {
    return {
      status: "CONFLICT" as CrmHealthStatus,
      message: mapping.issueSummary ?? "This lead conflicts with another CRM mapping and needs operator review.",
      isStale: false,
      hasFailedSync
    };
  }

  if (mapping.state === "ERROR") {
    return {
      status: "ERROR" as CrmHealthStatus,
      message: mapping.issueSummary ?? latestSync?.errorSummary ?? "CRM enrichment failed for this lead.",
      isStale: false,
      hasFailedSync
    };
  }

  if (hasFailedSync) {
    return {
      status: "FAILED" as CrmHealthStatus,
      message: latestSync?.errorSummary ?? "The last CRM enrichment attempt failed.",
      isStale: false,
      hasFailedSync
    };
  }

  const freshnessAnchor = mapping.lastSyncedAt ?? mapping.matchedAt ?? mapping.updatedAt ?? null;
  const isStale =
    mapping.sourceSystem === "CRM" && freshnessAnchor ? now.getTime() - freshnessAnchor.getTime() > staleWindowMs : false;

  if (isStale) {
    return {
      status: "STALE" as CrmHealthStatus,
      message: "CRM sync has not refreshed this mapping in more than 7 days.",
      isStale: true,
      hasFailedSync
    };
  }

  return {
    status: "CURRENT" as CrmHealthStatus,
    message:
      mapping.state === "MANUAL_OVERRIDE"
        ? "This lead is linked through an internal manual override."
        : "CRM mapping and lifecycle data are current.",
    isStale: false,
    hasFailedSync
  };
}

export function buildInternalStatusTimeline(
  events: Array<{
    id: string;
    status: InternalLeadStatus;
    substatus?: string | null;
    sourceSystem: RecordSourceSystem;
    occurredAt: Date;
    payloadJson: unknown;
    createdAt?: Date | null;
  }>
) {
  return [...events]
    .sort((left, right) => {
      const leftTime = (left.occurredAt ?? left.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTime = (right.occurredAt ?? right.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;

      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      return left.id.localeCompare(right.id);
    })
    .map((event) => ({
      id: event.id,
      status: event.status,
      substatus: event.substatus ?? null,
      sourceSystem: event.sourceSystem,
      occurredAt: event.occurredAt,
      payloadJson: event.payloadJson
    }));
}

export function buildLeadConversionMetrics(
  leads: Array<{
    internalStatus: InternalLeadStatus;
    crmLeadMappings?: Array<{ state: CrmLeadMappingState }> | null;
  }>
) {
  const totalLeads = leads.length;
  const mappedLeads = leads.filter((lead) => isResolvedCrmMappingState(lead.crmLeadMappings?.[0]?.state)).length;
  const bookedLeads = leads.filter((lead) => lead.internalStatus === "BOOKED").length;
  const scheduledJobs = leads.filter((lead) => lead.internalStatus === "SCHEDULED").length;
  const completedJobs = leads.filter((lead) => positiveCloseStatuses.has(lead.internalStatus)).length;

  return {
    totalLeads,
    mappedLeads,
    bookedLeads,
    scheduledJobs,
    completedJobs,
    closeRate: totalLeads > 0 ? Number(((completedJobs / totalLeads) * 100).toFixed(1)) : 0
  };
}
