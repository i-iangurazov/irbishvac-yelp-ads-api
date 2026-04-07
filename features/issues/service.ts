import "server-only";

import type { OperatorIssueSeverity, OperatorIssueStatus, OperatorIssueType, RecordSourceSystem } from "@prisma/client";

import {
  buildOperatorIssueSummary,
  getIssueRemapHref,
  getIssueStatusActionability,
  getStaleLeadSeverity,
  getUnmappedLeadSeverity,
  isRetryableIssueType,
  operatorIssueTypeLabels
} from "@/features/issues/normalize";
import {
  operatorIssueFiltersSchema,
  operatorIssueNoteSchema,
  operatorIssueResolutionSchema,
  type OperatorIssueFiltersInput
} from "@/features/issues/schemas";
import { recordAuditEvent } from "@/features/audit/service";
import { resendReportScheduleRunWorkflow } from "@/features/report-delivery/service";
import { retryLeadAutomationAttemptWorkflow } from "@/features/autoresponder/service";
import {
  createOperatorIssue,
  getOperatorIssueById,
  listAutoresponderFailureCandidates,
  listCrmSyncFailureCandidates,
  listExistingOperatorIssues,
  listIssueAuditContext,
  listLeadSyncFailureCandidates,
  listMappingConflictCandidates,
  listOperatorIssueFilterOptions,
  listOperatorIssues,
  listReportDeliveryFailureCandidates,
  listStaleLeadCandidates,
  listUnmappedLeadCandidates,
  updateOperatorIssue
} from "@/lib/db/issues-repository";
import { toJsonValue } from "@/lib/db/json";
import { YelpValidationError } from "@/lib/yelp/errors";

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

    return {
      dedupeKey: run.leadId ? `crm-sync:lead:${run.leadId}` : `crm-sync:run:${run.id}`,
      issueType: "CRM_SYNC_FAILURE",
      severity: "HIGH",
      sourceSystem: run.sourceSystem,
      title: "CRM enrichment failed",
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
    dedupeKey: `autoresponder:${attempt.leadId}`,
    issueType: "AUTORESPONDER_FAILURE",
    severity: attempt.status === "FAILED" ? "HIGH" : "MEDIUM",
    sourceSystem: attempt.sourceSystem,
    title: attempt.status === "FAILED" ? "First response did not send" : "First response is stuck",
    summary:
      attempt.errorSummary ??
      (attempt.status === "FAILED"
        ? "The autoresponder attempt failed."
        : "The autoresponder attempt is still pending and needs review."),
    businessId: attempt.businessId ?? attempt.lead.businessId ?? null,
    locationId: attempt.locationId ?? attempt.lead.locationId ?? attempt.business?.locationId ?? null,
    leadId: attempt.leadId,
    detailsJson: {
      attemptId: attempt.id,
      status: attempt.status,
      recipient: attempt.recipient,
      channel: attempt.channel,
      rule: attempt.rule?.name ?? null,
      template: attempt.template?.name ?? null,
      triggeredAt: attempt.triggeredAt,
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
    staleLeads
  ] = await Promise.all([
    listExistingOperatorIssues(tenantId),
    listLeadSyncFailureCandidates(tenantId),
    listUnmappedLeadCandidates(tenantId),
    listCrmSyncFailureCandidates(tenantId),
    listMappingConflictCandidates(tenantId),
    listAutoresponderFailureCandidates(tenantId, pendingBefore),
    listReportDeliveryFailureCandidates(tenantId),
    listStaleLeadCandidates(tenantId, staleBefore)
  ]);
  const candidates = [
    ...buildLeadSyncDetectedIssues(leadSyncFailures),
    ...buildUnmappedLeadDetectedIssues(unmappedLeads, now),
    ...buildCrmSyncDetectedIssues(crmSyncFailures),
    ...buildMappingConflictDetectedIssues(mappingConflicts),
    ...buildAutoresponderDetectedIssues(autoresponderFailures),
    ...buildReportDeliveryDetectedIssues(reportDeliveryFailures),
    ...buildStaleLeadDetectedIssues(staleLeads, now)
  ];
  const existingByKey = new Map(existingIssues.map((issue) => [issue.dedupeKey, issue]));
  const activeKeys = new Set<string>();

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
      continue;
    }

    const reopen = existing.status === "RESOLVED";

    await updateOperatorIssue(existing.id, {
      businessId: candidate.businessId ?? null,
      locationId: candidate.locationId ?? null,
      leadId: candidate.leadId ?? null,
      reportRequestId: candidate.reportRequestId ?? null,
      reportScheduleRunId: candidate.reportScheduleRunId ?? null,
      syncRunId: candidate.syncRunId ?? null,
      issueType: candidate.issueType,
      severity: candidate.severity,
      sourceSystem: candidate.sourceSystem,
      title: candidate.title,
      summary: candidate.summary,
      detailsJson: toJsonValue(candidate.detailsJson),
      lastDetectedAt: now,
      detectedCount: reopen ? existing.detectedCount + 1 : existing.detectedCount,
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
  }

  for (const existing of existingIssues) {
    if (!activeKeys.has(existing.dedupeKey) && existing.status === "OPEN") {
      await updateOperatorIssue(existing.id, {
        status: "RESOLVED",
        resolvedAt: now,
        resolutionReason: "AUTO_CLEARED",
        resolutionNote: "Underlying condition cleared."
      });
    }
  }
}

export async function getOperatorQueue(tenantId: string, rawFilters?: OperatorIssueFiltersInput) {
  await refreshOperatorIssues(tenantId);
  const filters = operatorIssueFiltersSchema.parse(rawFilters ?? {});
  const olderThanDays = filters.age ? Number(filters.age) : undefined;
  const [allIssues, filteredIssues, options] = await Promise.all([
    listOperatorIssues(tenantId),
    listOperatorIssues(tenantId, {
      issueType: filters.issueType || undefined,
      businessId: filters.businessId || undefined,
      locationId: filters.locationId || undefined,
      severity: filters.severity || undefined,
      status: filters.status || undefined,
      olderThanDays
    }),
    listOperatorIssueFilterOptions(tenantId)
  ]);

  return {
    filters,
    options,
    summary: buildOperatorIssueSummary(allIssues),
    issues: filteredIssues.map((issue) => ({
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
      retryable: isRetryableIssueType(issue.issueType),
      actionable: getIssueStatusActionability(issue.status)
    }))
  };
}

export async function getOperatorIssueDetail(tenantId: string, issueId: string) {
  await refreshOperatorIssues(tenantId);
  const issue = await getOperatorIssueById(tenantId, issueId);
  const auditTrail = await listIssueAuditContext(tenantId, issue.id, 25);

  return {
    issue,
    auditTrail,
    typeLabel: operatorIssueTypeLabels[issue.issueType],
    retryable: isRetryableIssueType(issue.issueType),
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

export async function retryOperatorIssueWorkflow(tenantId: string, actorId: string, issueId: string) {
  const issue = await getOperatorIssueById(tenantId, issueId);

  if (issue.issueType === "REPORT_DELIVERY_FAILURE") {
    if (!issue.reportScheduleRunId) {
      throw new YelpValidationError("This issue is not linked to a report delivery run.");
    }

    await resendReportScheduleRunWorkflow(tenantId, actorId, issue.reportScheduleRunId);
  } else if (issue.issueType === "AUTORESPONDER_FAILURE") {
    if (!issue.leadId) {
      throw new YelpValidationError("This issue is not linked to a lead.");
    }

    await retryLeadAutomationAttemptWorkflow(tenantId, actorId, issue.leadId);
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

  await refreshOperatorIssues(tenantId);
  return getOperatorIssueById(tenantId, issue.id);
}
