import "server-only";

import type { SyncRunStatus } from "@prisma/client";

import { getLeadAutomationScopeConfig } from "@/features/autoresponder/config";
import { buildLeadAutomationHistory, buildLeadAutomationSummary } from "@/features/autoresponder/normalize";
import { processLeadAutoresponderForNewLead } from "@/features/autoresponder/service";
import { recordAuditEvent } from "@/features/audit/service";
import { buildLeadCrmSummary, getLeadConversionSummary } from "@/features/crm-enrichment/service";
import { getAiReplyAssistantState } from "@/features/leads/ai-reply-service";
import {
  buildLeadConversationActionTimeline,
  buildLeadListEntry,
  buildLeadTimeline,
  buildWebhookEventKey,
  type LeadListEntry,
  type ParsedLeadWebhookUpdate
} from "@/features/leads/normalize";
import { getLeadReplyComposerState } from "@/features/leads/messaging-service";
import { extractLeadIdsResponse, syncLeadSnapshotFromYelp } from "@/features/leads/yelp-sync";
import { leadBackfillSchema, leadFiltersSchema, type LeadFiltersInput } from "@/features/leads/schemas";
import { getBusinessById } from "@/lib/db/businesses-repository";
import {
  countLeadRecordsByBusiness,
  countLeadRecords,
  createLeadSyncError,
  createLeadSyncRun,
  createWebhookEventRecord,
  findLeadRecordByExternalLeadId,
  findBusinessesByExternalYelpBusinessId,
  findWebhookEventByKey,
  getLeadSyncRunById,
  getLeadRecordById,
  listLeadBackfillRuns,
  listFailedLeadWebhookEvents,
  listLeadBusinessOptions,
  listLeadWebhookSyncRunsForReconcile,
  listLeadRecords,
  updateLeadSyncRun,
  updateWebhookEventRecord,
  upsertLeadEventRecords,
  upsertLeadRecord
} from "@/lib/db/leads-repository";
import { toJsonValue } from "@/lib/db/json";
import { getDefaultTenant } from "@/lib/db/tenant";
import { listOpenOperatorIssuesForLead, listOpenOperatorIssuesForLeadIds } from "@/lib/db/issues-repository";
import { logError, logInfo } from "@/lib/utils/logging";
import { normalizeUnknownError, YelpApiError, YelpValidationError } from "@/lib/yelp/errors";
import { yelpLeadWebhookPayloadSchema } from "@/lib/yelp/schemas";
import { ensureYelpLeadsAccess, getCapabilityFlags } from "@/lib/yelp/runtime";
import { YelpLeadsClient } from "@/lib/yelp/leads-client";

export const YELP_LEAD_IMPORT_PAGE_SIZE = 20;
export const YELP_LEAD_IMPORT_MAX_LEADS_PER_RUN = 300;
export const YELP_LEAD_IMPORT_MAX_PAGES_PER_RUN = Math.ceil(
  YELP_LEAD_IMPORT_MAX_LEADS_PER_RUN / YELP_LEAD_IMPORT_PAGE_SIZE
);
export const YELP_LEAD_IMPORT_CONCURRENCY = 5;
export const DEFAULT_LEADS_PAGE_SIZE = 25;
export const LEADS_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

function normalizeHeaders(headers: Headers | Record<string, string>) {
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function resolveDeliveryId(headers: Record<string, string>) {
  return headers["x-yelp-delivery-id"] ?? headers["x-request-id"] ?? headers["x-correlation-id"] ?? null;
}

async function resolveTenantContext(externalBusinessId: string) {
  const [matches, defaultTenant] = await Promise.all([
    findBusinessesByExternalYelpBusinessId(externalBusinessId),
    getDefaultTenant()
  ]);
  const defaultMatch = matches.find((match) => match.tenantId === defaultTenant.id) ?? null;
  const business = defaultMatch ?? matches[0] ?? null;

  return {
    tenantId: business?.tenantId ?? defaultTenant.id,
    business
  };
}

function parseWebhookUpdate(raw: Record<string, unknown>) {
  const interactionTime = typeof raw.interaction_time === "string" ? new Date(raw.interaction_time) : null;

  return {
    eventType: String(raw.event_type),
    eventId: typeof raw.event_id === "string" ? raw.event_id : null,
    leadId: String(raw.lead_id),
    interactionTime: interactionTime && !Number.isNaN(interactionTime.getTime()) ? interactionTime : null,
    raw
  } satisfies ParsedLeadWebhookUpdate;
}

function endOfDay(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}

function isRetryable(error: YelpApiError) {
  return error.status >= 500 || error.status === 429;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getRetryCount(statsJson: unknown) {
  const record = asRecord(statsJson);
  return typeof record?.retryCount === "number" && Number.isFinite(record.retryCount)
    ? record.retryCount
    : 0;
}

function getProcessingStats(statsJson: unknown) {
  const record = asRecord(statsJson);
  return record ?? {};
}

function parseQueuedWebhookPayload(payloadJson: unknown) {
  const payload = asRecord(payloadJson);
  const delivery = asRecord(payload?.delivery);
  const update = asRecord(payload?.update);

  if (!delivery || !update) {
    throw new YelpValidationError("The saved Yelp webhook payload is incomplete.");
  }

  const validatedDelivery = yelpLeadWebhookPayloadSchema.safeParse(delivery);

  if (!validatedDelivery.success) {
    throw new YelpValidationError("The saved Yelp webhook payload can no longer be parsed.", {
      issues: validatedDelivery.error.issues
    });
  }

  return {
    delivery: validatedDelivery.data,
    update: parseWebhookUpdate(update)
  };
}

function parseBackfillRequest(payloadJson: unknown) {
  const payload = asRecord(payloadJson);
  const businessId = typeof payload?.businessId === "string" ? payload.businessId : null;

  if (!businessId) {
    throw new YelpValidationError("The saved lead backfill request is missing its business reference.");
  }

  return {
    businessId
  };
}

function shapeBackfillRunStats(params: {
  importedCount: number;
  updatedCount: number;
  failedCount: number;
  returnedLeadIds: number;
  hasMore: boolean;
  pagesFetched: number;
  processingMs?: number;
}) {
  return {
    importedCount: params.importedCount,
    updatedCount: params.updatedCount,
    failedCount: params.failedCount,
    returnedLeadIds: params.returnedLeadIds,
    hasMore: params.hasMore,
    pagesFetched: params.pagesFetched,
    pageSize: YELP_LEAD_IMPORT_PAGE_SIZE,
    pageLimit: YELP_LEAD_IMPORT_MAX_PAGES_PER_RUN,
    processingMs: params.processingMs
  };
}

function shapeLeadBackfillRunStatus(syncRun: Awaited<ReturnType<typeof getLeadSyncRunById>>) {
  const stats =
    typeof syncRun.statsJson === "object" && syncRun.statsJson !== null
      ? (syncRun.statsJson as {
          importedCount?: number;
          updatedCount?: number;
          failedCount?: number;
          returnedLeadIds?: number;
          hasMore?: boolean;
          pagesFetched?: number;
          pageSize?: number;
          pageLimit?: number;
          processingMs?: number;
        })
      : null;

  return {
    syncRunId: syncRun.id,
    status: syncRun.status,
    businessId: syncRun.businessId,
    businessName: syncRun.business?.name ?? "Unknown business",
    startedAt: syncRun.startedAt,
    finishedAt: syncRun.finishedAt,
    importedCount: stats?.importedCount ?? 0,
    updatedCount: stats?.updatedCount ?? 0,
    failedCount: stats?.failedCount ?? syncRun.errors.length,
    returnedLeadIds: stats?.returnedLeadIds ?? 0,
    hasMore: stats?.hasMore ?? false,
    pagesFetched: stats?.pagesFetched ?? 0,
    pageSize: stats?.pageSize ?? YELP_LEAD_IMPORT_PAGE_SIZE,
    pageLimit: stats?.pageLimit ?? YELP_LEAD_IMPORT_MAX_PAGES_PER_RUN,
    processingMs: stats?.processingMs ?? null,
    errorSummary: syncRun.errorSummary,
    progressLabel:
      syncRun.status === "QUEUED"
        ? "Queued"
        : syncRun.status === "PROCESSING"
          ? `Fetched ${stats?.pagesFetched ?? 0} Yelp page${(stats?.pagesFetched ?? 0) === 1 ? "" : "s"} and scanned ${stats?.returnedLeadIds ?? 0} lead IDs so far.`
          : syncRun.status === "COMPLETED"
            ? `Fetched ${stats?.pagesFetched ?? 0} Yelp page${(stats?.pagesFetched ?? 0) === 1 ? "" : "s"} and scanned ${stats?.returnedLeadIds ?? 0} lead IDs.`
            : syncRun.errorSummary ?? "Backfill did not finish cleanly."
  };
}

async function processLeadIdsBatch(params: {
  tenantId: string;
  syncRunId: string;
  business: {
    id: string;
    locationId: string | null;
    encryptedYelpBusinessId: string;
  };
  client: YelpLeadsClient;
  leadIds: string[];
}) {
  let importedCount = 0;
  let updatedCount = 0;
  let failedCount = 0;

  for (let index = 0; index < params.leadIds.length; index += YELP_LEAD_IMPORT_CONCURRENCY) {
    const chunk = params.leadIds.slice(index, index + YELP_LEAD_IMPORT_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (leadId) => {
        try {
          const result = await syncLeadSnapshotFromYelp({
            tenantId: params.tenantId,
            business: params.business,
            client: params.client,
            leadId,
            receivedAt: new Date(),
            sourceEventType: "BACKFILL_IMPORT",
            sourceEventId: null,
            sourceInteractionTime: null
          });

          return {
            existingLead: Boolean(result.existingLead),
            failed: false
          } as const;
        } catch (error) {
          const normalized = normalizeUnknownError(error);

          await createLeadSyncError({
            tenantId: params.tenantId,
            syncRunId: params.syncRunId,
            category: "LEAD_BACKFILL_PROCESSING",
            code: normalized.code,
            message: `${leadId}: ${normalized.message}`,
            isRetryable: normalized instanceof YelpApiError ? isRetryable(normalized) : false,
            detailsJson: normalized.details ?? null
          });

          return {
            existingLead: false,
            failed: true
          } as const;
        }
      })
    );

    for (const result of results) {
      if (result.failed) {
        failedCount += 1;
      } else if (result.existingLead) {
        updatedCount += 1;
      } else {
        importedCount += 1;
      }
    }
  }

  return {
    importedCount,
    updatedCount,
    failedCount
  };
}

async function processQueuedYelpLeadWebhookSyncRun(tenantId: string, syncRunId: string) {
  const syncRun = await getLeadSyncRunById(tenantId, syncRunId);

  if (syncRun.type !== "YELP_LEADS_WEBHOOK") {
    throw new YelpValidationError("Only Yelp webhook sync runs can be reprocessed from raw deliveries.");
  }

  const webhookEvent = syncRun.webhookEvents[0] ?? null;

  if (!webhookEvent) {
    throw new YelpValidationError("Queued Yelp lead sync run is missing its raw webhook delivery.");
  }

  const { delivery, update } = parseQueuedWebhookPayload(webhookEvent.payloadJson);
  const externalBusinessId = delivery.data.id;
  const receivedAt = webhookEvent.receivedAt ?? syncRun.startedAt;
  const tenantContext = await resolveTenantContext(externalBusinessId);
  const processingStartedAt = Date.now();
  const existingStats = getProcessingStats(syncRun.statsJson);
  const retryCount = getRetryCount(syncRun.statsJson);

  await updateLeadSyncRun(syncRun.id, {
    status: "PROCESSING",
    businessId: tenantContext.business?.id ?? syncRun.businessId ?? null,
    errorSummary: null,
    statsJson: {
      ...existingStats,
      retryCount
    }
  });
  await updateWebhookEventRecord(webhookEvent.id, {
    status: "PROCESSING",
    processedAt: null,
    errorJson: null
  });

  logInfo("leads.webhook.processing_started", {
    tenantId: tenantContext.tenantId,
    syncRunId: syncRun.id,
    eventKey: webhookEvent.eventKey,
    businessId: externalBusinessId,
    leadId: update.leadId,
    retryCount
  });

  try {
    const { credential } = await ensureYelpLeadsAccess(tenantContext.tenantId);
    const client = new YelpLeadsClient(credential);

    if (!tenantContext.business) {
      throw new YelpValidationError("The Yelp business is not saved in this console yet.");
    }

    const { existingLead, lead, normalizedEventCount } = await syncLeadSnapshotFromYelp({
      tenantId: tenantContext.tenantId,
      business: {
        id: tenantContext.business.id,
        locationId: tenantContext.business.locationId ?? null,
        encryptedYelpBusinessId: externalBusinessId
      },
      client,
      leadId: update.leadId,
      receivedAt,
      sourceEventType: update.eventType,
      sourceEventId: update.eventId ?? null,
      sourceInteractionTime: update.interactionTime ?? null
    });
    const finishedAt = new Date();

    try {
      await processLeadAutoresponderForNewLead(tenantContext.tenantId, lead.id);
    } catch (automationError) {
      const normalizedAutomationError = normalizeUnknownError(automationError);

      await recordAuditEvent({
        tenantId: tenantContext.tenantId,
        businessId: lead.businessId ?? tenantContext.business?.id ?? undefined,
        actionType: "lead.autoresponder.first-response",
        status: "FAILED",
        correlationId: `lead-autoresponder:${lead.id}`,
        upstreamReference: lead.externalLeadId,
        responseSummary: {
          message: normalizedAutomationError.message
        }
      });

      logError("lead.autoresponder.trigger_failed", {
        tenantId: tenantContext.tenantId,
        leadId: lead.id,
        message: normalizedAutomationError.message
      });
    }

    await updateWebhookEventRecord(webhookEvent.id, {
      leadId: lead.id,
      status: "COMPLETED",
      processedAt: finishedAt,
      errorJson: null
    });
    await updateLeadSyncRun(syncRun.id, {
      status: "COMPLETED",
      businessId: lead.businessId ?? tenantContext.business?.id ?? null,
      leadId: lead.id,
      finishedAt,
      lastSuccessfulSyncAt: finishedAt,
      statsJson: {
        ...existingStats,
        retryCount,
        normalizedEventCount,
        processingMs: Date.now() - processingStartedAt
      },
      responseJson: {
        leadId: update.leadId,
        localLeadId: lead.id,
        normalizedEventCount
      },
      errorSummary: null
    });
    await recordAuditEvent({
      tenantId: tenantContext.tenantId,
      businessId: lead.businessId ?? tenantContext.business?.id ?? undefined,
      actionType: "lead.webhook.process",
      status: "SUCCESS",
      correlationId: webhookEvent.eventKey,
      upstreamReference: update.leadId,
      requestSummary: {
        eventType: update.eventType,
        eventId: update.eventId ?? null,
        yelpBusinessId: externalBusinessId
      },
      responseSummary: {
        localLeadId: lead.id,
        normalizedEventCount
      },
      rawPayloadSummary: toJsonValue(update.raw)
    });

    logInfo("leads.webhook.processed", {
      tenantId: tenantContext.tenantId,
      syncRunId: syncRun.id,
      eventKey: webhookEvent.eventKey,
      localLeadId: lead.id,
      normalizedEventCount,
      processingMs: Date.now() - processingStartedAt
    });

    return {
      syncRunId: syncRun.id,
      eventKey: webhookEvent.eventKey,
      leadId: update.leadId,
      localLeadId: lead.id,
      status: "COMPLETED" as const
    };
  } catch (error) {
    const normalizedError = normalizeUnknownError(error);
    const finishedAt = new Date();

    await updateWebhookEventRecord(webhookEvent.id, {
      status: "FAILED",
      processedAt: finishedAt,
      errorJson: {
        message: normalizedError.message,
        code: normalizedError.code,
        details: normalizedError.details ?? null
      }
    });
    await updateLeadSyncRun(syncRun.id, {
      status: "FAILED",
      finishedAt,
      responseJson: {
        leadId: update.leadId
      },
      statsJson: {
        ...existingStats,
        retryCount,
        processingMs: Date.now() - processingStartedAt
      },
      errorSummary: normalizedError.message
    });
    await createLeadSyncError({
      tenantId: tenantContext.tenantId,
      syncRunId: syncRun.id,
      category: "LEAD_WEBHOOK_PROCESSING",
      code: normalizedError.code,
      message: normalizedError.message,
      isRetryable: normalizedError instanceof YelpApiError ? isRetryable(normalizedError) : false,
      detailsJson: normalizedError.details ?? null
    });
    await recordAuditEvent({
      tenantId: tenantContext.tenantId,
      businessId: tenantContext.business?.id ?? undefined,
      actionType: "lead.webhook.process",
      status: "FAILED",
      correlationId: webhookEvent.eventKey,
      upstreamReference: update.leadId,
      requestSummary: {
        eventType: update.eventType,
        eventId: update.eventId ?? null,
        yelpBusinessId: externalBusinessId
      },
      responseSummary: {
        code: normalizedError.code,
        message: normalizedError.message
      },
      rawPayloadSummary: toJsonValue(update.raw)
    });

    logError("leads.webhook.failed", {
      tenantId: tenantContext.tenantId,
      syncRunId: syncRun.id,
      eventKey: webhookEvent.eventKey,
      code: normalizedError.code,
      message: normalizedError.message,
      processingMs: Date.now() - processingStartedAt
    });

    throw normalizedError;
  }
}

export async function retryLeadSyncRunWorkflow(tenantId: string, actorId: string, syncRunId: string) {
  const syncRun = await getLeadSyncRunById(tenantId, syncRunId);

  if (syncRun.type === "YELP_LEADS_WEBHOOK") {
    const webhookEvent = syncRun.webhookEvents[0] ?? null;

    if (!webhookEvent) {
      throw new YelpValidationError("This lead intake issue has no raw Yelp webhook payload to replay.");
    }

    await updateLeadSyncRun(syncRun.id, {
      status: "QUEUED",
      finishedAt: null,
      errorSummary: null
    });
    await updateWebhookEventRecord(webhookEvent.id, {
      status: "QUEUED",
      processedAt: null,
      errorJson: null
    });

    const result = await processQueuedYelpLeadWebhookSyncRun(tenantId, syncRun.id);

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: syncRun.businessId ?? undefined,
      actionType: "lead.webhook.retry",
      status: "SUCCESS",
      correlationId: syncRun.id,
      upstreamReference: syncRun.lead?.externalLeadId ?? webhookEvent.eventKey,
      requestSummary: toJsonValue({
        syncRunId: syncRun.id,
        type: syncRun.type
      }),
      responseSummary: toJsonValue(result)
    });

    return result;
  }

  if (syncRun.type === "YELP_LEADS_BACKFILL") {
    const { businessId } = parseBackfillRequest(syncRun.requestJson);
    return syncBusinessLeadsWorkflow(tenantId, actorId, businessId);
  }

  throw new YelpValidationError("Retry is not available for this lead sync run.");
}

export async function ingestYelpLeadWebhook(payload: unknown, headers: Headers | Record<string, string>) {
  const parsed = yelpLeadWebhookPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    throw new YelpValidationError("The Yelp webhook payload is invalid.", {
      issues: parsed.error.issues
    });
  }

  if (parsed.data.data.updates.length === 0) {
    throw new YelpValidationError("The Yelp webhook contained no updates to process.");
  }

  const normalizedHeaders = normalizeHeaders(headers);
  const tenantContext = await resolveTenantContext(parsed.data.data.id);
  const results: Array<{
    eventKey: string;
    deliveryStatus: SyncRunStatus | "DUPLICATE";
    leadId?: string;
    localLeadId?: string;
    message?: string;
  }> = [];

  for (const [index, rawUpdate] of parsed.data.data.updates.entries()) {
    const update = parseWebhookUpdate(rawUpdate);
    const eventKey = buildWebhookEventKey(parsed.data.data.id, update, index);
    const existingWebhook = await findWebhookEventByKey(tenantContext.tenantId, eventKey);

    if (existingWebhook && !["FAILED", "PARTIAL", "SKIPPED"].includes(existingWebhook.status)) {
      results.push({
        eventKey,
        deliveryStatus: "DUPLICATE",
        leadId: update.leadId,
        localLeadId: existingWebhook.leadId ?? undefined,
        message: "Duplicate delivery ignored."
      });
      continue;
    }

    const syncRun = await createLeadSyncRun({
      tenantId: tenantContext.tenantId,
      businessId: tenantContext.business?.id ?? null,
      leadId: existingWebhook?.leadId ?? null,
      type: "YELP_LEADS_WEBHOOK",
      status: "QUEUED",
      capabilityKey: "hasLeadsApi",
      correlationId: eventKey,
      requestJson: {
        topic: "leads_event",
        eventKey,
        businessId: parsed.data.data.id,
        leadId: update.leadId,
        eventType: update.eventType
      }
    });
    const webhookEvent = existingWebhook
      ? await updateWebhookEventRecord(existingWebhook.id, {
          syncRunId: syncRun.id,
          leadId: existingWebhook.leadId ?? null,
          deliveryId: resolveDeliveryId(normalizedHeaders),
          status: "QUEUED",
          processedAt: null,
          headersJson: normalizedHeaders,
          payloadJson: {
            delivery: parsed.data,
            update: rawUpdate
          },
          errorJson: null
        })
      : await createWebhookEventRecord({
          tenantId: tenantContext.tenantId,
          syncRunId: syncRun.id,
          eventKey,
          deliveryId: resolveDeliveryId(normalizedHeaders),
          topic: "leads_event",
          status: "QUEUED",
          headersJson: normalizedHeaders,
          payloadJson: {
            delivery: parsed.data,
            update: rawUpdate
          }
        });

    logInfo("leads.webhook.enqueued", {
      tenantId: tenantContext.tenantId,
      syncRunId: syncRun.id,
      eventKey,
      businessId: parsed.data.data.id,
      leadId: update.leadId,
      eventType: update.eventType
    });
    results.push({
      eventKey,
      deliveryStatus: webhookEvent.status,
      leadId: update.leadId,
      localLeadId: webhookEvent.leadId ?? undefined,
      message: existingWebhook ? "Webhook delivery re-queued after a prior failure." : "Webhook delivery queued for Yelp lead refresh."
    });
  }

  return {
    tenantId: tenantContext.tenantId,
    externalBusinessId: parsed.data.data.id,
    results
  };
}

export async function reconcilePendingLeadWebhooks(limit = 20) {
  const candidates = await listLeadWebhookSyncRunsForReconcile(limit * 2);
  const results = [];

  for (const syncRun of candidates) {
    const retryCount = getRetryCount(syncRun.statsJson);
    const latestError = syncRun.errors[0] ?? null;

    if (syncRun.status === "FAILED") {
      if (!latestError?.isRetryable || retryCount >= 2) {
        continue;
      }
    }

    try {
      if (syncRun.status === "FAILED") {
        await updateLeadSyncRun(syncRun.id, {
          status: "QUEUED",
          statsJson: {
            ...getProcessingStats(syncRun.statsJson),
            retryCount: retryCount + 1
          }
        });
      }

      const processed = await processQueuedYelpLeadWebhookSyncRun(syncRun.tenantId, syncRun.id);
      results.push(processed);
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      results.push({
        syncRunId: syncRun.id,
        status: "FAILED",
        code: normalized.code,
        message: normalized.message
      });
    }

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

export async function createLeadBackfillRunWorkflow(tenantId: string, actorId: string, input: unknown) {
  const values = leadBackfillSchema.parse(input);
  const business = await getBusinessById(values.businessId, tenantId);

  if (!business.encryptedYelpBusinessId) {
    throw new YelpValidationError("This business is missing a Yelp business ID.");
  }

  const startedAt = new Date();
  const syncRun = await createLeadSyncRun({
    tenantId,
    businessId: business.id,
    type: "YELP_LEADS_BACKFILL",
    status: "QUEUED",
    capabilityKey: "hasLeadsApi",
    correlationId: `lead-backfill:${business.id}:${startedAt.toISOString()}`,
    requestJson: {
      businessId: business.id,
      yelpBusinessId: business.encryptedYelpBusinessId,
      limit: YELP_LEAD_IMPORT_PAGE_SIZE,
      pageLimit: YELP_LEAD_IMPORT_MAX_PAGES_PER_RUN
    }
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: business.id,
    actionType: "lead.backfill.enqueue",
    status: "SUCCESS",
    correlationId: syncRun.id,
    upstreamReference: business.encryptedYelpBusinessId,
    requestSummary: {
      businessId: business.id,
      yelpBusinessId: business.encryptedYelpBusinessId,
      limit: YELP_LEAD_IMPORT_PAGE_SIZE,
      pageLimit: YELP_LEAD_IMPORT_MAX_PAGES_PER_RUN
    }
  });

  return {
    syncRunId: syncRun.id,
    businessId: business.id,
    businessName: business.name
  };
}

export async function getLeadBackfillRunStatusWorkflow(tenantId: string, syncRunId: string) {
  const syncRun = await getLeadSyncRunById(tenantId, syncRunId);

  if (syncRun.type !== "YELP_LEADS_BACKFILL") {
    throw new YelpValidationError("This sync run is not a lead backfill.");
  }

  return shapeLeadBackfillRunStatus(syncRun);
}

export async function processLeadBackfillRunWorkflow(tenantId: string, actorId: string, syncRunId: string) {
  const syncRun = await getLeadSyncRunById(tenantId, syncRunId);

  if (syncRun.type !== "YELP_LEADS_BACKFILL") {
    throw new YelpValidationError("Only Yelp lead backfill runs can be processed here.");
  }

  if (syncRun.status === "PROCESSING" || syncRun.status === "COMPLETED") {
    return shapeLeadBackfillRunStatus(syncRun);
  }

  const { businessId } = parseBackfillRequest(syncRun.requestJson);
  const business = await getBusinessById(businessId, tenantId);

  if (!business.encryptedYelpBusinessId) {
    throw new YelpValidationError("This business is missing a Yelp business ID.");
  }

  const { credential } = await ensureYelpLeadsAccess(tenantId);
  const client = new YelpLeadsClient(credential);
  const importStartedAt = Date.now();

  await updateLeadSyncRun(syncRun.id, {
    status: "PROCESSING",
    businessId: business.id,
    finishedAt: null,
    lastSuccessfulSyncAt: null,
    errorSummary: null,
    statsJson: shapeBackfillRunStats({
      importedCount: 0,
      updatedCount: 0,
      failedCount: 0,
      returnedLeadIds: 0,
      hasMore: false,
      pagesFetched: 0
    }),
    responseJson: {
      businessId: business.id,
      yelpBusinessId: business.encryptedYelpBusinessId
    }
  });

  try {
    let importedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    let returnedLeadIds = 0;
    let hasMore = false;
    let pagesFetched = 0;
    let offset = 0;
    let requestFailure: ReturnType<typeof normalizeUnknownError> | null = null;

    while (pagesFetched < YELP_LEAD_IMPORT_MAX_PAGES_PER_RUN) {
      let leadIds: string[] = [];

      try {
        const leadIdsResponse = await client.getBusinessLeadIds(business.encryptedYelpBusinessId, {
          limit: YELP_LEAD_IMPORT_PAGE_SIZE,
          offset
        });
        const extracted = extractLeadIdsResponse(leadIdsResponse.data);
        leadIds = extracted.leadIds;
        hasMore = extracted.hasMore;
      } catch (error) {
        requestFailure = normalizeUnknownError(error);

        await createLeadSyncError({
          tenantId,
          syncRunId: syncRun.id,
          category: "LEAD_BACKFILL_REQUEST",
          code: requestFailure.code,
          message: `Page ${pagesFetched + 1} (offset ${offset}): ${requestFailure.message}`,
          isRetryable: error instanceof YelpApiError ? isRetryable(error) : false,
          detailsJson: requestFailure.details ?? null
        });
        break;
      }

      pagesFetched += 1;
      returnedLeadIds += leadIds.length;

      const pageResults = await processLeadIdsBatch({
        tenantId,
        syncRunId: syncRun.id,
        business: {
          id: business.id,
          locationId: business.locationId ?? null,
          encryptedYelpBusinessId: business.encryptedYelpBusinessId
        },
        client,
        leadIds
      });

      importedCount += pageResults.importedCount;
      updatedCount += pageResults.updatedCount;
      failedCount += pageResults.failedCount;

      await updateLeadSyncRun(syncRun.id, {
        status: "PROCESSING",
        businessId: business.id,
        statsJson: shapeBackfillRunStats({
          importedCount,
          updatedCount,
          failedCount,
          returnedLeadIds,
          hasMore,
          pagesFetched,
          processingMs: Date.now() - importStartedAt
        }),
        responseJson: {
          businessId: business.id,
          yelpBusinessId: business.encryptedYelpBusinessId,
          returnedLeadIds,
          hasMore,
          pagesFetched
        }
      });

      if (!hasMore || leadIds.length === 0) {
        break;
      }

      offset += leadIds.length;
    }

    const finishedAt = new Date();
    const finalStatus: SyncRunStatus =
      requestFailure
        ? importedCount > 0 || updatedCount > 0 || failedCount > 0
          ? "PARTIAL"
          : "FAILED"
        : failedCount === 0
          ? "COMPLETED"
          : importedCount > 0 || updatedCount > 0
            ? "PARTIAL"
            : "FAILED";

    await updateLeadSyncRun(syncRun.id, {
      status: finalStatus,
      finishedAt,
      lastSuccessfulSyncAt: finalStatus === "FAILED" ? null : finishedAt,
      statsJson: shapeBackfillRunStats({
        importedCount,
        updatedCount,
        failedCount,
        returnedLeadIds,
        hasMore,
        pagesFetched,
        processingMs: Date.now() - importStartedAt
      }),
      responseJson: {
        businessId: business.id,
        yelpBusinessId: business.encryptedYelpBusinessId,
        returnedLeadIds,
        hasMore,
        pagesFetched
      },
      errorSummary:
        finalStatus === "FAILED"
          ? requestFailure?.message ?? "Lead import failed for every returned Yelp lead ID."
          : requestFailure
            ? `Imported ${pagesFetched} Yelp page${pagesFetched === 1 ? "" : "s"} before a later page failed.`
            : failedCount > 0
              ? `${failedCount} Yelp lead imports failed.`
              : null
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: business.id,
      actionType: "lead.backfill.sync",
      status: finalStatus === "FAILED" ? "FAILED" : "SUCCESS",
      correlationId: syncRun.id,
      upstreamReference: business.encryptedYelpBusinessId,
      requestSummary: {
        businessId: business.id,
        yelpBusinessId: business.encryptedYelpBusinessId,
        limit: YELP_LEAD_IMPORT_PAGE_SIZE,
        pageLimit: YELP_LEAD_IMPORT_MAX_PAGES_PER_RUN
      },
      responseSummary: {
        importedCount,
        updatedCount,
        failedCount,
        returnedLeadIds,
        hasMore,
        pagesFetched,
        status: finalStatus
      }
    });

    logInfo("leads.backfill.completed", {
      tenantId,
      businessId: business.id,
      yelpBusinessId: business.encryptedYelpBusinessId,
      returnedLeadIds,
      importedCount,
      updatedCount,
      failedCount,
      hasMore,
      pagesFetched,
      processingMs: Date.now() - importStartedAt
    });

    return shapeLeadBackfillRunStatus(await getLeadSyncRunById(tenantId, syncRun.id));
  } catch (error) {
    const finishedAt = new Date();
    const normalized = normalizeUnknownError(error);

    await createLeadSyncError({
      tenantId,
      syncRunId: syncRun.id,
      category: "LEAD_BACKFILL_REQUEST",
      code: normalized.code,
      message: normalized.message,
      isRetryable: normalized instanceof YelpApiError ? isRetryable(normalized) : false,
      detailsJson: normalized.details ?? null
    });
    await updateLeadSyncRun(syncRun.id, {
      status: "FAILED",
      finishedAt,
      errorSummary: normalized.message,
      responseJson: {
        businessId: business.id,
        yelpBusinessId: business.encryptedYelpBusinessId
      }
    });
    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: business.id,
      actionType: "lead.backfill.sync",
      status: "FAILED",
      correlationId: syncRun.id,
      upstreamReference: business.encryptedYelpBusinessId,
      requestSummary: {
        businessId: business.id,
        yelpBusinessId: business.encryptedYelpBusinessId,
        limit: YELP_LEAD_IMPORT_PAGE_SIZE,
        pageLimit: YELP_LEAD_IMPORT_MAX_PAGES_PER_RUN
      },
      responseSummary: {
        message: normalized.message,
        code: normalized.code
      }
    });

    logError("leads.backfill.failed", {
      tenantId,
      businessId: business.id,
      yelpBusinessId: business.encryptedYelpBusinessId,
      code: normalized.code,
      message: normalized.message,
      processingMs: Date.now() - importStartedAt
    });
    throw error;
  }
}

export async function syncBusinessLeadsWorkflow(tenantId: string, actorId: string, input: unknown) {
  const run = await createLeadBackfillRunWorkflow(tenantId, actorId, input);
  return processLeadBackfillRunWorkflow(tenantId, actorId, run.syncRunId);
}

export async function getLeadsIndex(tenantId: string, rawFilters?: LeadFiltersInput) {
  const filters = leadFiltersSchema.parse(rawFilters ?? {});
  const paginationFilters = {
    businessId: filters.businessId,
    mappingState: filters.mappingState,
    internalStatus: filters.internalStatus,
    from: filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : undefined,
    to: filters.to ? endOfDay(filters.to) : undefined
  };
  const requestedPageSize = filters.pageSize ?? DEFAULT_LEADS_PAGE_SIZE;
  const requestedPage = filters.page ?? 1;
  const [capabilities, businesses, failedDeliveries, conversionMetrics, backfillRuns, totalSyncedLeads] = await Promise.all([
    getCapabilityFlags(tenantId),
    listLeadBusinessOptions(tenantId),
    listFailedLeadWebhookEvents(tenantId, 6),
    getLeadConversionSummary(tenantId),
    listLeadBackfillRuns(tenantId, 5),
    countLeadRecords(tenantId)
  ]);
  const businessSplitCounts = await countLeadRecordsByBusiness(tenantId, {
    mappingState: filters.mappingState,
    internalStatus: filters.internalStatus,
    from: paginationFilters.from,
    to: paginationFilters.to
  });
  let businessSplitMap = new Map(
    businessSplitCounts
      .filter((entry) => entry.businessId)
      .map((entry) => [entry.businessId as string, entry._count._all])
  );
  let filteredLeads = 0;
  let rows: LeadListEntry[] = [];

  if (filters.status) {
    const allLeads = await listLeadRecords(tenantId, paginationFilters);
    const matchingRows = allLeads
      .map((lead) => buildLeadListEntry(lead))
      .filter((lead) => lead.processingStatus === filters.status);
    businessSplitMap = new Map<string, number>();

    for (const row of matchingRows) {
      const businessId = row.mappedBusinessId;

      if (!businessId) {
        continue;
      }

      businessSplitMap.set(businessId, (businessSplitMap.get(businessId) ?? 0) + 1);
    }
    filteredLeads = matchingRows.length;

    const totalPages = filteredLeads === 0 ? 1 : Math.ceil(filteredLeads / requestedPageSize);
    const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
    const pagedRows = matchingRows.slice(
      (currentPage - 1) * requestedPageSize,
      (currentPage - 1) * requestedPageSize + requestedPageSize
    );
    const visibleLeadIds = pagedRows.map((row) => row.id);
    const leadIssues = await listOpenOperatorIssuesForLeadIds(tenantId, visibleLeadIds);
    const issuesByLeadId = new Map<string, typeof leadIssues>();

    for (const issue of leadIssues) {
      const key = issue.leadId;

      if (!key) {
        continue;
      }

      const current = issuesByLeadId.get(key) ?? [];
      current.push(issue);
      issuesByLeadId.set(key, current);
    }

    rows = pagedRows.map((row) => {
      const openIssues = issuesByLeadId.get(row.id) ?? [];
      const primaryIssue = openIssues[0] ?? null;
      const combinedReasons = [...new Set([...(primaryIssue ? [primaryIssue.summary] : []), ...row.attentionReasons])];

      return {
        ...row,
        openIssueCount: openIssues.length,
        primaryIssue: primaryIssue
          ? {
              id: primaryIssue.id,
              issueType: primaryIssue.issueType,
              severity: primaryIssue.severity,
              summary: primaryIssue.summary
            }
          : null,
        requiresAttention: row.requiresAttention || openIssues.length > 0,
        attentionReasons: combinedReasons
      };
    });

    const latestBackfill = backfillRuns[0] ?? null;
    const latestBackfillStats =
      typeof latestBackfill?.statsJson === "object" && latestBackfill?.statsJson !== null
        ? (latestBackfill.statsJson as {
            importedCount?: number;
            updatedCount?: number;
            failedCount?: number;
            returnedLeadIds?: number;
            hasMore?: boolean;
            pagesFetched?: number;
            pageSize?: number;
            pageLimit?: number;
          })
        : null;

    return {
      capabilityEnabled: capabilities.hasLeadsApi,
      filters,
      businesses,
      businessSplit: businesses.map((business) => ({
        id: business.id,
        name: business.name,
        count: businessSplitMap.get(business.id) ?? 0,
        isSelected: business.id === filters.businessId
      })),
      summary: {
        totalSyncedLeads,
        filteredLeads,
        visibleRows: rows.length,
        mappedLeads: rows.filter((lead) => lead.mappingState === "MATCHED" || lead.mappingState === "MANUAL_OVERRIDE").length,
        unresolvedLeads: rows.filter((lead) => lead.mappingState === "UNRESOLVED").length,
        needsAttention: rows.filter((lead) => lead.requiresAttention).length,
        crmIssues: rows.filter((lead) => ["FAILED", "CONFLICT", "ERROR", "STALE"].includes(lead.crmHealthStatus)).length,
        failedDeliveries: failedDeliveries.length
      },
      conversionMetrics,
      leads: rows,
      failedDeliveries,
      backfill: {
        latestRun:
          latestBackfill
            ? {
                id: latestBackfill.id,
                status: latestBackfill.status,
                businessId: latestBackfill.businessId,
                businessName: latestBackfill.business?.name ?? "Unknown business",
                startedAt: latestBackfill.startedAt,
                finishedAt: latestBackfill.finishedAt,
                importedCount: latestBackfillStats?.importedCount ?? 0,
                updatedCount: latestBackfillStats?.updatedCount ?? 0,
                failedCount: latestBackfillStats?.failedCount ?? latestBackfill.errors.length,
                returnedLeadIds: latestBackfillStats?.returnedLeadIds ?? 0,
                hasMore: latestBackfillStats?.hasMore ?? false,
                pagesFetched: latestBackfillStats?.pagesFetched ?? 1,
                pageSize: latestBackfillStats?.pageSize ?? YELP_LEAD_IMPORT_PAGE_SIZE,
                pageLimit: latestBackfillStats?.pageLimit ?? YELP_LEAD_IMPORT_MAX_PAGES_PER_RUN,
                errorSummary: latestBackfill.errorSummary
              }
            : null
      },
      pagination: {
        currentPage,
        pageSize: requestedPageSize,
        totalPages,
        visibleRows: rows.length,
        hasPreviousPage: currentPage > 1,
        hasNextPage: currentPage < totalPages,
        pageSizeOptions: [...LEADS_PAGE_SIZE_OPTIONS],
        pageRowStart: filteredLeads === 0 ? 0 : (currentPage - 1) * requestedPageSize + 1,
        pageRowEnd: filteredLeads === 0 ? 0 : (currentPage - 1) * requestedPageSize + rows.length
      }
    };
  }

  filteredLeads = await countLeadRecords(tenantId, paginationFilters);
  const totalPages = filteredLeads === 0 ? 1 : Math.ceil(filteredLeads / requestedPageSize);
  const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
  const leads = await listLeadRecords(tenantId, {
    ...paginationFilters,
    skip: (currentPage - 1) * requestedPageSize,
    take: requestedPageSize
  });
  const leadIssues = await listOpenOperatorIssuesForLeadIds(
    tenantId,
    leads.map((lead) => lead.id)
  );
  const issuesByLeadId = new Map<string, typeof leadIssues>();

  for (const issue of leadIssues) {
    const key = issue.leadId;

    if (!key) {
      continue;
    }

    const current = issuesByLeadId.get(key) ?? [];
    current.push(issue);
    issuesByLeadId.set(key, current);
  }

  rows = leads.map((lead) => {
    const row = buildLeadListEntry(lead);
    const openIssues = issuesByLeadId.get(lead.id) ?? [];
    const primaryIssue = openIssues[0] ?? null;
    const combinedReasons = [...new Set([...(primaryIssue ? [primaryIssue.summary] : []), ...row.attentionReasons])];

    return {
      ...row,
      openIssueCount: openIssues.length,
      primaryIssue: primaryIssue
        ? {
            id: primaryIssue.id,
            issueType: primaryIssue.issueType,
            severity: primaryIssue.severity,
            summary: primaryIssue.summary
          }
        : null,
      requiresAttention: row.requiresAttention || openIssues.length > 0,
      attentionReasons: combinedReasons
    };
  });

  const latestBackfill = backfillRuns[0] ?? null;
  const latestBackfillStats =
    typeof latestBackfill?.statsJson === "object" && latestBackfill?.statsJson !== null
      ? (latestBackfill.statsJson as {
          importedCount?: number;
          updatedCount?: number;
          failedCount?: number;
          returnedLeadIds?: number;
          hasMore?: boolean;
          pagesFetched?: number;
          pageSize?: number;
          pageLimit?: number;
        })
      : null;

  return {
    capabilityEnabled: capabilities.hasLeadsApi,
    filters,
    businesses,
    businessSplit: businesses.map((business) => ({
      id: business.id,
      name: business.name,
      count: businessSplitMap.get(business.id) ?? 0,
      isSelected: business.id === filters.businessId
    })),
    summary: {
      totalSyncedLeads,
      filteredLeads,
      visibleRows: rows.length,
      mappedLeads: rows.filter((lead) => lead.mappingState === "MATCHED" || lead.mappingState === "MANUAL_OVERRIDE").length,
      unresolvedLeads: rows.filter((lead) => lead.mappingState === "UNRESOLVED").length,
      needsAttention: rows.filter((lead) => lead.requiresAttention).length,
      crmIssues: rows.filter((lead) => ["FAILED", "CONFLICT", "ERROR", "STALE"].includes(lead.crmHealthStatus)).length,
      failedDeliveries: failedDeliveries.length
    },
    conversionMetrics,
    leads: rows,
    failedDeliveries,
    backfill: {
      latestRun:
        latestBackfill
          ? {
              id: latestBackfill.id,
              status: latestBackfill.status,
              businessId: latestBackfill.businessId,
              businessName: latestBackfill.business?.name ?? "Unknown business",
              startedAt: latestBackfill.startedAt,
              finishedAt: latestBackfill.finishedAt,
              importedCount: latestBackfillStats?.importedCount ?? 0,
              updatedCount: latestBackfillStats?.updatedCount ?? 0,
              failedCount: latestBackfillStats?.failedCount ?? latestBackfill.errors.length,
              returnedLeadIds: latestBackfillStats?.returnedLeadIds ?? 0,
              hasMore: latestBackfillStats?.hasMore ?? false,
              pagesFetched: latestBackfillStats?.pagesFetched ?? 1,
              pageSize: latestBackfillStats?.pageSize ?? YELP_LEAD_IMPORT_PAGE_SIZE,
              pageLimit: latestBackfillStats?.pageLimit ?? YELP_LEAD_IMPORT_MAX_PAGES_PER_RUN,
              errorSummary: latestBackfill.errorSummary
            }
          : null
    },
    pagination: {
      currentPage,
      pageSize: requestedPageSize,
      totalPages,
      visibleRows: rows.length,
      hasPreviousPage: currentPage > 1,
      hasNextPage: currentPage < totalPages,
      pageSizeOptions: [...LEADS_PAGE_SIZE_OPTIONS],
      pageRowStart: filteredLeads === 0 ? 0 : (currentPage - 1) * requestedPageSize + 1,
      pageRowEnd: filteredLeads === 0 ? 0 : (currentPage - 1) * requestedPageSize + rows.length
    }
  };
}

export async function getLeadDetail(tenantId: string, leadId: string) {
  const lead = await getLeadRecordById(tenantId, leadId);
  const timeline = buildLeadTimeline(lead.events);
  const processingIssues = lead.webhookEvents.filter((event) => event.status === "FAILED" || event.status === "PARTIAL");
  const latestWebhook = lead.webhookEvents[0] ?? null;
  const latestIntakeSync =
    lead.syncRuns.find((run) => run.type === "YELP_LEADS_WEBHOOK" || run.type === "YELP_LEADS_BACKFILL") ?? null;
  const crm = buildLeadCrmSummary(lead);
  const automationHistory = buildLeadAutomationHistory(lead.automationAttempts);
  const initialAutomationAttempt =
    lead.automationAttempts.find((attempt) => (attempt.cadence ?? "INITIAL") === "INITIAL") ?? null;
  const automationSummary = buildLeadAutomationSummary(initialAutomationAttempt);
  const messageHistory = buildLeadConversationActionTimeline(lead.conversationActions);
  const nextFollowUpAttempt =
    lead.automationAttempts
      .filter(
        (attempt) =>
          (attempt.cadence ?? "INITIAL") !== "INITIAL" &&
          attempt.status === "PENDING" &&
          attempt.dueAt instanceof Date
      )
      .sort((left, right) => {
        const leftTime = (left.dueAt ?? left.triggeredAt).getTime();
        const rightTime = (right.dueAt ?? right.triggeredAt).getTime();
        return leftTime - rightTime;
      })[0] ?? null;
  const [replyComposer, aiAssist, automationScope] = await Promise.all([
    getLeadReplyComposerState(tenantId, leadId),
    getAiReplyAssistantState(tenantId, lead.businessId ?? lead.business?.id ?? null),
    getLeadAutomationScopeConfig(tenantId, lead.businessId ?? lead.business?.id ?? null)
  ]);
  const linkedIssues = await listOpenOperatorIssuesForLead(tenantId, leadId, 8);

  return {
    lead,
    timeline,
    crm,
    automationHistory,
    automationSummary,
    automationScope: {
      isBusinessOverride: Boolean(automationScope.override),
      scopeLabel: automationScope.override ? "Business override" : "Tenant default",
      followUp24hEnabled: automationScope.effectiveSettings.followUp24hEnabled,
      followUp24hDelayHours: automationScope.effectiveSettings.followUp24hDelayHours,
      followUp7dEnabled: automationScope.effectiveSettings.followUp7dEnabled,
      followUp7dDelayDays: automationScope.effectiveSettings.followUp7dDelayDays
    },
    nextFollowUp:
      nextFollowUpAttempt
        ? {
            cadence: nextFollowUpAttempt.cadence ?? "INITIAL",
            dueAt: nextFollowUpAttempt.dueAt ?? nextFollowUpAttempt.triggeredAt,
            status: nextFollowUpAttempt.status
          }
        : null,
    messageHistory,
    replyComposer,
    aiAssist,
    linkedIssues: linkedIssues.map((issue) => ({
      id: issue.id,
      issueType: issue.issueType,
      severity: issue.severity,
      summary: issue.summary,
      lastDetectedAt: issue.lastDetectedAt
    })),
    latestWebhookStatus: latestWebhook?.status ?? "NOT_RECEIVED",
    latestIntakeSync: latestIntakeSync
      ? {
          status: latestIntakeSync.status,
          type: latestIntakeSync.type,
          startedAt: latestIntakeSync.startedAt,
          finishedAt: latestIntakeSync.finishedAt,
          errorSummary: latestIntakeSync.errorSummary
        }
      : null,
    processingIssues,
    sourceBoundaries: {
      yelp: "Lead identifiers, thread events, and on-Yelp read or replied markers come from Yelp after the console refreshes the lead snapshot.",
      crm: "CRM entity IDs, partner lifecycle statuses, and mapping exceptions belong to internal systems or operator overrides.",
      local: "Processing status, delivery attempts, outside-Yelp reply markers, and sync failures are local console records.",
      automation: "Autoresponder rules decide whether to send the initial reply and later in-thread follow-ups. Automated sends stay separate from the Yelp-native thread history."
    }
  };
}
