import { randomUUID } from "node:crypto";

import "server-only";

import type { OperatorIssueSeverity, OperatorIssueStatus, OperatorIssueType, RecordSourceSystem } from "@prisma/client";

import {
  humanizeLeadAutomationCadence
} from "@/features/autoresponder/logic";
import {
  getRetryLabel,
  getIssueRemapHref,
  getIssueStatusActionability,
  getStaleLeadSeverity,
  getUnmappedLeadSeverity,
  isRetryableIssueType,
  operatorIssueTypeLabels
} from "@/features/issues/normalize";
import {
  operatorIssueBulkActionSchema,
  operatorIssueFiltersSchema,
  operatorIssueNoteSchema,
  operatorIssueResolutionSchema,
  type OperatorIssueFiltersInput
} from "@/features/issues/schemas";
import { recordAuditEvent } from "@/features/audit/service";
import { retryCrmSyncRunWorkflow } from "@/features/crm-enrichment/service";
import { resendReportScheduleRunWorkflow } from "@/features/report-delivery/service";
import { retryLeadAutomationAttemptWorkflow } from "@/features/autoresponder/service";
import { retryLeadSyncRunWorkflow } from "@/features/leads/service";
import {
  countOperatorIssues,
  createOperatorIssue,
  getOperatorIssueSummaryCounts,
  getOperatorIssueById,
  listAutoresponderFailureCandidates,
  listCrmSyncFailureCandidates,
  listExistingOperatorIssues,
  listIssueAuditContext,
  listLeadSyncFailureCandidates,
  listMappingConflictCandidates,
  listOperatorIssueFilterOptions,
  listOperatorIssues,
  listOperatorIssuesByIds,
  listReportDeliveryFailureCandidates,
  listStaleLifecycleSyncCandidates,
  listStaleLeadCandidates,
  listUnmappedLeadCandidates,
  updateOperatorIssue
} from "@/lib/db/issues-repository";
import { toJsonValue } from "@/lib/db/json";
import { getSystemSetting, upsertSystemSetting } from "@/lib/db/settings-repository";
import { recordOperatorIssueRefreshMetrics } from "@/features/operations/observability-service";
import { normalizeUnknownError, YelpValidationError } from "@/lib/yelp/errors";

const operatorIssueRefreshSettingKey = "operatorIssueRefreshState";
const operatorIssueRefreshIntervalMs = 2 * 60 * 1000;
const operatorIssueRefreshLeaseMs = 60 * 1000;
const repeatedWorkerFailureDeadLetterThreshold = 3;
const deadLetterIssueTypes = new Set<OperatorIssueType>([
  "LEAD_SYNC_FAILURE",
  "CRM_SYNC_FAILURE",
  "AUTORESPONDER_FAILURE",
  "REPORT_DELIVERY_FAILURE"
]);
export const DEFAULT_OPERATOR_ISSUES_PAGE_SIZE = 50;

type DetectedIssue = {
  dedupeKey: string;
  issueType: OperatorIssueType;
  severity: OperatorIssueSeverity;
  sourceSystem: RecordSourceSystem;
  title: string;
  summary: string;
  businessId?: string | null;
  locationId?: string | null;
  leadId?: string | null;
  reportRequestId?: string | null;
  reportScheduleRunId?: string | null;
  syncRunId?: string | null;
  detailsJson: unknown;
};

function canRetryIssue(issue: {
  issueType: OperatorIssueType;
  leadId?: string | null;
  syncRunId?: string | null;
  reportScheduleRunId?: string | null;
  status: OperatorIssueStatus;
}) {
  if (!getIssueStatusActionability(issue.status) || !isRetryableIssueType(issue.issueType)) {
    return false;
  }

  switch (issue.issueType) {
    case "LEAD_SYNC_FAILURE":
    case "CRM_SYNC_FAILURE":
      return Boolean(issue.syncRunId);
    case "AUTORESPONDER_FAILURE":
      return Boolean(issue.leadId);
    case "REPORT_DELIVERY_FAILURE":
      return Boolean(issue.reportScheduleRunId);
    default:
      return false;
  }
}

function latestByKey<T>(rows: T[], getKey: (row: T) => string, getTime: (row: T) => number) {
  const deduped = new Map<string, T>();

  for (const row of rows) {
    const key = getKey(row);
    const existing = deduped.get(key);

    if (!existing || getTime(row) > getTime(existing)) {
      deduped.set(key, row);
    }
  }

  return [...deduped.values()];
}

function getSyncRunAction(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return typeof (value as { action?: unknown }).action === "string" ? (value as { action: string }).action : null;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toDetailsRecord(value: unknown) {
  return asRecord(value) ?? { details: value };
}

function applyDeadLetterEscalation(candidate: DetectedIssue, detectedCount: number): DetectedIssue {
  if (!deadLetterIssueTypes.has(candidate.issueType) || detectedCount < repeatedWorkerFailureDeadLetterThreshold) {
    return candidate;
  }

  return {
    ...candidate,
    severity: "CRITICAL",
    title: candidate.title.startsWith("Repeated worker failure") ? candidate.title : `Repeated worker failure: ${candidate.title}`,
    summary: `${candidate.summary} Detected ${detectedCount} times; treat as dead-letter until an operator retries or resolves it.`,
    detailsJson: {
      ...toDetailsRecord(candidate.detailsJson),
      deadLetter: true,
      deadLetterReason: "REPEATED_WORKER_FAILURE",
      detectedCount,
      threshold: repeatedWorkerFailureDeadLetterThreshold
    }
  };
}

function summarizeErrors(rows: Array<{ message: string; code?: string | null }>) {
  return rows.map((row) => (row.code ? `${row.code}: ${row.message}` : row.message));
}

function buildLeadSyncDetectedIssues(
  rows: Awaited<ReturnType<typeof listLeadSyncFailureCandidates>>
): DetectedIssue[] {
  return rows.map((run) => {
    const errorMessages = summarizeErrors(run.errors);
    const summary = run.errorSummary ?? errorMessages[0] ?? "Lead sync failed and needs review.";

    return {
      dedupeKey: `lead-sync:${run.id}`,
      issueType: "LEAD_SYNC_FAILURE",
      severity: run.status === "FAILED" ? "HIGH" : "MEDIUM",
      sourceSystem: run.sourceSystem,
      title: "Lead intake sync failed",
      summary,
      businessId: run.businessId ?? run.lead?.businessId ?? null,
      locationId: run.locationId ?? run.lead?.locationId ?? run.business?.locationId ?? null,
      leadId: run.leadId ?? null,
      syncRunId: run.id,
      detailsJson: {
        type: run.type,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        errorSummary: run.errorSummary,
        errors: errorMessages
      }
    };
  });
}

function buildUnmappedLeadDetectedIssues(
  rows: Awaited<ReturnType<typeof listUnmappedLeadCandidates>>,
  now: Date
): DetectedIssue[] {
  return rows.map((lead) => ({
    dedupeKey: `unmapped-lead:${lead.id}`,
    issueType: "UNMAPPED_LEAD",
    severity: getUnmappedLeadSeverity(lead.createdAtYelp, now),
    sourceSystem: "DERIVED",
    title: "Lead is still unmapped",
    summary: `${lead.customerName ?? lead.externalLeadId} has not been linked to a CRM entity yet.`,
    businessId: lead.businessId ?? null,
    locationId: lead.locationId ?? lead.business?.locationId ?? null,
    leadId: lead.id,
    detailsJson: {
      externalLeadId: lead.externalLeadId,
      externalBusinessId: lead.externalBusinessId,
      customerName: lead.customerName,
      createdAtYelp: lead.createdAtYelp,
      serviceCategory: lead.serviceCategory?.name ?? null
    }
  }));
}

function buildCrmSyncDetectedIssues(
  rows: Awaited<ReturnType<typeof listCrmSyncFailureCandidates>>
): DetectedIssue[] {
  const deduped = latestByKey(
    rows,
    (run) => (run.leadId ? `crm-sync:lead:${run.leadId}` : `crm-sync:run:${run.id}`),
    (run) => run.startedAt.getTime()
  );

  return deduped.map((run) => {
    const errorMessages = summarizeErrors(run.errors);
    const summary = run.errorSummary ?? errorMessages[0] ?? "CRM enrichment failed and needs review.";
    const action = getSyncRunAction(run.requestJson);
    const title =
      action === "servicetitan_lifecycle_sync"
        ? "ServiceTitan lifecycle sync failed"
        : run.type === "LOCATION_MAPPING"
        ? "Connector location sync failed"
        : run.type === "SERVICE_MAPPING"
          ? "Connector service sync failed"
          : "CRM enrichment failed";
    const defaultSummary =
      action === "servicetitan_lifecycle_sync"
        ? "ServiceTitan lifecycle sync failed and needs review."
        : run.type === "LOCATION_MAPPING"
        ? "ServiceTitan location reference sync failed and needs review."
        : run.type === "SERVICE_MAPPING"
          ? "ServiceTitan service reference sync failed and needs review."
          : "CRM enrichment failed and needs review.";

    return {
      dedupeKey: run.leadId ? `crm-sync:lead:${run.leadId}` : `crm-sync:run:${run.id}`,
      issueType: "CRM_SYNC_FAILURE",
      severity: "HIGH",
      sourceSystem: run.sourceSystem,
      title,
      summary: summary || defaultSummary,
      businessId: run.businessId ?? run.lead?.businessId ?? null,
      locationId: run.locationId ?? run.lead?.locationId ?? run.business?.locationId ?? null,
      leadId: run.leadId ?? null,
      syncRunId: run.id,
      detailsJson: {
        type: run.type,
        action,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        errorSummary: run.errorSummary,
        errors: errorMessages
      }
    };
  });
}

function buildStaleLifecycleDetectedIssues(
  rows: Awaited<ReturnType<typeof listStaleLifecycleSyncCandidates>>,
  now: Date
): DetectedIssue[] {
  return rows.map((mapping) => {
    const referenceAt = mapping.lastSyncedAt ?? mapping.matchedAt ?? mapping.updatedAt;

    return {
      dedupeKey: `stale-lifecycle:${mapping.leadId}`,
      issueType: "STALE_LEAD",
      severity: getStaleLeadSeverity(referenceAt, now),
      sourceSystem: "CRM",
      title: "Lifecycle sync is stale",
      summary: `${mapping.lead.customerName ?? mapping.lead.externalLeadId} has not been refreshed from ServiceTitan recently.`,
      businessId: mapping.lead.businessId ?? null,
      locationId: mapping.locationId ?? mapping.lead.locationId ?? mapping.lead.business?.locationId ?? null,
      leadId: mapping.leadId,
      detailsJson: {
        mappingId: mapping.id,
        externalCrmLeadId: mapping.externalCrmLeadId,
        externalJobId: mapping.externalJobId,
        lastSyncedAt: mapping.lastSyncedAt,
        matchedAt: mapping.matchedAt,
        serviceCategory: mapping.lead.serviceCategory?.name ?? null
      }
    };
  });
}

function buildMappingConflictDetectedIssues(
  rows: Awaited<ReturnType<typeof listMappingConflictCandidates>>
): DetectedIssue[] {
  return rows.map((mapping) => ({
    dedupeKey: `mapping-conflict:${mapping.leadId}`,
    issueType: "MAPPING_CONFLICT",
    severity: "HIGH",
    sourceSystem: mapping.sourceSystem,
    title: "CRM mapping conflict",
    summary: mapping.issueSummary ?? "This lead has conflicting CRM mapping data.",
    businessId: mapping.lead.businessId ?? null,
    locationId: mapping.locationId ?? mapping.lead.locationId ?? mapping.lead.business?.locationId ?? null,
    leadId: mapping.leadId,
    detailsJson: {
      mappingId: mapping.id,
      externalCrmLeadId: mapping.externalCrmLeadId,
      externalOpportunityId: mapping.externalOpportunityId,
      externalJobId: mapping.externalJobId,
      issueSummary: mapping.issueSummary
    }
  }));
}

function buildAutoresponderDetectedIssues(
  rows: Awaited<ReturnType<typeof listAutoresponderFailureCandidates>>
): DetectedIssue[] {
  return rows.map((attempt) => ({
    dedupeKey: `autoresponder:${attempt.id}`,
    issueType: "AUTORESPONDER_FAILURE",
    severity: attempt.status === "FAILED" ? "HIGH" : "MEDIUM",
    sourceSystem: attempt.sourceSystem,
    title:
      attempt.status === "FAILED"
        ? `${humanizeLeadAutomationCadence(attempt.cadence)} did not send`
        : `${humanizeLeadAutomationCadence(attempt.cadence)} is stuck`,
    summary:
      attempt.errorSummary ??
      (attempt.status === "FAILED"
        ? `${humanizeLeadAutomationCadence(attempt.cadence)} failed.`
        : `${humanizeLeadAutomationCadence(attempt.cadence)} is still pending and needs review.`),
    businessId: attempt.businessId ?? attempt.lead.businessId ?? null,
    locationId: attempt.locationId ?? attempt.lead.locationId ?? attempt.business?.locationId ?? null,
    leadId: attempt.leadId,
    detailsJson: {
      attemptId: attempt.id,
      cadence: attempt.cadence,
      status: attempt.status,
      recipient: attempt.recipient,
      channel: attempt.channel,
      rule: attempt.rule?.name ?? null,
      ruleCadence: attempt.rule?.cadence ?? null,
      template: attempt.template?.name ?? null,
      triggeredAt: attempt.triggeredAt,
      dueAt: attempt.dueAt ?? null,
      providerStatus: attempt.providerStatus,
      providerMessageId: attempt.providerMessageId,
      errorSummary: attempt.errorSummary
    }
  }));
}

function buildReportDeliveryDetectedIssues(
  rows: Awaited<ReturnType<typeof listReportDeliveryFailureCandidates>>
): DetectedIssue[] {
  return rows.map((run) => ({
    dedupeKey: `report-delivery:${run.id}`,
    issueType: "REPORT_DELIVERY_FAILURE",
    severity: "HIGH",
    sourceSystem: "DERIVED",
    title: "Report delivery failed",
    summary:
      run.errorSummary ??
      (run.deliveryStatus === "FAILED"
        ? "Scheduled report delivery failed."
        : "Scheduled report generation failed."),
    businessId: run.reportRequest?.business?.id ?? null,
    locationId: run.locationId ?? null,
    reportRequestId: run.reportRequestId ?? null,
    reportScheduleRunId: run.id,
    detailsJson: {
      runId: run.id,
      scheduleName: run.schedule.name,
      scope: run.scope,
      generationStatus: run.generationStatus,
      deliveryStatus: run.deliveryStatus,
      scheduledFor: run.scheduledFor,
      errorSummary: run.errorSummary
    }
  }));
}

function buildStaleLeadDetectedIssues(
  rows: Awaited<ReturnType<typeof listStaleLeadCandidates>>,
  now: Date
): DetectedIssue[] {
  return rows.map((lead) => {
    const referenceAt = lead.latestInteractionAt ?? lead.createdAtYelp;

    return {
      dedupeKey: `stale-lead:${lead.id}`,
      issueType: "STALE_LEAD",
      severity: getStaleLeadSeverity(referenceAt, now),
      sourceSystem: "DERIVED",
      title: "Lead has no final outcome",
      summary: `${lead.customerName ?? lead.externalLeadId} has been sitting in ${lead.internalStatus.replaceAll("_", " ").toLowerCase()} without a final outcome.`,
      businessId: lead.businessId ?? null,
      locationId: lead.locationId ?? lead.business?.locationId ?? null,
      leadId: lead.id,
      detailsJson: {
        externalLeadId: lead.externalLeadId,
        internalStatus: lead.internalStatus,
        createdAtYelp: lead.createdAtYelp,
        latestInteractionAt: lead.latestInteractionAt,
        serviceCategory: lead.serviceCategory?.name ?? null
      }
    };
  });
}

export async function refreshOperatorIssues(tenantId: string) {
  const now = new Date();
  const pendingBefore = new Date(now.getTime() - 10 * 60 * 1000);
  const staleBefore = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const [
    existingIssues,
    leadSyncFailures,
    unmappedLeads,
    crmSyncFailures,
    mappingConflicts,
    autoresponderFailures,
    reportDeliveryFailures,
    staleLeads,
    staleLifecycleLeads
  ] = await Promise.all([
    listExistingOperatorIssues(tenantId),
    listLeadSyncFailureCandidates(tenantId),
    listUnmappedLeadCandidates(tenantId),
    listCrmSyncFailureCandidates(tenantId),
    listMappingConflictCandidates(tenantId),
    listAutoresponderFailureCandidates(tenantId, pendingBefore),
    listReportDeliveryFailureCandidates(tenantId),
    listStaleLeadCandidates(tenantId, staleBefore),
    listStaleLifecycleSyncCandidates(tenantId, staleBefore)
  ]);
  const candidates = [
    ...buildLeadSyncDetectedIssues(leadSyncFailures),
    ...buildUnmappedLeadDetectedIssues(unmappedLeads, now),
    ...buildCrmSyncDetectedIssues(crmSyncFailures),
    ...buildMappingConflictDetectedIssues(mappingConflicts),
    ...buildAutoresponderDetectedIssues(autoresponderFailures),
    ...buildReportDeliveryDetectedIssues(reportDeliveryFailures),
    ...buildStaleLeadDetectedIssues(staleLeads, now),
    ...buildStaleLifecycleDetectedIssues(staleLifecycleLeads, now)
  ];
  const existingByKey = new Map(existingIssues.map((issue) => [issue.dedupeKey, issue]));
  const activeKeys = new Set<string>();
  let createdCount = 0;
  let reopenedCount = 0;
  let autoResolvedCount = 0;

  for (const candidate of candidates) {
    activeKeys.add(candidate.dedupeKey);
    const existing = existingByKey.get(candidate.dedupeKey);

    if (!existing) {
      await createOperatorIssue(tenantId, {
        businessId: candidate.businessId ?? null,
        locationId: candidate.locationId ?? null,
        leadId: candidate.leadId ?? null,
        reportRequestId: candidate.reportRequestId ?? null,
        reportScheduleRunId: candidate.reportScheduleRunId ?? null,
        syncRunId: candidate.syncRunId ?? null,
        issueType: candidate.issueType,
        severity: candidate.severity,
        status: "OPEN",
        dedupeKey: candidate.dedupeKey,
        sourceSystem: candidate.sourceSystem,
        title: candidate.title,
        summary: candidate.summary,
        detailsJson: toJsonValue(candidate.detailsJson),
        detectedCount: 1,
        firstDetectedAt: now,
        lastDetectedAt: now
      });
      createdCount += 1;
      continue;
    }

    const reopen = existing.status === "RESOLVED";
    const nextDetectedCount = existing.detectedCount + 1;
    const visibleCandidate = applyDeadLetterEscalation(candidate, nextDetectedCount);

    await updateOperatorIssue(existing.id, {
      businessId: visibleCandidate.businessId ?? null,
      locationId: visibleCandidate.locationId ?? null,
      leadId: visibleCandidate.leadId ?? null,
      reportRequestId: visibleCandidate.reportRequestId ?? null,
      reportScheduleRunId: visibleCandidate.reportScheduleRunId ?? null,
      syncRunId: visibleCandidate.syncRunId ?? null,
      issueType: visibleCandidate.issueType,
      severity: visibleCandidate.severity,
      sourceSystem: visibleCandidate.sourceSystem,
      title: visibleCandidate.title,
      summary: visibleCandidate.summary,
      detailsJson: toJsonValue(visibleCandidate.detailsJson),
      lastDetectedAt: now,
      detectedCount: nextDetectedCount,
      ...(existing.status === "IGNORED"
        ? {
            status: "IGNORED"
          }
        : {
            status: "OPEN",
            resolvedAt: null,
            resolvedById: null,
            resolutionReason: null,
            resolutionNote: null,
            ignoredAt: null,
            ignoredById: null
          })
    });

    if (reopen) {
      reopenedCount += 1;
    }
  }

  for (const existing of existingIssues) {
    if (!activeKeys.has(existing.dedupeKey) && existing.status === "OPEN") {
      await updateOperatorIssue(existing.id, {
        status: "RESOLVED",
        resolvedAt: now,
        resolutionReason: "AUTO_CLEARED",
        resolutionNote: "Underlying condition cleared."
      });
      autoResolvedCount += 1;
    }
  }

  const openCount =
    existingIssues.filter((issue) => issue.status === "OPEN").length + createdCount + reopenedCount - autoResolvedCount;

  await recordOperatorIssueRefreshMetrics({
    tenantId,
    createdCount,
    reopenedCount,
    autoResolvedCount,
    openCount: Math.max(0, openCount)
  });
}

export async function refreshOperatorIssuesIfStale(tenantId: string, force = false) {
  const now = Date.now();
  const current = await getSystemSetting<{
    startedAt?: string | null;
    completedAt?: string | null;
  }>(tenantId, operatorIssueRefreshSettingKey);
  const startedAt = current?.startedAt ? Date.parse(current.startedAt) : null;
  const completedAt = current?.completedAt ? Date.parse(current.completedAt) : null;

  if (!force) {
    if (Number.isFinite(completedAt) && now - (completedAt as number) < operatorIssueRefreshIntervalMs) {
      return;
    }

    if (Number.isFinite(startedAt) && now - (startedAt as number) < operatorIssueRefreshLeaseMs) {
      return;
    }
  }

  await upsertSystemSetting(tenantId, operatorIssueRefreshSettingKey, {
    startedAt: new Date(now).toISOString(),
    completedAt: current?.completedAt ?? null
  });

  try {
    await refreshOperatorIssues(tenantId);
    await upsertSystemSetting(tenantId, operatorIssueRefreshSettingKey, {
      startedAt: null,
      completedAt: new Date().toISOString()
    });
  } catch (error) {
    await upsertSystemSetting(tenantId, operatorIssueRefreshSettingKey, {
      startedAt: null,
      completedAt: current?.completedAt ?? null,
      lastErrorAt: new Date().toISOString(),
      lastErrorMessage: normalizeUnknownError(error).message
    });
    throw error;
  }
}

export async function getOperatorQueue(tenantId: string, rawFilters?: OperatorIssueFiltersInput) {
  await refreshOperatorIssuesIfStale(tenantId);
  const filters = operatorIssueFiltersSchema.parse(rawFilters ?? {});
  const olderThanDays = filters.age ? Number(filters.age) : undefined;
  const pageSize = DEFAULT_OPERATOR_ISSUES_PAGE_SIZE;
  const currentPage = Math.max(filters.page ?? 1, 1);
  const filterQuery = {
    issueType: filters.issueType || undefined,
    businessId: filters.businessId || undefined,
    locationId: filters.locationId || undefined,
    severity: filters.severity || undefined,
    status: filters.status || undefined,
    olderThanDays
  };
  const [summary, filteredTotal, filteredIssues, options] = await Promise.all([
    getOperatorIssueSummaryCounts(tenantId),
    countOperatorIssues(tenantId, filterQuery),
    listOperatorIssues(tenantId, {
      ...filterQuery,
      skip: (currentPage - 1) * pageSize,
      take: pageSize
    }),
    listOperatorIssueFilterOptions(tenantId)
  ]);
  const totalPages = filteredTotal === 0 ? 1 : Math.ceil(filteredTotal / pageSize);
  const normalizedPage = Math.min(currentPage, totalPages);
  const visibleIssues =
    normalizedPage === currentPage
      ? filteredIssues
      : await listOperatorIssues(tenantId, {
          ...filterQuery,
          skip: (normalizedPage - 1) * pageSize,
          take: pageSize
        });

  return {
    filters: {
      ...filters,
      page: normalizedPage
    },
    options,
    summary,
    issues: visibleIssues.map((issue) => ({
      ...issue,
      typeLabel: operatorIssueTypeLabels[issue.issueType],
      targetLabel:
        issue.lead?.customerName ??
        issue.lead?.externalLeadId ??
        issue.reportScheduleRun?.schedule.name ??
        issue.business?.name ??
        "Tenant-wide",
      remapHref: getIssueRemapHref({
        issueType: issue.issueType,
        leadId: issue.leadId
      }),
      retryable: canRetryIssue(issue),
      retryLabel: getRetryLabel(issue.issueType),
      actionable: getIssueStatusActionability(issue.status)
    })),
    pagination: {
      currentPage: normalizedPage,
      pageSize,
      filteredTotal,
      totalPages,
      hasPreviousPage: normalizedPage > 1,
      hasNextPage: normalizedPage < totalPages
    }
  };
}

export async function getOperatorIssueDetail(tenantId: string, issueId: string) {
  await refreshOperatorIssuesIfStale(tenantId);
  const issue = await getOperatorIssueById(tenantId, issueId);
  const auditTrail = await listIssueAuditContext(tenantId, issue.id, 25);

  return {
    issue,
    auditTrail,
    typeLabel: operatorIssueTypeLabels[issue.issueType],
    retryable: canRetryIssue(issue),
    retryLabel: getRetryLabel(issue.issueType),
    remapHref: getIssueRemapHref({
      issueType: issue.issueType,
      leadId: issue.leadId
    })
  };
}

export async function resolveOperatorIssueWorkflow(
  tenantId: string,
  actorId: string,
  issueId: string,
  input: unknown
) {
  const values = operatorIssueResolutionSchema.parse(input);
  const issue = await getOperatorIssueById(tenantId, issueId);
  const now = new Date();

  await updateOperatorIssue(issue.id, {
    status: "RESOLVED",
    resolvedAt: now,
    resolvedById: actorId,
    resolutionReason: values.reason,
    resolutionNote: values.note || null,
    ignoredAt: null,
    ignoredById: null
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: issue.businessId ?? undefined,
    reportRequestId: issue.reportRequestId ?? undefined,
    actionType: "issue.resolve",
    status: "SUCCESS",
    correlationId: issue.id,
    upstreamReference: issue.dedupeKey,
    requestSummary: {
      reason: values.reason,
      note: values.note || null
    },
    responseSummary: {
      issueId: issue.id,
      status: "RESOLVED"
    }
  });

  return getOperatorIssueById(tenantId, issue.id);
}

export async function ignoreOperatorIssueWorkflow(
  tenantId: string,
  actorId: string,
  issueId: string,
  input: unknown
) {
  const values = operatorIssueResolutionSchema.parse(input);
  const issue = await getOperatorIssueById(tenantId, issueId);
  const now = new Date();

  await updateOperatorIssue(issue.id, {
    status: "IGNORED",
    ignoredAt: now,
    ignoredById: actorId,
    resolutionReason: values.reason,
    resolutionNote: values.note || null
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: issue.businessId ?? undefined,
    reportRequestId: issue.reportRequestId ?? undefined,
    actionType: "issue.ignore",
    status: "SUCCESS",
    correlationId: issue.id,
    upstreamReference: issue.dedupeKey,
    requestSummary: {
      reason: values.reason,
      note: values.note || null
    },
    responseSummary: {
      issueId: issue.id,
      status: "IGNORED"
    }
  });

  return getOperatorIssueById(tenantId, issue.id);
}

export async function addOperatorIssueNoteWorkflow(
  tenantId: string,
  actorId: string,
  issueId: string,
  input: unknown
) {
  const values = operatorIssueNoteSchema.parse(input);
  const issue = await getOperatorIssueById(tenantId, issueId);

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: issue.businessId ?? undefined,
    reportRequestId: issue.reportRequestId ?? undefined,
    actionType: "issue.note",
    status: "SUCCESS",
    correlationId: issue.id,
    upstreamReference: issue.dedupeKey,
    requestSummary: {
      note: values.note
    }
  });

  return getOperatorIssueById(tenantId, issue.id);
}

export async function retryOperatorIssueWorkflow(
  tenantId: string,
  actorId: string,
  issueId: string,
  options?: {
    skipRefresh?: boolean;
  }
) {
  const issue = await getOperatorIssueById(tenantId, issueId);

  if (!canRetryIssue(issue)) {
    throw new YelpValidationError("Retry is not available for this issue type.");
  }

  try {
    if (issue.issueType === "LEAD_SYNC_FAILURE") {
      if (!issue.syncRunId) {
        throw new YelpValidationError("This issue is not linked to a lead sync run.");
      }

      await retryLeadSyncRunWorkflow(tenantId, actorId, issue.syncRunId);
    } else if (issue.issueType === "CRM_SYNC_FAILURE") {
      if (!issue.syncRunId) {
        throw new YelpValidationError("This issue is not linked to a downstream sync run.");
      }

      await retryCrmSyncRunWorkflow(tenantId, actorId, issue.syncRunId);
    } else if (issue.issueType === "REPORT_DELIVERY_FAILURE") {
      if (!issue.reportScheduleRunId) {
        throw new YelpValidationError("This issue is not linked to a report delivery run.");
      }

      await resendReportScheduleRunWorkflow(tenantId, actorId, issue.reportScheduleRunId);
    } else if (issue.issueType === "AUTORESPONDER_FAILURE") {
      if (!issue.leadId) {
        throw new YelpValidationError("This issue is not linked to a lead.");
      }

      const details = asRecord(issue.detailsJson);
      const attemptId = typeof details?.attemptId === "string" ? details.attemptId : null;

      await retryLeadAutomationAttemptWorkflow(tenantId, actorId, issue.leadId, attemptId);
    } else {
      throw new YelpValidationError("Retry is not available for this issue type.");
    }

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: issue.businessId ?? undefined,
      reportRequestId: issue.reportRequestId ?? undefined,
      actionType: "issue.retry",
      status: "SUCCESS",
      correlationId: issue.id,
      upstreamReference: issue.dedupeKey,
      requestSummary: {
        issueType: issue.issueType
      }
    });
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: issue.businessId ?? undefined,
      reportRequestId: issue.reportRequestId ?? undefined,
      actionType: "issue.retry",
      status: "FAILED",
      correlationId: issue.id,
      upstreamReference: issue.dedupeKey,
      requestSummary: {
        issueType: issue.issueType
      },
      responseSummary: {
        message: normalized.message,
        code: normalized.code
      }
    });

    throw error;
  }

  if (!options?.skipRefresh) {
    await refreshOperatorIssues(tenantId);
  }

  return getOperatorIssueById(tenantId, issue.id);
}

type BulkOperatorIssueActionResult = {
  issueId: string;
  status: "SUCCEEDED" | "FAILED" | "SKIPPED";
  message: string;
};

export async function bulkOperatorIssueActionWorkflow(
  tenantId: string,
  actorId: string,
  input: unknown
) {
  const values = operatorIssueBulkActionSchema.parse(input);
  const selectedIssueIds = [...new Set(values.issueIds)];
  const issues = await listOperatorIssuesByIds(tenantId, selectedIssueIds);
  const issueMap = new Map(issues.map((issue) => [issue.id, issue]));
  const results: BulkOperatorIssueActionResult[] = [];
  const requestId = randomUUID();

  for (const issueId of selectedIssueIds) {
    const issue = issueMap.get(issueId);

    if (!issue) {
      results.push({
        issueId,
        status: "FAILED",
        message: "Issue not found for this tenant."
      });
      continue;
    }

    try {
      if (values.action === "retry") {
        if (!canRetryIssue(issue)) {
          results.push({
            issueId,
            status: "SKIPPED",
            message: "Retry is not available for this issue."
          });
          continue;
        }

        await retryOperatorIssueWorkflow(tenantId, actorId, issueId, {
          skipRefresh: true
        });
      } else if (values.action === "resolve") {
        if (!getIssueStatusActionability(issue.status)) {
          results.push({
            issueId,
            status: "SKIPPED",
            message: "Only open issues can be resolved."
          });
          continue;
        }

        await resolveOperatorIssueWorkflow(tenantId, actorId, issueId, values);
      } else if (values.action === "ignore") {
        if (!getIssueStatusActionability(issue.status)) {
          results.push({
            issueId,
            status: "SKIPPED",
            message: "Only open issues can be ignored."
          });
          continue;
        }

        await ignoreOperatorIssueWorkflow(tenantId, actorId, issueId, values);
      } else {
        await addOperatorIssueNoteWorkflow(tenantId, actorId, issueId, values);
      }

      results.push({
        issueId,
        status: "SUCCEEDED",
        message:
          values.action === "retry"
            ? "Retry requested."
            : values.action === "resolve"
              ? "Issue resolved."
              : values.action === "ignore"
                ? "Issue ignored."
                : "Internal note added."
      });
    } catch (error) {
      const normalized = normalizeUnknownError(error);

      results.push({
        issueId,
        status: "FAILED",
        message: normalized.message
      });
    }
  }

  if (values.action === "retry") {
    await refreshOperatorIssues(tenantId);
  }

  const succeeded = results.filter((result) => result.status === "SUCCEEDED").length;
  const failed = results.filter((result) => result.status === "FAILED").length;
  const skipped = results.filter((result) => result.status === "SKIPPED").length;

  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: `issue.bulk.${values.action}`,
    status: failed > 0 ? "FAILED" : "SUCCESS",
    correlationId: requestId,
    requestSummary: {
      issueIds: selectedIssueIds,
      action: values.action,
      ...("reason" in values ? { reason: values.reason } : {}),
      ...("note" in values ? { note: values.note || null } : {})
    },
    responseSummary: {
      succeeded,
      failed,
      skipped,
      results
    }
  });

  return {
    action: values.action,
    selected: selectedIssueIds.length,
    succeeded,
    failed,
    skipped,
    results
  };
}
