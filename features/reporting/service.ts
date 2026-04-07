import "server-only";

import Papa from "papaparse";

import { recordAuditEvent } from "@/features/audit/service";
import { buildBreakdownCsvRows, buildReportBreakdown } from "@/features/reporting/breakdowns";
import { buildCombinedReportPayload } from "@/features/reporting/payloads";
import {
  reportBreakdownFiltersSchema,
  type ReportBreakdownFiltersInput,
  reportRequestFormSchema,
  type ReportRequestFormValues
} from "@/features/reporting/schemas";
import { getBusinessById } from "@/lib/db/businesses-repository";
import { toJsonValue } from "@/lib/db/json";
import {
  getReportRequestById,
  listLeadsForReportBreakdown,
  listReportBreakdownOptions,
  listPendingReportRequests,
  listReportRequests,
  createReportRequest,
  updateReportRequest,
  upsertReportResult
} from "@/lib/db/reports-repository";
import { mapReportFormToDto } from "@/lib/yelp/mappers";
import { ensureYelpAccess, getCapabilityFlags } from "@/lib/yelp/runtime";
import { YelpReportingClient } from "@/lib/yelp/reporting-client";
import { normalizeUnknownError } from "@/lib/yelp/errors";
import { pollUntil } from "@/lib/utils/polling";

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function endOfDay(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}

function startOfDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function clampDate(value: string | undefined, minValue: string, maxValue: string) {
  if (!value) {
    return undefined;
  }

  if (value < minValue) {
    return minValue;
  }

  if (value > maxValue) {
    return maxValue;
  }

  return value;
}

function getRequestedBusinessIds(report: Awaited<ReturnType<typeof getReportRequestById>>) {
  const requestedIds = Array.isArray(report.requestedBusinessIdsJson)
    ? report.requestedBusinessIdsJson.filter((value): value is string => typeof value === "string")
    : [];

  if (requestedIds.length > 0) {
    return requestedIds;
  }

  return report.businessId ? [report.businessId] : [];
}

export async function getReportingIndex(tenantId: string) {
  return listReportRequests(tenantId);
}

export async function requestReportByValues(tenantId: string, actorId: string | null, values: ReportRequestFormValues) {
  const businesses = await Promise.all(values.businessIds.map((businessId) => getBusinessById(businessId, tenantId)));
  const encryptedIds = businesses.map((business) => business.encryptedYelpBusinessId);
  const payload = mapReportFormToDto(values, encryptedIds);

  const request = await createReportRequest(tenantId, {
    tenantId,
    businessId: values.businessIds.length === 1 ? values.businessIds[0] : null,
    createdById: actorId ?? null,
    granularity: values.granularity,
    status: "REQUESTED",
    startDate: new Date(values.startDate),
    endDate: new Date(values.endDate),
    requestedBusinessIdsJson: values.businessIds,
    filtersJson: {
      metrics: values.metrics
    }
  });

  try {
    const capabilities = await getCapabilityFlags(tenantId);

    if (capabilities.demoModeEnabled && !capabilities.reportingApiEnabled) {
      await updateReportRequest(request.id, { status: "READY" });

      await recordAuditEvent({
        tenantId,
        actorId: actorId ?? undefined,
        reportRequestId: request.id,
        actionType: "report.request",
        status: "SUCCESS",
        requestSummary: toJsonValue(payload),
        responseSummary: toJsonValue({ mode: "demo" })
      });

      return request;
    }

    const { credential } = await ensureYelpAccess({
      tenantId,
      capabilityKey: "reportingApiEnabled",
      credentialKind: "REPORTING_FUSION"
    });
    const client = new YelpReportingClient(credential);
    const response =
      values.granularity === "DAILY"
        ? await client.requestDailyReport(payload)
        : await client.requestMonthlyReport(payload);

    await updateReportRequest(request.id, {
      status: response.data.status,
      upstreamRequestId: response.data.report_id
    });

    await recordAuditEvent({
      tenantId,
      actorId: actorId ?? undefined,
      reportRequestId: request.id,
      actionType: "report.request",
      status: "SUCCESS",
      correlationId: response.correlationId,
      upstreamReference: response.data.report_id,
      requestSummary: toJsonValue(payload),
      responseSummary: toJsonValue(response.data)
    });

    return request;
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await updateReportRequest(request.id, {
      status: "FAILED",
      errorJson: normalized.details as never
    });

    await recordAuditEvent({
      tenantId,
      actorId: actorId ?? undefined,
      reportRequestId: request.id,
      actionType: "report.request",
      status: "FAILED",
      requestSummary: toJsonValue(payload),
      responseSummary: toJsonValue({ message: normalized.message })
    });

    throw normalized;
  }
}

export async function requestReportWorkflow(tenantId: string, actorId: string, input: unknown) {
  const values = reportRequestFormSchema.parse(input);
  return requestReportByValues(tenantId, actorId, values);
}

export async function pollReportWorkflow(tenantId: string, reportRequestId: string) {
  const report = await getReportRequestById(reportRequestId, tenantId);
  const capabilities = await getCapabilityFlags(tenantId);

  if (capabilities.demoModeEnabled && !capabilities.reportingApiEnabled) {
    return getReportRequestById(reportRequestId, tenantId);
  }

  if (!report.upstreamRequestId) {
    return report;
  }

  const { credential } = await ensureYelpAccess({
    tenantId,
    capabilityKey: "reportingApiEnabled",
    credentialKind: "REPORTING_FUSION"
  });
  const client = new YelpReportingClient(credential);

  const response = await pollUntil({
    attempts: 5,
    onExhausted: "return-last",
    getValue: async () => {
      const result =
        report.granularity === "DAILY"
          ? await client.getDailyReport(report.upstreamRequestId!)
          : await client.getMonthlyReport(report.upstreamRequestId!);

      await updateReportRequest(report.id, {
        status: result.data.status
      });

      if (result.data.status === "READY") {
        const businessIds = Array.isArray(report.requestedBusinessIdsJson)
          ? (report.requestedBusinessIdsJson.filter((value): value is string => typeof value === "string"))
          : [];
        await Promise.all(
          businessIds.map((businessId) =>
            upsertReportResult(`${report.id}:${businessId}:${report.granularity}`, {
              tenantId,
              reportRequestId: report.id,
              businessId,
              granularity: report.granularity,
              cacheKey: `${report.id}:${businessId}:${report.granularity}`,
              payloadJson: toJsonValue(result.data),
              metricsSummaryJson: toJsonValue(result.data.totals),
              rawStatus: result.data.status
            })
          )
        );
      }

      return result.data;
    },
    isComplete: (value) => value.status === "READY" || value.status === "FAILED"
  });

  return {
    ...(await getReportRequestById(reportRequestId, tenantId)),
    upstream: response
  };
}

export async function getReportDetail(tenantId: string, reportRequestId: string) {
  return getReportRequestById(reportRequestId, tenantId);
}

export async function getReportBreakdownView(
  tenantId: string,
  reportRequestId: string,
  rawFilters?: ReportBreakdownFiltersInput
) {
  const report = await getReportRequestById(reportRequestId, tenantId);
  const parsed = reportBreakdownFiltersSchema.parse(rawFilters ?? {});
  const windowStart = toDateInputValue(report.startDate);
  const windowEnd = toDateInputValue(report.endDate);
  const filters = {
    view: parsed.view ?? "location",
    from: clampDate(parsed.from, windowStart, windowEnd) ?? windowStart,
    to: clampDate(parsed.to, windowStart, windowEnd) ?? windowEnd,
    locationId: parsed.locationId,
    serviceCategoryId: parsed.serviceCategoryId
  } as const;
  const businessIds = getRequestedBusinessIds(report);
  const [options, leads] = await Promise.all([
    listReportBreakdownOptions(tenantId),
    listLeadsForReportBreakdown(tenantId, {
      businessIds,
      from: startOfDay(filters.from),
      to: endOfDay(filters.to)
    })
  ]);

  return {
    report,
    payload: buildCombinedReportPayload(report),
    filters,
    options,
    breakdown: buildReportBreakdown({
      view: filters.view,
      filters,
      leads,
      results: report.results,
      options
    })
  };
}

export function exportReportResultToCsv(report: Awaited<ReturnType<typeof getReportDetail>>) {
  const payload = buildCombinedReportPayload(report) as { rows?: Array<Record<string, unknown>> };

  return Papa.unparse(payload?.rows ?? []);
}

export function exportReportBreakdownToCsv(
  breakdownView: Awaited<ReturnType<typeof getReportBreakdownView>>
) {
  return Papa.unparse(buildBreakdownCsvRows(breakdownView.breakdown));
}

export async function reconcilePendingReports(limit = 10) {
  const reports = await listPendingReportRequests(limit);
  const results = [];

  for (const report of reports) {
    try {
      const reconciled = await pollReportWorkflow(report.tenantId, report.id);
      results.push({
        reportId: report.id,
        tenantId: report.tenantId,
        status: reconciled.status
      });
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      results.push({
        reportId: report.id,
        tenantId: report.tenantId,
        status: "FAILED",
        code: normalized.code,
        message: normalized.message
      });
    }
  }

  return results;
}
