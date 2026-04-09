import "server-only";

import type { CrmLeadMappingState, InternalLeadStatus, RecordSourceSystem, SyncRunStatus } from "@prisma/client";

import { recordAuditEvent } from "@/features/audit/service";
import { retryServiceTitanLifecycleSyncRunWorkflow } from "@/features/crm-connector/lifecycle-service";
import {
  buildInternalStatusTimeline,
  buildLeadConversionMetrics,
  deriveCrmHealth,
  getCurrentPartnerLifecycleStatus,
  getMappingReferenceLabel,
  isResolvedCrmMappingState
} from "@/features/crm-enrichment/normalize";
import {
  crmLeadMappingFormSchema,
  crmLeadStatusFormSchema,
  downstreamLeadSyncRequestSchema,
  type DownstreamLeadSyncUpdate
} from "@/features/crm-enrichment/schemas";
import {
  createCrmStatusEventRecord,
  createCrmSyncError,
  createCrmSyncRun,
  getCrmSyncRunById,
  findLeadForCrmEnrichment,
  findCrmLeadMappingByExternalLeadId,
  getLeadForCrmEnrichment,
  listLeadOutcomeRows,
  updateCrmLeadMappingRecord,
  updateCrmSyncRun,
  updateLeadCrmFields,
  upsertCrmLeadMappingRecord
} from "@/lib/db/crm-enrichment-repository";
import { toJsonValue } from "@/lib/db/json";
import { getDefaultTenant } from "@/lib/db/tenant";
import { logError, logInfo } from "@/lib/utils/logging";
import { normalizeUnknownError, YelpValidationError } from "@/lib/yelp/errors";

function getCurrentMapping(lead: Awaited<ReturnType<typeof getLeadForCrmEnrichment>>) {
  return lead.crmLeadMappings[0] ?? null;
}

function buildMappingAuditShape(mapping: {
  id: string;
  state: CrmLeadMappingState;
  sourceSystem: RecordSourceSystem;
  locationId?: string | null;
  externalCrmLeadId?: string | null;
  externalOpportunityId?: string | null;
  externalJobId?: string | null;
  issueSummary?: string | null;
  matchMethod?: string | null;
  confidenceScore?: number | null;
  matchedAt?: Date | null;
  lastSyncedAt?: Date | null;
}) {
  return {
    id: mapping.id,
    state: mapping.state,
    sourceSystem: mapping.sourceSystem,
    locationId: mapping.locationId ?? null,
    externalCrmLeadId: mapping.externalCrmLeadId ?? null,
    externalOpportunityId: mapping.externalOpportunityId ?? null,
    externalJobId: mapping.externalJobId ?? null,
    issueSummary: mapping.issueSummary ?? null,
    matchMethod: mapping.matchMethod ?? null,
    confidenceScore: mapping.confidenceScore ?? null,
    matchedAt: mapping.matchedAt?.toISOString() ?? null,
    lastSyncedAt: mapping.lastSyncedAt?.toISOString() ?? null
  };
}

function coerceMappingState(
  requestedState: CrmLeadMappingState,
  sourceSystem: RecordSourceSystem,
  hasReference: boolean
) {
  if (requestedState === "MATCHED" && sourceSystem === "INTERNAL") {
    return hasReference ? "MANUAL_OVERRIDE" : "UNRESOLVED";
  }

  return requestedState;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getStringValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function getBooleanValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "boolean" ? value : null;
}

function getNumberValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseCrmSyncRequest(payloadJson: unknown) {
  const payload = asRecord(payloadJson);
  const action = getStringValue(payload, "action");

  if (!action) {
    throw new YelpValidationError("The saved CRM sync request is missing its action type.");
  }

  return {
    action,
    payload
  };
}

export function buildLeadCrmSummary(lead: {
  internalStatus: InternalLeadStatus;
  crmLeadMappings: Array<{
    id: string;
    state: CrmLeadMappingState;
    sourceSystem: RecordSourceSystem;
    locationId?: string | null;
    externalCrmLeadId?: string | null;
    externalOpportunityId?: string | null;
    externalJobId?: string | null;
    issueSummary?: string | null;
    matchMethod?: string | null;
    confidenceScore?: number | null;
    matchedAt?: Date | null;
    lastSyncedAt?: Date | null;
    updatedAt?: Date | null;
    rawSnapshotJson?: unknown;
    location?: { id: string; name: string } | null;
  }>;
  crmStatusEvents: Array<{
    id: string;
    status: InternalLeadStatus;
    substatus?: string | null;
    sourceSystem: RecordSourceSystem;
    occurredAt: Date;
    payloadJson: unknown;
    createdAt?: Date | null;
  }>;
  syncRuns: Array<{
    type: string;
    status: SyncRunStatus;
    errorSummary?: string | null;
    startedAt: Date;
    errors?: Array<{ id: string; message: string }>;
  }>;
}) {
  const mapping = lead.crmLeadMappings[0] ?? null;
  const crmSyncRuns = lead.syncRuns
    .filter((run) => run.type === "CRM_LEAD_ENRICHMENT")
    .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime());
  const health = deriveCrmHealth({
    mapping,
    recentSyncRuns: crmSyncRuns.map((run) => ({
      status: run.status,
      errorSummary: run.errorSummary ?? run.errors?.[0]?.message ?? null
    }))
  });
  const statusTimeline = buildInternalStatusTimeline(lead.crmStatusEvents);
  const issues: Array<{ code: string; message: string }> = [];

  if (!mapping || mapping.state === "UNRESOLVED") {
    issues.push({ code: "UNMAPPED", message: "No CRM entity is linked yet." });
  }

  if (mapping?.state === "CONFLICT") {
    issues.push({ code: "CONFLICT", message: mapping.issueSummary ?? "CRM mapping conflict needs review." });
  }

  if (mapping?.state === "ERROR") {
    issues.push({ code: "ERROR", message: mapping.issueSummary ?? "CRM mapping is in an error state." });
  }

  if (health.status === "STALE") {
    issues.push({ code: "STALE", message: health.message });
  }

  if (health.status === "FAILED") {
    issues.push({ code: "FAILED_SYNC", message: health.message });
  }

  return {
    currentInternalStatus: lead.internalStatus,
    mapping,
    mappingReference: mapping ? getMappingReferenceLabel(mapping) : "No CRM entity linked",
    mappingResolved: isResolvedCrmMappingState(mapping?.state),
    statusTimeline,
    health,
    issues
  };
}

export async function getLeadConversionSummary(tenantId: string) {
  const rows = await listLeadOutcomeRows(tenantId);
  return buildLeadConversionMetrics(rows);
}

export async function upsertLeadCrmMappingWorkflow(
  tenantId: string,
  actorId: string | null,
  leadId: string,
  input: unknown,
  options?: {
    sourceSystem?: RecordSourceSystem;
    correlationId?: string | null;
  }
) {
  const values = crmLeadMappingFormSchema.parse(input);
  const lead = await getLeadForCrmEnrichment(tenantId, leadId);
  const currentMapping = getCurrentMapping(lead);
  const sourceSystem = options?.sourceSystem ?? "INTERNAL";
  const hasReference = Boolean(values.externalCrmLeadId || values.externalOpportunityId || values.externalJobId);
  let state = coerceMappingState(values.state, sourceSystem, hasReference);
  let issueSummary = values.issueSummary ?? null;
  const conflictCandidate = values.externalCrmLeadId
    ? await findCrmLeadMappingByExternalLeadId(tenantId, values.externalCrmLeadId)
    : null;

  if (conflictCandidate && conflictCandidate.leadId !== leadId) {
    state = "CONFLICT";
    issueSummary =
      issueSummary ??
      `CRM lead ${values.externalCrmLeadId} is already linked to Yelp lead ${conflictCandidate.lead.externalLeadId}.`;
  }

  const syncRun = await createCrmSyncRun({
    tenantId,
    businessId: lead.businessId ?? null,
    locationId: values.locationId ?? currentMapping?.locationId ?? null,
    leadId: lead.id,
    sourceSystem,
    correlationId: options?.correlationId ?? `crm-mapping:${lead.id}:${Date.now()}`,
    requestJson: {
      action: "crm_mapping_upsert",
      state,
      sourceSystem,
      locationId: values.locationId ?? null,
      externalCrmLeadId: values.externalCrmLeadId ?? null,
      externalOpportunityId: values.externalOpportunityId ?? null,
      externalJobId: values.externalJobId ?? null,
      issueSummary,
      matchMethod: values.matchMethod ?? null,
      confidenceScore: values.confidenceScore ?? null
    }
  });

  try {
    const now = new Date();
    const mapping = await upsertCrmLeadMappingRecord(tenantId, lead.id, {
      locationId: values.locationId ?? null,
      externalCrmLeadId: values.externalCrmLeadId ?? null,
      externalOpportunityId: values.externalOpportunityId ?? null,
      externalJobId: values.externalJobId ?? null,
      state,
      matchMethod: values.matchMethod ?? null,
      confidenceScore: values.confidenceScore ?? null,
      sourceSystem,
      matchedAt: isResolvedCrmMappingState(state) ? now : null,
      issueSummary,
      lastSyncedAt: now,
      metadataJson: {
        updatedBy: actorId
      },
      rawSnapshotJson: {
        source: sourceSystem,
        request: values
      }
    });

    if (values.locationId !== undefined) {
      await updateLeadCrmFields({
        leadId: lead.id,
        locationId: values.locationId ?? null
      });
    }

    const finishedAt = new Date();
    const syncStatus = state === "CONFLICT" || state === "ERROR" ? "PARTIAL" : "COMPLETED";

    await updateCrmSyncRun(syncRun.id, {
      status: syncStatus,
      locationId: mapping.locationId ?? null,
      finishedAt,
      lastSuccessfulSyncAt: syncStatus === "COMPLETED" ? finishedAt : null,
      statsJson: {
        mappingState: mapping.state
      },
      responseJson: {
        leadId: lead.id,
        mappingId: mapping.id,
        mappingState: mapping.state
      },
      errorSummary: syncStatus === "PARTIAL" ? issueSummary ?? "CRM mapping requires operator review." : null
    });

    if (syncStatus === "PARTIAL") {
      await createCrmSyncError({
        tenantId,
        syncRunId: syncRun.id,
        sourceSystem,
        category: "CRM_MAPPING_CONFLICT",
        code: state,
        message: issueSummary ?? "CRM mapping requires operator review.",
        isRetryable: false,
        detailsJson: {
          leadId: lead.id,
          state
        }
      });
    }

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: lead.businessId ?? undefined,
      actionType: "lead.crm_mapping.upsert",
      status: syncStatus === "COMPLETED" ? "SUCCESS" : "FAILED",
      correlationId: syncRun.correlationId,
      upstreamReference: values.externalCrmLeadId ?? values.externalOpportunityId ?? values.externalJobId ?? null,
      requestSummary: toJsonValue({
        state,
        sourceSystem,
        locationId: values.locationId ?? null,
        issueSummary,
        matchMethod: values.matchMethod ?? null,
        confidenceScore: values.confidenceScore ?? null
      }),
      responseSummary: toJsonValue({
        mappingId: mapping.id,
        mappingState: mapping.state,
        reference: getMappingReferenceLabel(mapping)
      }),
      before: currentMapping ? toJsonValue(buildMappingAuditShape(currentMapping)) : undefined,
      after: toJsonValue(buildMappingAuditShape(mapping))
    });

    logInfo("crm.mapping.saved", {
      tenantId,
      leadId: lead.id,
      mappingId: mapping.id,
      mappingState: mapping.state,
      sourceSystem
    });

    return {
      mappingId: mapping.id,
      state: mapping.state
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save CRM mapping.";
    const finishedAt = new Date();

    await updateCrmSyncRun(syncRun.id, {
      status: "FAILED",
      finishedAt,
      errorSummary: message,
      responseJson: {
        leadId: lead.id
      }
    });
    await createCrmSyncError({
      tenantId,
      syncRunId: syncRun.id,
      sourceSystem,
      category: "CRM_MAPPING_WRITE",
      code: "CRM_MAPPING_WRITE_FAILED",
      message,
      detailsJson: {
        leadId: lead.id
      }
    });
    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: lead.businessId ?? undefined,
      actionType: "lead.crm_mapping.upsert",
      status: "FAILED",
      correlationId: syncRun.correlationId,
      responseSummary: toJsonValue({ message })
    });

    logError("crm.mapping.failed", {
      tenantId,
      leadId: lead.id,
      message
    });

    throw error;
  }
}

export async function appendLeadInternalStatusWorkflow(
  tenantId: string,
  actorId: string | null,
  leadId: string,
  input: unknown,
  options?: {
    sourceSystem?: RecordSourceSystem;
    externalStatusEventId?: string | null;
    correlationId?: string | null;
    allowUnresolvedMapping?: boolean;
  }
) {
  const values = crmLeadStatusFormSchema.parse(input);
  const lead = await getLeadForCrmEnrichment(tenantId, leadId);
  const currentMapping = getCurrentMapping(lead);
  const sourceSystem = options?.sourceSystem ?? "INTERNAL";

  if (!options?.allowUnresolvedMapping && !isResolvedCrmMappingState(currentMapping?.state)) {
    throw new YelpValidationError("Resolve the CRM mapping before recording a partner lifecycle status.");
  }

  const occurredAt = new Date(values.occurredAt);

  if (Number.isNaN(occurredAt.getTime())) {
    throw new YelpValidationError("Provide a valid timestamp for the partner lifecycle event.");
  }

  const syncRun = await createCrmSyncRun({
    tenantId,
    businessId: lead.businessId ?? null,
    locationId: currentMapping?.locationId ?? null,
    leadId: lead.id,
    sourceSystem,
    correlationId: options?.correlationId ?? `crm-status:${lead.id}:${Date.now()}`,
    requestJson: {
      action: "crm_status_append",
      status: values.status,
      occurredAt: values.occurredAt,
      sourceSystem,
      substatus: values.substatus ?? null,
      note: values.note ?? null,
      externalStatusEventId: options?.externalStatusEventId ?? null,
      allowUnresolvedMapping: Boolean(options?.allowUnresolvedMapping)
    }
  });

  try {
    const statusEvent = await createCrmStatusEventRecord({
      tenantId,
      leadId: lead.id,
      crmLeadMappingId: currentMapping?.id ?? null,
      locationId: currentMapping?.locationId ?? null,
      externalStatusEventId: options?.externalStatusEventId ?? null,
      status: values.status,
      substatus: values.substatus ?? null,
      sourceSystem,
      occurredAt,
      payloadJson: {
        note: values.note ?? null,
        sourceSystem
      }
    });

    const currentStatus = getCurrentPartnerLifecycleStatus(
      [
        ...lead.crmStatusEvents.filter((event) => event.id !== statusEvent.id),
        statusEvent
      ],
      lead.internalStatus
    );

    await updateLeadCrmFields({
      leadId: lead.id,
      internalStatus: currentStatus,
      locationId: currentMapping?.locationId ?? lead.locationId ?? null
    });

    if (currentMapping) {
      await updateCrmLeadMappingRecord(currentMapping.id, {
        lastSyncedAt: new Date()
      });
    }

    const finishedAt = new Date();

    await updateCrmSyncRun(syncRun.id, {
      status: "COMPLETED",
      locationId: currentMapping?.locationId ?? null,
      finishedAt,
      lastSuccessfulSyncAt: finishedAt,
      statsJson: {
        receivedStatus: values.status,
        currentLeadStatus: currentStatus,
        currentStatusChanged: currentStatus === values.status
      },
      responseJson: {
        leadId: lead.id,
        crmStatusEventId: statusEvent.id,
        status: values.status,
        currentLeadStatus: currentStatus
      },
      errorSummary: null
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: lead.businessId ?? undefined,
      actionType: "lead.crm_status.append",
      status: "SUCCESS",
      correlationId: syncRun.correlationId,
      requestSummary: toJsonValue({
        status: values.status,
        occurredAt: values.occurredAt,
        substatus: values.substatus ?? null,
        sourceSystem
      }),
      responseSummary: toJsonValue({
        crmStatusEventId: statusEvent.id
      }),
      before: toJsonValue({
        internalStatus: lead.internalStatus
      }),
      after: toJsonValue({
        internalStatus: currentStatus
      })
    });

    logInfo("crm.status.saved", {
      tenantId,
      leadId: lead.id,
      crmStatusEventId: statusEvent.id,
      status: values.status,
      currentLeadStatus: currentStatus,
      sourceSystem
    });

    return {
      crmStatusEventId: statusEvent.id,
      status: values.status,
      currentLeadStatus: currentStatus
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save CRM status.";
    const finishedAt = new Date();

    await updateCrmSyncRun(syncRun.id, {
      status: "FAILED",
      finishedAt,
      errorSummary: message,
      responseJson: {
        leadId: lead.id
      }
    });
    await createCrmSyncError({
      tenantId,
      syncRunId: syncRun.id,
      sourceSystem,
      category: "CRM_STATUS_WRITE",
      code: "CRM_STATUS_WRITE_FAILED",
      message,
      detailsJson: {
        leadId: lead.id
      }
    });
    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: lead.businessId ?? undefined,
      actionType: "lead.crm_status.append",
      status: "FAILED",
      correlationId: syncRun.correlationId,
      responseSummary: toJsonValue({ message })
    });

    logError("crm.status.failed", {
      tenantId,
      leadId: lead.id,
      message
    });

    throw error;
  }
}

function inferDownstreamMappingState(
  update: NonNullable<DownstreamLeadSyncUpdate["mapping"]>,
  sourceSystem: RecordSourceSystem
) {
  if (update.state) {
    return update.state;
  }

  const hasReference = Boolean(update.externalCrmLeadId || update.externalOpportunityId || update.externalJobId);

  if (!hasReference) {
    return "UNRESOLVED" as const;
  }

  return sourceSystem === "INTERNAL" ? "MANUAL_OVERRIDE" : "MATCHED";
}

type DownstreamSyncItemStatus = "COMPLETED" | "PARTIAL" | "FAILED";

export async function syncLeadDownstreamStatusWorkflow(input: unknown) {
  const values = downstreamLeadSyncRequestSchema.parse(input);
  const defaultTenant = await getDefaultTenant();
  const tenantId = values.tenantId ?? defaultTenant.id;
  const results: Array<{
    leadId: string | null;
    externalLeadId: string | null;
    status: DownstreamSyncItemStatus;
    mapping: Awaited<ReturnType<typeof upsertLeadCrmMappingWorkflow>> | null;
    statusEvent: Awaited<ReturnType<typeof appendLeadInternalStatusWorkflow>> | null;
    errors: Array<{ code?: string; message: string }>;
  }> = [];

  for (const update of values.updates) {
    try {
      const lead = await findLeadForCrmEnrichment(tenantId, {
        leadId: update.leadId ?? null,
        externalLeadId: update.externalLeadId ?? null
      });

      if (!lead) {
        throw new YelpValidationError("Lead not found for downstream sync.");
      }

      const sourceSystem = update.sourceSystem ?? "CRM";
      const correlationId = update.correlationId ?? `crm-sync:${lead.id}:${Date.now()}`;
      let mappingResult: Awaited<ReturnType<typeof upsertLeadCrmMappingWorkflow>> | null = null;
      let statusResult: Awaited<ReturnType<typeof appendLeadInternalStatusWorkflow>> | null = null;
      let status: DownstreamSyncItemStatus = "COMPLETED";
      const errors: Array<{ code?: string; message: string }> = [];

      if (update.mapping) {
        try {
          mappingResult = await upsertLeadCrmMappingWorkflow(
            tenantId,
            null,
            lead.id,
            {
              ...update.mapping,
              state: inferDownstreamMappingState(update.mapping, sourceSystem)
            },
            {
              sourceSystem,
              correlationId
            }
          );
        } catch (error) {
          const normalized = normalizeUnknownError(error);
          status = "PARTIAL";
          errors.push({
            code: normalized.code,
            message: normalized.message
          });
        }
      }

      if (update.statusEvent) {
        try {
          statusResult = await appendLeadInternalStatusWorkflow(
            tenantId,
            null,
            lead.id,
            update.statusEvent,
            {
              sourceSystem,
              externalStatusEventId: update.statusEvent.externalStatusEventId ?? null,
              correlationId,
              allowUnresolvedMapping: true
            }
          );
        } catch (error) {
          const normalized = normalizeUnknownError(error);
          status = mappingResult ? "PARTIAL" : "FAILED";
          errors.push({
            code: normalized.code,
            message: normalized.message
          });
        }
      }

      results.push({
        leadId: lead.id,
        externalLeadId: lead.externalLeadId,
        status,
        mapping: mappingResult,
        statusEvent: statusResult,
        errors
      });
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      results.push({
        leadId: update.leadId ?? null,
        externalLeadId: update.externalLeadId ?? null,
        status: "FAILED" as const,
        mapping: null,
        statusEvent: null,
        errors: [
          {
            code: normalized.code,
            message: normalized.message
          }
        ]
      });
    }
  }

  return {
    tenantId,
    totalUpdates: values.updates.length,
    completedCount: results.filter((result) => result.status === "COMPLETED").length,
    partialCount: results.filter((result) => result.status === "PARTIAL").length,
    failedCount: results.filter((result) => result.status === "FAILED").length,
    results
  };
}

export async function retryCrmSyncRunWorkflow(tenantId: string, actorId: string | null, syncRunId: string) {
  const syncRun = await getCrmSyncRunById(tenantId, syncRunId);

  if (!syncRun.leadId) {
    throw new YelpValidationError("This downstream sync run is not linked to a Yelp lead.");
  }

  const { action, payload } = parseCrmSyncRequest(syncRun.requestJson);
  const correlationId = `${syncRun.correlationId ?? `crm-retry:${syncRun.id}`}:retry:${Date.now()}`;

  if (action === "servicetitan_lifecycle_sync") {
    return retryServiceTitanLifecycleSyncRunWorkflow(tenantId, actorId, syncRun.id);
  }

  if (action === "crm_mapping_upsert") {
    return upsertLeadCrmMappingWorkflow(
      tenantId,
      actorId,
      syncRun.leadId,
      {
        state: getStringValue(payload, "state") ?? "UNRESOLVED",
        locationId: getStringValue(payload, "locationId"),
        externalCrmLeadId: getStringValue(payload, "externalCrmLeadId"),
        externalOpportunityId: getStringValue(payload, "externalOpportunityId"),
        externalJobId: getStringValue(payload, "externalJobId"),
        issueSummary: getStringValue(payload, "issueSummary"),
        matchMethod: getStringValue(payload, "matchMethod"),
        confidenceScore: getNumberValue(payload, "confidenceScore")
      },
      {
        sourceSystem: syncRun.sourceSystem,
        correlationId
      }
    );
  }

  if (action === "crm_status_append") {
    const status = getStringValue(payload, "status");
    const occurredAt = getStringValue(payload, "occurredAt");

    if (!status || !occurredAt) {
      throw new YelpValidationError("The saved partner lifecycle sync request is incomplete.");
    }

    return appendLeadInternalStatusWorkflow(
      tenantId,
      actorId,
      syncRun.leadId,
      {
        status,
        occurredAt,
        substatus: getStringValue(payload, "substatus"),
        note: getStringValue(payload, "note")
      },
      {
        sourceSystem: syncRun.sourceSystem,
        externalStatusEventId: getStringValue(payload, "externalStatusEventId"),
        correlationId,
        allowUnresolvedMapping: getBooleanValue(payload, "allowUnresolvedMapping") ?? false
      }
    );
  }

  throw new YelpValidationError("Retry is not available for this downstream sync action.");
}
