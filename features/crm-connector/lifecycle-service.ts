import "server-only";

import { randomUUID } from "node:crypto";

import type { InternalLeadStatus } from "@prisma/client";

import { recordAuditEvent } from "@/features/audit/service";
import {
  buildServiceTitanAppointmentSignal,
  buildServiceTitanJobSignal,
  buildServiceTitanLeadSignal,
  dedupeServiceTitanLifecycleSignals,
  getServiceTitanLifecycleSyncLabel
} from "@/features/crm-connector/lifecycle-normalize";
import { serviceTitanLifecycleSyncSchema } from "@/features/crm-connector/schemas";
import { getCurrentPartnerLifecycleStatus } from "@/features/crm-enrichment/normalize";
import { listTenantIdsWithEnabledCredential } from "@/lib/db/credentials-repository";
import {
  countServiceTitanLifecycleCoverage,
  findLocationByConnectorReference,
  listRecentConnectorSyncRuns,
  listServiceTitanLifecycleCandidates
} from "@/lib/db/crm-connector-repository";
import {
  createCrmStatusEventRecord,
  createCrmSyncRun,
  createCrmSyncError,
  getCrmSyncRunById,
  getLeadForCrmEnrichment,
  updateCrmLeadMappingRecord,
  updateCrmSyncRun,
  updateLeadCrmFields
} from "@/lib/db/crm-enrichment-repository";
import { toJsonValue } from "@/lib/db/json";
import { logError, logInfo } from "@/lib/utils/logging";
import { normalizeUnknownError, YelpValidationError } from "@/lib/yelp/errors";
import { ServiceTitanClient } from "@/lib/servicetitan/client";
import { getServiceTitanCredentialConfig } from "@/lib/servicetitan/runtime";

const serviceTitanLifecycleDueMs = 1000 * 60 * 60 * 4;
const serviceTitanLifecycleStaleMs = 1000 * 60 * 60 * 24 * 2;

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getRequestAction(value: unknown) {
  const record = asRecord(value);
  return typeof record?.action === "string" ? record.action : null;
}

function isServiceTitanLifecycleSyncRun(run: { type: string; requestJson?: unknown | null }) {
  return run.type === "CRM_LEAD_ENRICHMENT" && getRequestAction(run.requestJson) === "servicetitan_lifecycle_sync";
}

function isRetryableServiceTitanErrorCode(code: string | null | undefined) {
  return code !== "UPSTREAM_NOT_FOUND";
}

function parseConnectorOverrideLocationId(
  input:
    | {
        businessUnitId?: string | null;
      }
    | null
    | undefined
) {
  return typeof input?.businessUnitId === "string" && input.businessUnitId.trim().length > 0
    ? input.businessUnitId.trim()
    : null;
}

function readSyncMode(value: unknown) {
  const record = asRecord(value);
  return record?.mode === "RECENT" ? "RECENT" : "DUE";
}

function buildLifecycleStats(params: {
  fetchedLead: boolean;
  fetchedJob: boolean;
  appointmentCount: number;
  appendedCount: number;
  currentLeadStatus: InternalLeadStatus;
  discoveredJobId: string | null;
  resolvedLocationId: string | null;
}) {
  return {
    fetchedLead: params.fetchedLead,
    fetchedJob: params.fetchedJob,
    appointmentCount: params.appointmentCount,
    appendedCount: params.appendedCount,
    currentLeadStatus: params.currentLeadStatus,
    discoveredJobId: params.discoveredJobId,
    resolvedLocationId: params.resolvedLocationId
  };
}

function formatLifecycleErrorSummary(errors: Array<{ message: string }>) {
  return errors[0]?.message ?? "ServiceTitan lifecycle sync did not complete cleanly.";
}

async function syncServiceTitanLifecycleForLead(params: {
  tenantId: string;
  actorId: string | null;
  client: ServiceTitanClient;
  leadId: string;
  mode: "DUE" | "RECENT";
  correlationId: string;
}) {
  const lead = await getLeadForCrmEnrichment(params.tenantId, params.leadId);
  const mapping = lead.crmLeadMappings[0] ?? null;

  if (!mapping) {
    throw new YelpValidationError("This Yelp lead has no partner mapping to reconcile.");
  }

  if (!mapping.externalCrmLeadId && !mapping.externalJobId) {
    throw new YelpValidationError("This mapping has no ServiceTitan lead ID or job ID to poll.");
  }

  const syncRun = await createCrmSyncRun({
    tenantId: params.tenantId,
    businessId: lead.businessId ?? null,
    locationId: mapping.locationId ?? lead.locationId ?? null,
    leadId: lead.id,
    sourceSystem: "CRM",
    capabilityKey: "hasCrmIntegration",
    correlationId: params.correlationId,
    requestJson: {
      action: "servicetitan_lifecycle_sync",
      mode: params.mode,
      mappingId: mapping.id,
      externalCrmLeadId: mapping.externalCrmLeadId ?? null,
      externalOpportunityId: mapping.externalOpportunityId ?? null,
      externalJobId: mapping.externalJobId ?? null
    }
  });

  const errors: Array<{ category: string; code?: string | null; message: string; details?: unknown }> = [];

  try {
    let upstreamLead: Awaited<ReturnType<ServiceTitanClient["getLeadById"]>> | null = null;
    let upstreamJob: Awaited<ReturnType<ServiceTitanClient["getJobById"]>> | null = null;
    let appointments: Awaited<ReturnType<ServiceTitanClient["listAppointmentsForJob"]>>["rows"] = [];

    if (mapping.externalCrmLeadId) {
      try {
        upstreamLead = await params.client.getLeadById(mapping.externalCrmLeadId);
      } catch (error) {
        const normalized = normalizeUnknownError(error);
        errors.push({
          category: "servicetitan.lifecycle.lead_read",
          code: normalized.code,
          message: normalized.message,
          details: normalized.details
        });
      }
    }

    const discoveredJobId = upstreamLead?.jobId ?? null;
    const jobId = mapping.externalJobId ?? discoveredJobId;

    if (jobId) {
      try {
        upstreamJob = await params.client.getJobById(jobId);
      } catch (error) {
        const normalized = normalizeUnknownError(error);
        errors.push({
          category: "servicetitan.lifecycle.job_read",
          code: normalized.code,
          message: normalized.message,
          details: normalized.details
        });
      }
    }

    if (jobId && upstreamJob) {
      try {
        const appointmentResult = await params.client.listAppointmentsForJob(jobId);
        appointments = appointmentResult.rows;
      } catch (error) {
        const normalized = normalizeUnknownError(error);
        errors.push({
          category: "servicetitan.lifecycle.appointment_read",
          code: normalized.code,
          message: normalized.message,
          details: normalized.details
        });
      }
    }

    const upstreamBusinessUnitId =
      parseConnectorOverrideLocationId(upstreamJob ? { businessUnitId: upstreamJob.businessUnitId ?? null } : null) ??
      parseConnectorOverrideLocationId(upstreamLead ? { businessUnitId: upstreamLead.businessUnitId ?? null } : null);
    const mappedLocation =
      mapping.location
        ? {
            id: mapping.location.id,
            name: mapping.location.name
          }
        : lead.location
          ? {
              id: lead.location.id,
              name: lead.location.name
            }
        : upstreamBusinessUnitId
          ? await findLocationByConnectorReference(params.tenantId, upstreamBusinessUnitId)
          : null;

    const signals = dedupeServiceTitanLifecycleSignals([
      upstreamLead
        ? buildServiceTitanLeadSignal({
            leadId: upstreamLead.id,
            upstreamStatus: upstreamLead.status ?? null,
            createdOn: upstreamLead.createdOn ?? null,
            modifiedOn: upstreamLead.modifiedOn ?? null,
            summary: upstreamLead.summary ?? null
          })
        : null,
      jobId && upstreamJob
        ? buildServiceTitanJobSignal({
            jobId,
            upstreamStatus: upstreamJob.status ?? null,
            createdOn: upstreamJob.createdOn ?? null,
            modifiedOn: upstreamJob.modifiedOn ?? null,
            completedOn: upstreamJob.completedOn ?? null,
            canceledOn: upstreamJob.canceledOn ?? null
          })
        : null,
      appointments.length > 0 ? buildServiceTitanAppointmentSignal(appointments) : null
    ]);

    const createdEvents: Awaited<ReturnType<typeof createCrmStatusEventRecord>>[] = [];

    for (const signal of signals) {
      const event = await createCrmStatusEventRecord({
        tenantId: params.tenantId,
        leadId: lead.id,
        crmLeadMappingId: mapping.id,
        locationId: mappedLocation?.id ?? mapping.locationId ?? lead.locationId ?? null,
        externalStatusEventId: signal.externalStatusEventId,
        status: signal.status,
        substatus: signal.substatus,
        sourceSystem: "CRM",
        occurredAt: signal.occurredAt,
        payloadJson: signal.payloadJson
      });
      createdEvents.push(event);
    }

    await updateCrmLeadMappingRecord(mapping.id, {
      ...(mappedLocation?.id && !mapping.locationId ? { locationId: mappedLocation.id } : {}),
      ...(discoveredJobId && !mapping.externalJobId ? { externalJobId: discoveredJobId } : {}),
      lastSyncedAt: new Date(),
      metadataJson: toJsonValue({
        ...(asRecord(mapping.metadataJson) ?? {}),
        connector: "ServiceTitan",
        lastLifecycleSyncAt: new Date().toISOString(),
        lastLifecycleSyncMode: params.mode
      }),
      rawSnapshotJson: toJsonValue({
        connector: "ServiceTitan",
        lead: upstreamLead,
        job: upstreamJob,
        appointments
      })
    });

    const existingTimeline = lead.crmStatusEvents.filter(
      (event) => !createdEvents.some((createdEvent) => createdEvent.id === event.id)
    );
    const currentLeadStatus = getCurrentPartnerLifecycleStatus(
      [...existingTimeline, ...createdEvents],
      lead.internalStatus
    );

    await updateLeadCrmFields({
      leadId: lead.id,
      internalStatus: currentLeadStatus,
      ...(mappedLocation?.id ? { locationId: mappedLocation.id } : {})
    });

    const fetchedLead = Boolean(upstreamLead);
    const fetchedJob = Boolean(upstreamJob);
    const appendedCount = createdEvents.length;
    const fetchedAny = fetchedLead || fetchedJob || appointments.length > 0;
    const hadErrors = errors.length > 0;
    const status =
      hadErrors && !fetchedAny
        ? "FAILED"
        : hadErrors
          ? "PARTIAL"
          : "COMPLETED";
    const finishedAt = new Date();

    await updateCrmSyncRun(syncRun.id, {
      status,
      locationId: mappedLocation?.id ?? mapping.locationId ?? lead.locationId ?? null,
      finishedAt,
      lastSuccessfulSyncAt: status === "FAILED" ? null : finishedAt,
      statsJson: buildLifecycleStats({
        fetchedLead,
        fetchedJob,
        appointmentCount: appointments.length,
        appendedCount,
        currentLeadStatus,
        discoveredJobId,
        resolvedLocationId: mappedLocation?.id ?? mapping.locationId ?? lead.locationId ?? null
      }),
      responseJson: {
        connector: "ServiceTitan",
        leadId: lead.id,
        externalLeadId: lead.externalLeadId,
        externalCrmLeadId: mapping.externalCrmLeadId,
        externalJobId: mapping.externalJobId ?? discoveredJobId,
        appendedEventCount: appendedCount
      },
      errorSummary: hadErrors ? formatLifecycleErrorSummary(errors) : null
    });

    for (const error of errors) {
      await createCrmSyncError({
        tenantId: params.tenantId,
        syncRunId: syncRun.id,
        sourceSystem: "CRM",
        category: error.category,
        code: error.code ?? null,
        message: error.message,
        isRetryable: isRetryableServiceTitanErrorCode(error.code ?? null),
        detailsJson: error.details
      });
    }

    await recordAuditEvent({
      tenantId: params.tenantId,
      actorId: params.actorId,
      businessId: lead.businessId ?? undefined,
      actionType: "integrations.servicetitan.lifecycle.sync",
      status: status === "COMPLETED" ? "SUCCESS" : "FAILED",
      correlationId: syncRun.correlationId,
      upstreamReference: mapping.externalJobId ?? mapping.externalCrmLeadId ?? null,
      requestSummary: toJsonValue({
        leadId: lead.id,
        externalLeadId: lead.externalLeadId,
        mode: params.mode
      }),
      responseSummary: toJsonValue({
        status,
        errorCount: errors.length,
        appendedEventCount: appendedCount,
        currentLeadStatus
      })
    });

    logInfo("servicetitan.lifecycle.sync.completed", {
      tenantId: params.tenantId,
      syncRunId: syncRun.id,
      leadId: lead.id,
      status,
      appendedEventCount: appendedCount,
      errorCount: errors.length
    });

    return {
      leadId: lead.id,
      externalLeadId: lead.externalLeadId,
      syncRunId: syncRun.id,
      status,
      currentLeadStatus,
      appendedEventCount: appendedCount,
      errorCount: errors.length
    };
  } catch (error) {
    const normalized = normalizeUnknownError(error);
    const finishedAt = new Date();

    await updateCrmSyncRun(syncRun.id, {
      status: "FAILED",
      finishedAt,
      errorSummary: normalized.message,
      responseJson: {
        message: normalized.message,
        code: normalized.code
      }
    });
    await createCrmSyncError({
      tenantId: params.tenantId,
      syncRunId: syncRun.id,
      sourceSystem: "CRM",
      category: "servicetitan.lifecycle.sync",
      code: normalized.code,
      message: normalized.message,
      isRetryable: isRetryableServiceTitanErrorCode(normalized.code ?? null),
      detailsJson: normalized.details
    });
    await recordAuditEvent({
      tenantId: params.tenantId,
      actorId: params.actorId,
      businessId: lead.businessId ?? undefined,
      actionType: "integrations.servicetitan.lifecycle.sync",
      status: "FAILED",
      correlationId: syncRun.correlationId,
      upstreamReference: mapping.externalJobId ?? mapping.externalCrmLeadId ?? null,
      responseSummary: toJsonValue({
        message: normalized.message,
        code: normalized.code
      })
    });

    logError("servicetitan.lifecycle.sync.failed", {
      tenantId: params.tenantId,
      syncRunId: syncRun.id,
      leadId: params.leadId,
      message: normalized.message
    });

    return {
      leadId: params.leadId,
      externalLeadId: lead.externalLeadId,
      syncRunId: syncRun.id,
      status: "FAILED" as const,
      currentLeadStatus: lead.internalStatus,
      appendedEventCount: 0,
      errorCount: 1
    };
  }
}

export async function getServiceTitanLifecycleSyncOverview(tenantId: string) {
  const dueBefore = new Date(Date.now() - serviceTitanLifecycleDueMs);
  const staleBefore = new Date(Date.now() - serviceTitanLifecycleStaleMs);
  const [coverage, recentSyncRuns] = await Promise.all([
    countServiceTitanLifecycleCoverage(tenantId, {
      dueBefore,
      staleBefore
    }),
    listRecentConnectorSyncRuns(tenantId, 20)
  ]);
  const lifecycleRuns = recentSyncRuns.filter((run) => isServiceTitanLifecycleSyncRun(run));
  const latestSuccessfulRun =
    lifecycleRuns.find((run) => run.status === "COMPLETED" || run.status === "PARTIAL") ?? null;
  const latestProblemRun =
    lifecycleRuns.find((run) => run.status === "FAILED" || run.status === "PARTIAL") ?? null;

  return {
    coverage,
    dueBefore,
    staleBefore,
    latestSuccessfulRun,
    latestProblemRun,
    recentRuns: lifecycleRuns.map((run) => ({
      ...run,
      typeLabel: getServiceTitanLifecycleSyncLabel(getRequestAction(run.requestJson)),
      mode: readSyncMode(run.requestJson)
    }))
  };
}

export async function syncServiceTitanLifecycleWorkflow(
  tenantId: string,
  actorId: string | null,
  input: unknown
) {
  const values = serviceTitanLifecycleSyncSchema.parse(input);
  const config = await getServiceTitanCredentialConfig(tenantId);

  if (!config?.isEnabled) {
    throw new YelpValidationError("Enable the ServiceTitan connector before running lifecycle sync.");
  }

  const client = new ServiceTitanClient(config);
  const dueBefore = new Date(Date.now() - serviceTitanLifecycleDueMs);
  const updatedAfter = new Date(Date.now() - values.lookbackDays * 24 * 60 * 60 * 1000);
  const candidates = await listServiceTitanLifecycleCandidates(tenantId, {
    dueBefore: values.mode === "DUE" ? dueBefore : undefined,
    updatedAfter: values.mode === "RECENT" ? updatedAfter : undefined,
    take: values.limit
  });
  const correlationId = randomUUID();
  const results = [];

  for (const candidate of candidates) {
    results.push(
      await syncServiceTitanLifecycleForLead({
        tenantId,
        actorId,
        client,
        leadId: candidate.lead.id,
        mode: values.mode,
        correlationId: `${correlationId}:${candidate.lead.id}`
      })
    );
  }

  return {
    mode: values.mode,
    lookbackDays: values.mode === "RECENT" ? values.lookbackDays : null,
    selectedCount: candidates.length,
    completedCount: results.filter((result) => result.status === "COMPLETED").length,
    partialCount: results.filter((result) => result.status === "PARTIAL").length,
    failedCount: results.filter((result) => result.status === "FAILED").length,
    results
  };
}

export async function retryServiceTitanLifecycleSyncRunWorkflow(
  tenantId: string,
  actorId: string | null,
  syncRunId: string
) {
  const syncRun = await getCrmSyncRunById(tenantId, syncRunId);

  if (!syncRun.leadId) {
    throw new YelpValidationError("This lifecycle sync run is not linked to a Yelp lead.");
  }

  if (getRequestAction(syncRun.requestJson) !== "servicetitan_lifecycle_sync") {
    throw new YelpValidationError("Retry is only available for ServiceTitan lifecycle sync runs.");
  }

  const config = await getServiceTitanCredentialConfig(tenantId);

  if (!config?.isEnabled) {
    throw new YelpValidationError("Enable the ServiceTitan connector before retrying lifecycle sync.");
  }

  return syncServiceTitanLifecycleForLead({
    tenantId,
    actorId,
    client: new ServiceTitanClient(config),
    leadId: syncRun.leadId,
    mode: readSyncMode(syncRun.requestJson),
    correlationId: `${syncRun.correlationId ?? syncRun.id}:retry:${Date.now()}`
  });
}

export async function reconcileDueServiceTitanLifecycleSyncs(limit = 10) {
  const tenantIds = await listTenantIdsWithEnabledCredential("CRM_SERVICETITAN");
  const results = [];

  for (const tenantId of tenantIds) {
    const tenantResult = await syncServiceTitanLifecycleWorkflow(tenantId, null, {
      mode: "DUE",
      limit
    });

    results.push({
      tenantId,
      ...tenantResult
    });
  }

  return {
    tenantCount: tenantIds.length,
    processedCount: results.reduce((total, result) => total + result.selectedCount, 0),
    failedCount: results.reduce((total, result) => total + result.failedCount, 0),
    partialCount: results.reduce((total, result) => total + result.partialCount, 0),
    completedCount: results.reduce((total, result) => total + result.completedCount, 0),
    results
  };
}
