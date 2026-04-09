import "server-only";

import { Prisma } from "@prisma/client";
import type { ReportScheduleDeliveryScope, ReportScheduleRunScope } from "@prisma/client";
import Papa from "papaparse";

import { recordAuditEvent } from "@/features/audit/service";
import {
  buildReportDeliveryCsv,
  buildReportDeliveryEmail,
  type ReportDeliverySummary,
  isSmtpConfigured,
  sendScheduledReportEmail
} from "@/features/report-delivery/email";
import {
  isReadyForDelivery,
  mapReportStatusToGenerationStatus,
  shouldFanOutLocationDelivery,
  shouldSendAccountDelivery
} from "@/features/report-delivery/logic";
import {
  getReportScheduleDeliveryScopeLabel,
  readLocationRecipientOverridesJson,
  resolveRecipientRoute
} from "@/features/report-delivery/routing";
import { buildReportScheduleRunKey, describeSchedule, getLatestScheduleWindow } from "@/features/report-delivery/schedule";
import { parseRecipientEmails, reportScheduleFormSchema } from "@/features/report-delivery/schemas";
import { reportMetrics, reportUnknownBucketValue } from "@/features/reporting/schemas";
import { getReportBreakdownView, getReportDetail, pollReportWorkflow, requestReportByValues } from "@/features/reporting/service";
import { listBusinesses } from "@/lib/db/businesses-repository";
import { listOpenOperatorIssuesForReportScheduleRunIds } from "@/lib/db/issues-repository";
import { toJsonValue } from "@/lib/db/json";
import {
  createReportSchedule,
  findReportScheduleRunByRunKey,
  getReportScheduleById,
  getReportScheduleRunById,
  listEnabledReportSchedules,
  listRecentReportScheduleRuns,
  listReportScheduleLocations,
  listReportScheduleRunsForOccurrence,
  listReportSchedules,
  listPendingReportScheduleRuns,
  updateReportSchedule,
  updateReportScheduleRun,
  upsertReportScheduleRunByRunKey
} from "@/lib/db/report-delivery-repository";
import { getServerEnv } from "@/lib/utils/env";
import { formatDateTime } from "@/lib/utils/format";
import { logError, logInfo } from "@/lib/utils/logging";
import { normalizeUnknownError, YelpValidationError } from "@/lib/yelp/errors";

function readRecipientEmailsJson(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function readRecipientContextJson(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  return {
    routingMode: typeof record.routingMode === "string" ? record.routingMode : null,
    routingLabel: typeof record.routingLabel === "string" ? record.routingLabel : null
  };
}

function buildDashboardUrl(reportRequestId: string, params?: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const suffix = searchParams.toString();
  return `${getServerEnv().APP_URL}/reporting/${reportRequestId}${suffix ? `?${suffix}` : ""}`;
}

async function getScheduleBusinessIds(tenantId: string, businessId?: string | null) {
  const businesses = await listBusinesses(tenantId);
  const scoped = businessId ? businesses.filter((item) => item.id === businessId) : businesses;
  return scoped.map((business) => business.id);
}

function getRunScopeLabel(params: {
  scope: ReportScheduleRunScope;
  scheduleName: string;
  locationName?: string | null;
}) {
  if (params.scope === "LOCATION") {
    return `Location report: ${params.locationName ?? "Unknown location"}`;
  }

  return params.scheduleName;
}

function buildWindowLabel(windowStart: Date, windowEnd: Date) {
  return `${formatDateTime(windowStart, "MMM d, yyyy")} to ${formatDateTime(windowEnd, "MMM d, yyyy")}`;
}

async function buildRunSummary(params: {
  tenantId: string;
  reportRequestId: string;
  scheduleName: string;
  scope: ReportScheduleRunScope;
  locationId?: string | null;
  locationName?: string | null;
  windowStart: Date;
  windowEnd: Date;
}) {
  const from = params.windowStart.toISOString().slice(0, 10);
  const to = params.windowEnd.toISOString().slice(0, 10);
  const locationFilter = params.scope === "LOCATION" ? params.locationId ?? reportUnknownBucketValue : undefined;
  const [locationView, serviceView] = await Promise.all([
    getReportBreakdownView(params.tenantId, params.reportRequestId, {
      view: "location",
      from,
      to,
      locationId: locationFilter
    }),
    getReportBreakdownView(params.tenantId, params.reportRequestId, {
      view: "service",
      from,
      to,
      locationId: locationFilter
    })
  ]);

  return {
    windowLabel: buildWindowLabel(params.windowStart, params.windowEnd),
    scopeLabel: getRunScopeLabel({
      scope: params.scope,
      scheduleName: params.scheduleName,
      locationName: params.locationName ?? null
    }),
    dashboardUrl: buildDashboardUrl(params.reportRequestId, {
      view: params.scope === "LOCATION" ? "service" : "location",
      from,
      to,
      locationId: locationFilter
    }),
    totals: {
      yelpSpendCents: locationView.breakdown.totals.yelpSpendCents,
      totalLeads: locationView.breakdown.totals.totalLeads,
      mappedLeads: locationView.breakdown.totals.mappedLeads,
      active: locationView.breakdown.totals.active,
      contacted: locationView.breakdown.totals.contacted,
      booked: locationView.breakdown.totals.booked,
      scheduled: locationView.breakdown.totals.scheduled,
      jobInProgress: locationView.breakdown.totals.jobInProgress,
      completed: locationView.breakdown.totals.completed,
      won: locationView.breakdown.totals.won,
      lost: locationView.breakdown.totals.lost,
      mappingRate: locationView.breakdown.totals.mappingRate,
      bookedRate: locationView.breakdown.totals.bookedRate,
      scheduledRate: locationView.breakdown.totals.scheduledRate,
      completionRate: locationView.breakdown.totals.completionRate,
      winRate: locationView.breakdown.totals.winRate,
      closeRate: locationView.breakdown.totals.closeRate,
      costPerLeadCents: locationView.breakdown.totals.costPerLeadCents,
      costPerBookedJobCents: locationView.breakdown.totals.costPerBookedJobCents,
      costPerCompletedJobCents: locationView.breakdown.totals.costPerCompletedJobCents
    },
    locationBreakdown: locationView.breakdown.rows.map((row) => ({
      bucketId: row.bucketId,
      bucketLabel: row.bucketLabel,
      totalLeads: row.totalLeads,
      mappedLeads: row.mappedLeads,
      active: row.active,
      contacted: row.contacted,
      booked: row.booked,
      scheduled: row.scheduled,
      jobInProgress: row.jobInProgress,
      completed: row.completed,
      won: row.won,
      lost: row.lost,
      mappingRate: row.mappingRate,
      bookedRate: row.bookedRate,
      scheduledRate: row.scheduledRate,
      completionRate: row.completionRate,
      winRate: row.winRate,
      closeRate: row.closeRate,
      yelpSpendCents: row.yelpSpendCents
    })),
    serviceBreakdown: serviceView.breakdown.rows.map((row) => ({
      bucketId: row.bucketId,
      bucketLabel: row.bucketLabel,
      totalLeads: row.totalLeads,
      mappedLeads: row.mappedLeads,
      active: row.active,
      contacted: row.contacted,
      booked: row.booked,
      scheduled: row.scheduled,
      jobInProgress: row.jobInProgress,
      completed: row.completed,
      won: row.won,
      lost: row.lost,
      mappingRate: row.mappingRate,
      bookedRate: row.bookedRate,
      scheduledRate: row.scheduledRate,
      completionRate: row.completionRate,
      winRate: row.winRate,
      closeRate: row.closeRate,
      yelpSpendCents: row.yelpSpendCents
    })),
    sourceLabels: {
      yelp: "Yelp-native delayed batch metrics",
      internal: "Internal-derived CRM lead and outcome metrics"
    }
  } satisfies ReportDeliverySummary;
}

async function getReportScheduleRunForTenant(tenantId: string, runId: string) {
  return getReportScheduleRunById(runId, tenantId);
}

function getOccurrenceRunKeySuffix(force: boolean) {
  return force ? `:manual:${Date.now()}` : "";
}

async function enqueueScheduleOccurrence(params: {
  tenantId: string;
  scheduleId: string;
  actorId?: string | null;
  force?: boolean;
}) {
  const schedule = await getReportScheduleById(params.scheduleId, params.tenantId);
  const recipientEmails = readRecipientEmailsJson(schedule.recipientEmailsJson);

  if (recipientEmails.length === 0) {
    throw new YelpValidationError("This schedule has no recipients configured.");
  }

  const window = getLatestScheduleWindow(schedule);
  const baseRunKey = buildReportScheduleRunKey({
    scheduleId: schedule.id,
    scheduledFor: window.scheduledFor,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    scope: "ACCOUNT",
    scopeKey: "account"
  });
  const runKey = `${baseRunKey}${getOccurrenceRunKeySuffix(Boolean(params.force))}`;

  if (!params.force) {
    const existing = await findReportScheduleRunByRunKey(runKey);

    if (existing) {
      return existing;
    }
  }

  const startedAt = new Date();
  const run = await upsertReportScheduleRunByRunKey(runKey, {
    create: {
      runKey,
      tenantId: schedule.tenantId,
      scheduleId: schedule.id,
      scope: "ACCOUNT",
      scopeKey: "account",
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      scheduledFor: window.scheduledFor,
      generationStatus: "PENDING",
      deliveryStatus: "PENDING",
      recipientEmailsJson: recipientEmails,
      recipientContextJson: toJsonValue({
        routingMode: "ACCOUNT_DEFAULT",
        routingLabel: "Default account recipients"
      }),
      generationStartedAt: startedAt
    },
    update: {
      generationStatus: "PENDING",
      deliveryStatus: "PENDING",
      reportRequestId: null,
      dashboardUrl: null,
      summaryJson: Prisma.JsonNull,
      generationStartedAt: startedAt,
      generatedAt: null,
      deliveryStartedAt: null,
      deliveredAt: null,
      lastAttemptedAt: null,
      errorSummary: null,
      errorJson: Prisma.JsonNull,
      recipientEmailsJson: recipientEmails,
      recipientContextJson: toJsonValue({
        routingMode: "ACCOUNT_DEFAULT",
        routingLabel: "Default account recipients"
      })
    }
  });

  await updateReportSchedule(schedule.id, schedule.tenantId, {
    lastTriggeredAt: startedAt
  });

  try {
    const businessIds = await getScheduleBusinessIds(schedule.tenantId, schedule.businessId);

    if (businessIds.length === 0) {
      const message = "No saved businesses are available for scheduled reporting.";
      await updateReportScheduleRun(run.id, {
        generationStatus: "SKIPPED",
        deliveryStatus: "SKIPPED",
        errorSummary: message,
        errorJson: toJsonValue({ reason: "no_businesses" })
      });
      await recordAuditEvent({
        tenantId: schedule.tenantId,
        actorId: params.actorId ?? undefined,
        actionType: "report.schedule.generate",
        status: "FAILED",
        requestSummary: toJsonValue({ scheduleId: schedule.id, runId: run.id }),
        responseSummary: toJsonValue({ message })
      });

      return getReportScheduleRunForTenant(schedule.tenantId, run.id);
    }

    const reportRequest = await requestReportByValues(schedule.tenantId, params.actorId ?? null, {
      granularity: schedule.cadence === "MONTHLY" ? "MONTHLY" : "DAILY",
      businessIds,
      startDate: window.startDate,
      endDate: window.endDate,
      metrics: [...reportMetrics]
    });

    await updateReportScheduleRun(run.id, {
      reportRequestId: reportRequest.id,
      generationStatus: mapReportStatusToGenerationStatus(reportRequest.status)
    });
    await recordAuditEvent({
      tenantId: schedule.tenantId,
      actorId: params.actorId ?? undefined,
      reportRequestId: reportRequest.id,
      actionType: "report.schedule.generate",
      status: "SUCCESS",
      requestSummary: toJsonValue({
        scheduleId: schedule.id,
        runId: run.id,
        cadence: schedule.cadence,
        windowStart: window.startDate,
        windowEnd: window.endDate
      }),
      responseSummary: toJsonValue({
        reportRequestId: reportRequest.id,
        status: reportRequest.status
      })
    });
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await updateReportScheduleRun(run.id, {
      generationStatus: "FAILED",
      deliveryStatus: "FAILED",
      lastAttemptedAt: new Date(),
      errorSummary: normalized.message,
      errorJson: toJsonValue({
        code: normalized.code,
        details: normalized.details ?? null
      })
    });
    await recordAuditEvent({
      tenantId: schedule.tenantId,
      actorId: params.actorId ?? undefined,
      actionType: "report.schedule.generate",
      status: "FAILED",
      requestSummary: toJsonValue({ scheduleId: schedule.id, runId: run.id }),
      responseSummary: toJsonValue({ message: normalized.message })
    });
    logError("report.schedule.enqueue_failed", {
      tenantId: schedule.tenantId,
      scheduleId: schedule.id,
      runId: run.id,
      message: normalized.message
    });
  }

  return getReportScheduleRunForTenant(schedule.tenantId, run.id);
}

export async function getReportDeliveryAdminState(tenantId: string, selectedScheduleId?: string) {
  const [schedules, recentRuns, selectedSchedule, locations] = await Promise.all([
    listReportSchedules(tenantId),
    listRecentReportScheduleRuns(tenantId, 20),
    selectedScheduleId ? getReportScheduleById(selectedScheduleId, tenantId).catch(() => null) : Promise.resolve(null),
    listReportScheduleLocations(tenantId)
  ]);
  const linkedIssues = await listOpenOperatorIssuesForReportScheduleRunIds(
    tenantId,
    recentRuns.map((run) => run.id)
  );
  const issuesByRunId = new Map<string, typeof linkedIssues>();

  for (const issue of linkedIssues) {
    const key = issue.reportScheduleRunId;

    if (!key) {
      continue;
    }

    const current = issuesByRunId.get(key) ?? [];
    current.push(issue);
    issuesByRunId.set(key, current);
  }

  return {
    schedules: schedules.map((schedule) => {
      const defaultRecipients = readRecipientEmailsJson(schedule.recipientEmailsJson);
      const locationOverrides = readLocationRecipientOverridesJson(schedule.locationRecipientOverridesJson);

      return {
        ...schedule,
        deliveryScopeLabel: getReportScheduleDeliveryScopeLabel(schedule.deliveryScope),
        defaultRecipientCount: defaultRecipients.length,
        locationOverrideCount: locationOverrides.length
      };
    }),
    recentRuns: recentRuns.map((run) => {
      const openIssues = issuesByRunId.get(run.id) ?? [];
      const primaryIssue = openIssues[0] ?? null;
      const recipientContext = readRecipientContextJson(run.recipientContextJson);

      return {
        ...run,
        recipientRoutingLabel: recipientContext?.routingLabel ?? "Default account recipients",
        openIssueCount: openIssues.length,
        primaryIssue: primaryIssue
          ? {
              id: primaryIssue.id,
              issueType: primaryIssue.issueType,
              severity: primaryIssue.severity,
              summary: primaryIssue.summary
            }
          : null
      };
    }),
    selectedSchedule,
    locations,
    smtpConfigured: isSmtpConfigured()
  };
}

export async function createReportScheduleWorkflow(tenantId: string, actorId: string, input: unknown) {
  const values = reportScheduleFormSchema.parse(input);
  const recipients = parseRecipientEmails(values.recipientEmails);
  const locationRecipientOverrides = values.locationRecipientOverrides.map((override) => ({
    locationId: override.locationId,
    recipientEmails: parseRecipientEmails(override.recipientEmails)
  }));
  const schedule = await createReportSchedule(tenantId, {
    tenantId,
    name: values.name,
    cadence: values.cadence,
    deliveryScope: values.deliveryScope,
    timezone: values.timezone,
    sendDayOfWeek: values.cadence === "WEEKLY" ? values.sendDayOfWeek ?? 0 : null,
    sendDayOfMonth: values.cadence === "MONTHLY" ? values.sendDayOfMonth ?? 1 : null,
    sendHour: values.sendHour,
    sendMinute: values.sendMinute,
    deliverPerLocation: values.deliveryScope !== "ACCOUNT_ONLY",
    recipientEmailsJson: recipients,
    locationRecipientOverridesJson: locationRecipientOverrides,
    isEnabled: values.isEnabled
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: "report.schedule.create",
    status: "SUCCESS",
    after: toJsonValue({
      scheduleId: schedule.id,
      name: schedule.name,
      cadence: schedule.cadence,
      deliveryScope: schedule.deliveryScope,
      timing: describeSchedule(schedule),
      recipientCount: recipients.length,
      locationOverrideCount: locationRecipientOverrides.length
    })
  });

  return schedule;
}

export async function updateReportScheduleWorkflow(tenantId: string, actorId: string, scheduleId: string, input: unknown) {
  const current = await getReportScheduleById(scheduleId, tenantId);
  const values = reportScheduleFormSchema.parse(input);
  const recipients = parseRecipientEmails(values.recipientEmails);
  const locationRecipientOverrides = values.locationRecipientOverrides.map((override) => ({
    locationId: override.locationId,
    recipientEmails: parseRecipientEmails(override.recipientEmails)
  }));

  await updateReportSchedule(scheduleId, tenantId, {
    name: values.name,
    cadence: values.cadence,
    deliveryScope: values.deliveryScope,
    timezone: values.timezone,
    sendDayOfWeek: values.cadence === "WEEKLY" ? values.sendDayOfWeek ?? 0 : null,
    sendDayOfMonth: values.cadence === "MONTHLY" ? values.sendDayOfMonth ?? 1 : null,
    sendHour: values.sendHour,
    sendMinute: values.sendMinute,
    deliverPerLocation: values.deliveryScope !== "ACCOUNT_ONLY",
    recipientEmailsJson: recipients,
    locationRecipientOverridesJson: locationRecipientOverrides,
    isEnabled: values.isEnabled
  });

  const updated = await getReportScheduleById(scheduleId, tenantId);
  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: "report.schedule.update",
    status: "SUCCESS",
    before: toJsonValue({
      scheduleId: current.id,
      name: current.name,
      cadence: current.cadence,
      recipientEmails: readRecipientEmailsJson(current.recipientEmailsJson),
      deliveryScope: current.deliveryScope,
      locationRecipientOverrides: readLocationRecipientOverridesJson(current.locationRecipientOverridesJson),
      isEnabled: current.isEnabled
    }),
    after: toJsonValue({
      scheduleId: updated.id,
      name: updated.name,
      cadence: updated.cadence,
      deliveryScope: updated.deliveryScope,
      recipientEmails: recipients,
      locationRecipientOverrides,
      isEnabled: updated.isEnabled
    })
  });

  return updated;
}

export async function generateReportScheduleNowWorkflow(tenantId: string, actorId: string, scheduleId: string) {
  const queuedRun = await enqueueScheduleOccurrence({
    tenantId,
    scheduleId,
    actorId,
    force: true
  });

  const hydrated =
    queuedRun.reportRequestId && queuedRun.generationStatus === "READY"
      ? await hydrateScheduledRun(queuedRun.id, tenantId)
      : await getReportScheduleRunById(queuedRun.id, tenantId);

  let result = hydrated;

  if (isReadyForDelivery(hydrated.generationStatus, hydrated.deliveryStatus)) {
    result = await resendReportScheduleRunWorkflow(tenantId, actorId, hydrated.id);
  }

  if (hydrated.scope === "ACCOUNT" && hydrated.schedule.deliveryScope !== "ACCOUNT_ONLY") {
    const siblingRuns = await listReportScheduleRunsForOccurrence({
      scheduleId: hydrated.scheduleId,
      scheduledFor: hydrated.scheduledFor,
      windowStart: hydrated.windowStart,
      windowEnd: hydrated.windowEnd
    });

    for (const sibling of siblingRuns) {
      if (sibling.scope === "LOCATION" && isReadyForDelivery(sibling.generationStatus, sibling.deliveryStatus)) {
        await resendReportScheduleRunWorkflow(tenantId, actorId, sibling.id);
      }
    }
  }

  return result;
}

export async function resendReportScheduleRunWorkflow(tenantId: string, actorId: string | null, runId: string) {
  const run = await getReportScheduleRunById(runId, tenantId);

  if (run.generationStatus !== "READY") {
    throw new YelpValidationError("Only generated runs can be resent.");
  }

  if (!run.summaryJson) {
    throw new YelpValidationError("This run does not have a generated summary yet.");
  }

  if (run.deliveryStatus === "SKIPPED") {
    throw new YelpValidationError("This run was intentionally skipped and cannot be resent.");
  }

  const summary = run.summaryJson as ReportDeliverySummary;
  const email = buildReportDeliveryEmail(summary);
  const csv = Papa.unparse(buildReportDeliveryCsv(summary));
  const recipientEmails = readRecipientEmailsJson(run.recipientEmailsJson);
  const recipientContext = readRecipientContextJson(run.recipientContextJson);

  if (recipientEmails.length === 0) {
    throw new YelpValidationError("This run has no routed recipients.");
  }

  const attemptStartedAt = new Date();

  await updateReportScheduleRun(run.id, {
    deliveryStatus: "SENDING",
    deliveryStartedAt: attemptStartedAt,
    lastAttemptedAt: attemptStartedAt,
    errorSummary: null,
    errorJson: Prisma.JsonNull
  });

  try {
    const delivery = await sendScheduledReportEmail({
      to: recipientEmails,
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachmentFilename: `report-${run.id}.csv`,
      attachmentContent: csv
    });
    const deliveredAt = new Date();

    await updateReportScheduleRun(run.id, {
      deliveryStatus: "SENT",
      deliveredAt,
      errorSummary: null,
      errorJson: toJsonValue({
        accepted: delivery.accepted,
        rejected: delivery.rejected
      })
    });
    await updateReportSchedule(run.scheduleId, tenantId, {
      lastSuccessfulDeliveryAt: deliveredAt
    });
    await recordAuditEvent({
      tenantId,
      actorId: actorId ?? undefined,
      reportRequestId: run.reportRequestId ?? undefined,
      actionType: "report.schedule.deliver",
      status: "SUCCESS",
      requestSummary: toJsonValue({
        scheduleId: run.scheduleId,
        runId: run.id,
        recipients: recipientEmails,
        recipientContext
      }),
      responseSummary: toJsonValue({
        accepted: delivery.accepted,
        rejected: delivery.rejected
      })
    });
    logInfo("report.schedule.delivered", {
      tenantId,
      scheduleId: run.scheduleId,
      runId: run.id,
      recipients: recipientEmails
      ,
      recipientContext
    });
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await updateReportScheduleRun(run.id, {
      deliveryStatus: "FAILED",
      errorSummary: normalized.message,
      errorJson: toJsonValue({
        code: normalized.code,
        details: normalized.details ?? null
      })
    });
    await recordAuditEvent({
      tenantId,
      actorId: actorId ?? undefined,
      reportRequestId: run.reportRequestId ?? undefined,
      actionType: "report.schedule.deliver",
      status: "FAILED",
      requestSummary: toJsonValue({
        scheduleId: run.scheduleId,
        runId: run.id,
        recipients: recipientEmails,
        recipientContext
      }),
      responseSummary: toJsonValue({ message: normalized.message })
    });
    logError("report.schedule.delivery_failed", {
      tenantId,
      scheduleId: run.scheduleId,
      runId: run.id,
      message: normalized.message,
      recipientContext
    });
  }

  return getReportScheduleRunById(run.id, tenantId);
}

async function materializeLocationRunsForAccountRun(accountRun: Awaited<ReturnType<typeof getReportScheduleRunById>>, summary: ReportDeliverySummary) {
  const defaultRecipients = readRecipientEmailsJson(accountRun.schedule.recipientEmailsJson);
  const locationOverrides = readLocationRecipientOverridesJson(accountRun.schedule.locationRecipientOverridesJson);

  for (const row of summary.locationBreakdown) {
    const locationId = row.bucketId === reportUnknownBucketValue ? null : row.bucketId;
    const recipientRoute = resolveRecipientRoute({
      defaultRecipients,
      locationId,
      overrides: locationOverrides
    });
    const locationSummary = await buildRunSummary({
      tenantId: accountRun.tenantId,
      reportRequestId: accountRun.reportRequestId!,
      scheduleName: accountRun.schedule.name,
      scope: "LOCATION",
      locationId,
      locationName: row.bucketLabel,
      windowStart: accountRun.windowStart,
      windowEnd: accountRun.windowEnd
    });
    const runKey = `${buildReportScheduleRunKey({
      scheduleId: accountRun.scheduleId,
      scheduledFor: accountRun.scheduledFor,
      windowStart: accountRun.windowStart,
      windowEnd: accountRun.windowEnd,
      scope: "LOCATION",
      scopeKey: row.bucketId
    })}:${accountRun.id}`;

    await upsertReportScheduleRunByRunKey(runKey, {
      create: {
        runKey,
        tenantId: accountRun.tenantId,
        scheduleId: accountRun.scheduleId,
        reportRequestId: accountRun.reportRequestId!,
        locationId,
        scope: "LOCATION",
        scopeKey: row.bucketId,
        windowStart: accountRun.windowStart,
        windowEnd: accountRun.windowEnd,
        scheduledFor: accountRun.scheduledFor,
        generationStatus: "READY",
        deliveryStatus: "PENDING",
        recipientEmailsJson: recipientRoute.recipientEmails,
        recipientContextJson: toJsonValue({
          routingMode: recipientRoute.routingMode,
          routingLabel: recipientRoute.routingLabel
        }),
        dashboardUrl: locationSummary.dashboardUrl,
        summaryJson: toJsonValue(locationSummary),
        generatedAt: new Date()
      },
      update: {
        reportRequestId: accountRun.reportRequestId!,
        locationId,
        generationStatus: "READY",
        deliveryStatus: "PENDING",
        recipientEmailsJson: recipientRoute.recipientEmails,
        recipientContextJson: toJsonValue({
          routingMode: recipientRoute.routingMode,
          routingLabel: recipientRoute.routingLabel
        }),
        dashboardUrl: locationSummary.dashboardUrl,
        summaryJson: toJsonValue(locationSummary),
        generatedAt: new Date(),
        errorSummary: null,
        errorJson: Prisma.JsonNull
      }
    });
  }
}

async function hydrateScheduledRun(runId: string, tenantId: string) {
  const run = await getReportScheduleRunById(runId, tenantId);

  if (!run.reportRequestId) {
    return run;
  }

  const report = await getReportDetail(tenantId, run.reportRequestId);
  const generationStatus = mapReportStatusToGenerationStatus(report.status);

  if (generationStatus === "FAILED") {
    await updateReportScheduleRun(run.id, {
      generationStatus: "FAILED",
      deliveryStatus: "FAILED",
      errorSummary: "Underlying Yelp report request failed.",
      errorJson: toJsonValue(report.errorJson ?? null)
    });

    return getReportScheduleRunById(run.id, tenantId);
  }

  if (generationStatus !== "READY") {
    await updateReportScheduleRun(run.id, {
      generationStatus
    });

    return getReportScheduleRunById(run.id, tenantId);
  }

  const summary = await buildRunSummary({
    tenantId,
    reportRequestId: run.reportRequestId,
    scheduleName: run.schedule.name,
    scope: run.scope,
    locationId: run.locationId,
    locationName: run.location?.name ?? null,
    windowStart: run.windowStart,
    windowEnd: run.windowEnd
  });
  const shouldFanOutLocations = shouldFanOutLocationDelivery(run.scope, run.schedule.deliveryScope, summary.locationBreakdown.length);
  const shouldDeliverAccount = shouldSendAccountDelivery(run.schedule.deliveryScope);
  const now = new Date();

  await updateReportScheduleRun(run.id, {
    generationStatus: "READY",
    generatedAt: now,
    dashboardUrl: summary.dashboardUrl,
    summaryJson: toJsonValue(summary),
    deliveryStatus: shouldDeliverAccount ? "PENDING" : "SKIPPED",
    errorSummary: shouldDeliverAccount
      ? null
      : shouldFanOutLocations
        ? "Location-scoped delivery enabled. Account rollup email skipped."
        : "Location-scoped delivery enabled, but no location rows were available to send.",
    errorJson: Prisma.JsonNull
  });
  await updateReportSchedule(run.scheduleId, tenantId, {
    lastSuccessfulGenerationAt: now
  });

  if (shouldFanOutLocations) {
    const accountRun = await getReportScheduleRunById(run.id, tenantId);
    await materializeLocationRunsForAccountRun(accountRun, summary);
  }

  return getReportScheduleRunById(run.id, tenantId);
}

export async function reconcileDueReportSchedules(limit = 10) {
  const schedules = await listEnabledReportSchedules(limit);
  const results = [];

  for (const schedule of schedules) {
    try {
      const window = getLatestScheduleWindow(schedule);
      const existingRuns = await listReportScheduleRunsForOccurrence({
        scheduleId: schedule.id,
        scheduledFor: window.scheduledFor,
        windowStart: window.windowStart,
        windowEnd: window.windowEnd
      });

      if (existingRuns.some((run) => run.scope === "ACCOUNT")) {
        results.push({
          scheduleId: schedule.id,
          status: "SKIPPED"
        });
        continue;
      }

      const run = await enqueueScheduleOccurrence({
        tenantId: schedule.tenantId,
        scheduleId: schedule.id
      });
      results.push({
        scheduleId: schedule.id,
        runId: run.id,
        status: run.generationStatus
      });
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      results.push({
        scheduleId: schedule.id,
        status: "FAILED",
        message: normalized.message
      });
    }
  }

  return results;
}

export async function reconcilePendingReportScheduleRuns(limit = 20) {
  const runs = await listPendingReportScheduleRuns(limit);
  const results = [];

  for (const run of runs) {
    try {
      if ((run.generationStatus === "REQUESTED" || run.generationStatus === "PROCESSING") && run.reportRequestId) {
        await pollReportWorkflow(run.tenantId, run.reportRequestId);
        await hydrateScheduledRun(run.id, run.tenantId);
      }

      const latest = await getReportScheduleRunById(run.id, run.tenantId);

      if (isReadyForDelivery(latest.generationStatus, latest.deliveryStatus)) {
        await resendReportScheduleRunWorkflow(latest.tenantId, null, latest.id);
      }

      if (latest.scope === "ACCOUNT" && latest.schedule.deliveryScope !== "ACCOUNT_ONLY") {
        const siblingRuns = await listReportScheduleRunsForOccurrence({
          scheduleId: latest.scheduleId,
          scheduledFor: latest.scheduledFor,
          windowStart: latest.windowStart,
          windowEnd: latest.windowEnd
        });

        for (const sibling of siblingRuns) {
          if (sibling.scope === "LOCATION" && isReadyForDelivery(sibling.generationStatus, sibling.deliveryStatus)) {
            await resendReportScheduleRunWorkflow(latest.tenantId, null, sibling.id);
          }
        }
      }

      results.push({
        runId: run.id,
        status: (await getReportScheduleRunById(run.id, run.tenantId)).deliveryStatus
      });
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      results.push({
        runId: run.id,
        status: "FAILED",
        message: normalized.message
      });
    }
  }

  return results;
}
