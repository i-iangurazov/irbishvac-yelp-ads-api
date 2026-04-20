import "server-only";

import type { SyncRunStatus } from "@prisma/client";

import { getLeadAutomationScopeConfig } from "@/features/autoresponder/config";
import {
  formatConversationIntentLabels,
  getConversationRecommendedNextAction
} from "@/features/autoresponder/conversation-service";
import {
  getLeadConversationRolloutState,
  humanizeLeadConversationDecision,
  humanizeLeadConversationIntent,
  humanizeLeadConversationMode,
  humanizeLeadConversationStopReason
} from "@/features/autoresponder/conversation";
import { buildLeadAutomationHistory, buildLeadAutomationSummary } from "@/features/autoresponder/normalize";
import { processLeadConversationAutomationForInboundMessage } from "@/features/autoresponder/conversation-service";
import { processLeadAutoresponderForNewLead } from "@/features/autoresponder/service";
import { recordAuditEvent } from "@/features/audit/service";
import { buildLeadCrmSummary, getLeadConversionSummary } from "@/features/crm-enrichment/service";
import { getAiReplyAssistantState } from "@/features/leads/ai-reply-service";
import { recordWebhookIntakeMetric, recordWebhookReconcileMetric } from "@/features/operations/observability-service";
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
  claimLeadWebhookSyncRunForProcessing,
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
  updateLeadWebhookSnapshot,
  updateWebhookEventRecord,
  upsertLeadEventRecords,
  upsertLeadRecord
} from "@/lib/db/leads-repository";
import { toJsonValue } from "@/lib/db/json";
import { getDefaultTenant } from "@/lib/db/tenant";
import { listTenantIds } from "@/lib/db/settings-repository";
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

function getYelpConnectionSummary(params: {
  hasYelpBusinessId: boolean;
  latestWebhookStatus: SyncRunStatus | "NOT_RECEIVED";
  latestWebhookReceivedAt: Date | null;
  latestWebhookErrorSummary?: string | null;
  latestIntakeStatus?: SyncRunStatus | null;
  latestIntakeErrorSummary?: string | null;
}) {
  if (!params.hasYelpBusinessId) {
    return {
      status: "UNRESOLVED",
      label: "Missing Yelp business",
      detail: "This lead is not mapped to a configured Yelp business."
    };
  }

  if (params.latestWebhookStatus === "FAILED") {
    return {
      status: "FAILED",
      label: "Webhook failed",
      detail: params.latestWebhookErrorSummary ?? "The latest Yelp webhook delivery failed during processing."
    };
  }

  if (params.latestIntakeStatus === "FAILED") {
    return {
      status: "FAILED",
      label: "Intake failed",
      detail: params.latestIntakeErrorSummary ?? "The latest Yelp intake run failed."
    };
  }

  if (params.latestWebhookStatus === "PARTIAL" || params.latestIntakeStatus === "PARTIAL") {
    return {
      status: "PARTIAL",
      label: "Needs review",
      detail:
        params.latestWebhookErrorSummary ??
        params.latestIntakeErrorSummary ??
        "Yelp intake partially completed and should be reviewed."
    };
  }

  if (params.latestWebhookReceivedAt) {
    return {
      status: "ACTIVE",
      label: "Webhook received",
      detail: "This lead has live Yelp webhook proof."
    };
  }

  if (params.latestIntakeStatus === "COMPLETED" || params.latestIntakeStatus === "SKIPPED") {
    return {
      status: "READY",
      label: "Intake recorded",
      detail: "This lead has a completed Yelp intake or backfill run."
    };
  }

  if (params.latestIntakeStatus === "QUEUED" || params.latestIntakeStatus === "PROCESSING") {
    return {
      status: "PROCESSING",
      label: "Intake running",
      detail: "Yelp intake is queued or processing for this lead."
    };
  }

  return {
    status: "UNKNOWN",
    label: "No delivery proof",
    detail: "No webhook or completed backfill proof is recorded for this lead yet."
  };
}

function getRecordValue(value: unknown, key: string) {
  const record = asRecord(value);
  return record?.[key];
}

function getNestedRecord(value: unknown, key: string) {
  return asRecord(getRecordValue(value, key));
}

function getStringMetadata(value: unknown, key: string) {
  const candidate = getRecordValue(value, key);
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : null;
}

function getBooleanMetadata(value: unknown, key: string) {
  const candidate = getRecordValue(value, key);
  return typeof candidate === "boolean" ? candidate : null;
}

function getStringArrayMetadata(value: unknown, key: string) {
  const candidate = getRecordValue(value, key);
  return Array.isArray(candidate)
    ? candidate.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function humanizeConversationContentSource(value: string | null) {
  switch (value) {
    case "AI":
      return "AI generated";
    case "TEMPLATE":
      return "Static template";
    case "TEMPLATE_FALLBACK":
      return "Template fallback";
    default:
      return "Not recorded";
  }
}

function humanizeConversationPromptSource(value: string | null, promptConfigured: boolean | null) {
  if (value === "TEMPLATE_AI_PROMPT" || promptConfigured) {
    return "Template AI prompt";
  }

  if (value === "STATIC_TEMPLATE") {
    return "Static template";
  }

  return "Not recorded";
}

function buildConversationDecisionTrace(metadataJson: unknown, fallbackTemplateName: string | null) {
  const classification = getNestedRecord(metadataJson, "classification");
  const sourceContext = getNestedRecord(metadataJson, "sourceContext");
  const decisionSummary = getNestedRecord(metadataJson, "decisionSummary");
  const reviewState = getNestedRecord(metadataJson, "reviewState");
  const template = getNestedRecord(metadataJson, "template");
  const routing = getNestedRecord(metadataJson, "routing");
  const rendering = getNestedRecord(metadataJson, "rendering");
  const flatContentSource = getStringMetadata(metadataJson, "contentSource");
  const flatAiModel = getStringMetadata(metadataJson, "aiModel");
  const flatFallbackReason = getStringMetadata(metadataJson, "fallbackReason");
  const flatWarningCodes = getStringArrayMetadata(metadataJson, "warningCodes");
  const promptConfigured = getBooleanMetadata(template, "aiPromptConfigured");
  const contentSource = getStringMetadata(rendering, "contentSource") ?? flatContentSource;
  const warningCodes = getStringArrayMetadata(rendering, "warningCodes");

  return {
    inboundMessageExcerpt:
      getStringMetadata(metadataJson, "inboundMessageExcerpt") ??
      getStringMetadata(sourceContext, "customerMessageExcerpt") ??
      getStringMetadata(metadataJson, "inboundMessage"),
    classificationIntent: getStringMetadata(classification, "intent"),
    classificationConfidence: getStringMetadata(classification, "confidence"),
    templateName: getStringMetadata(template, "name") ?? fallbackTemplateName,
    templateKind: getStringMetadata(template, "kind") ?? getStringMetadata(classification, "templateKind"),
    templateRenderMode:
      getStringMetadata(template, "renderMode") ??
      getStringMetadata(rendering, "templateRenderMode") ??
      getStringMetadata(metadataJson, "templateRenderMode"),
    promptSourceLabel: humanizeConversationPromptSource(getStringMetadata(template, "promptSource"), promptConfigured),
    aiPromptPreview: getStringMetadata(template, "aiPromptPreview"),
    routingLabel: getStringMetadata(routing, "ruleSource"),
    contentSource,
    contentSourceLabel: humanizeConversationContentSource(contentSource),
    aiModel: getStringMetadata(rendering, "aiModel") ?? flatAiModel,
    fallbackReason: getStringMetadata(rendering, "fallbackReason") ?? flatFallbackReason,
    warningCodes: warningCodes.length > 0 ? warningCodes : flatWarningCodes,
    operatorReviewRequired: getBooleanMetadata(reviewState, "operatorReviewRequired"),
    operatorEditStatus: getStringMetadata(reviewState, "operatorEditStatus"),
    decisionErrorSummary: getStringMetadata(decisionSummary, "errorSummary")
  };
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
  runAutomation?: boolean;
  sourceEventType?: string;
}) {
  let importedCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  let initialAutomationProcessedCount = 0;
  let conversationAutomationProcessedCount = 0;

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
            sourceEventType: params.sourceEventType ?? "BACKFILL_IMPORT",
            sourceEventId: null,
            sourceInteractionTime: null
          });
          const automation = params.runAutomation
            ? await processAutomationForSyncedLead({
                tenantId: params.tenantId,
                lead: result.lead,
                sourceEventId: null
              })
            : null;

          return {
            existingLead: Boolean(result.existingLead),
            failed: false,
            initialAutomationProcessed: Boolean(
              automation?.initial &&
                automation.initial.status !== "DUPLICATE"
            ),
            conversationAutomationProcessed: Boolean(automation?.conversation?.processed)
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

      if (!result.failed && result.initialAutomationProcessed) {
        initialAutomationProcessedCount += 1;
      }

      if (!result.failed && result.conversationAutomationProcessed) {
        conversationAutomationProcessedCount += 1;
      }
    }
  }

  return {
    importedCount,
    updatedCount,
    failedCount,
    initialAutomationProcessedCount,
    conversationAutomationProcessedCount
  };
}

async function processAutomationForSyncedLead(params: {
  tenantId: string;
  lead: {
    id: string;
    businessId?: string | null;
    externalLeadId: string;
  };
  sourceEventId?: string | null;
}) {
  let initial: Awaited<ReturnType<typeof processLeadAutoresponderForNewLead>> | null = null;
  let conversation: Awaited<ReturnType<typeof processLeadConversationAutomationForInboundMessage>> | null = null;

  try {
    initial = await processLeadAutoresponderForNewLead(params.tenantId, params.lead.id);
  } catch (automationError) {
    const normalizedAutomationError = normalizeUnknownError(automationError);

    await recordAuditEvent({
      tenantId: params.tenantId,
      businessId: params.lead.businessId ?? undefined,
      actionType: "lead.autoresponder.first-response",
      status: "FAILED",
      correlationId: `lead-autoresponder:${params.lead.id}`,
      upstreamReference: params.lead.externalLeadId,
      responseSummary: {
        message: normalizedAutomationError.message
      }
    });

    logError("lead.autoresponder.trigger_failed", {
      tenantId: params.tenantId,
      leadId: params.lead.id,
      message: normalizedAutomationError.message
    });
  }

  try {
    conversation = await processLeadConversationAutomationForInboundMessage({
      tenantId: params.tenantId,
      leadId: params.lead.id,
      sourceEventId: params.sourceEventId ?? null
    });
  } catch (conversationError) {
    const normalizedConversationError = normalizeUnknownError(conversationError);

    await recordAuditEvent({
      tenantId: params.tenantId,
      businessId: params.lead.businessId ?? undefined,
      actionType: "lead.conversation-automation.process",
      status: "FAILED",
      correlationId: `lead-conversation-automation:${params.lead.id}:${params.sourceEventId ?? "latest"}`,
      upstreamReference: params.lead.externalLeadId,
      responseSummary: {
        message: normalizedConversationError.message
      }
    });

    logError("lead.conversation_automation.trigger_failed", {
      tenantId: params.tenantId,
      leadId: params.lead.id,
      message: normalizedConversationError.message
    });
  }

  return {
    initial,
    conversation
  };
}

async function syncRecentBusinessLeadsForAutomation(params: {
  tenantId: string;
  business: {
    id: string;
    name: string;
    locationId: string | null;
    encryptedYelpBusinessId: string;
  };
  client: YelpLeadsClient;
  leadLimit: number;
}) {
  const syncRun = await createLeadSyncRun({
    tenantId: params.tenantId,
    businessId: params.business.id,
    type: "YELP_LEADS_BACKFILL",
    status: "PROCESSING",
    capabilityKey: "scheduled_recent_poll",
    requestJson: {
      businessId: params.business.id,
      yelpBusinessId: params.business.encryptedYelpBusinessId,
      limit: params.leadLimit,
      source: "scheduled_recent_poll"
    }
  });
  const startedAt = Date.now();
  let importedCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  let returnedLeadIds = 0;
  let initialAutomationProcessedCount = 0;
  let conversationAutomationProcessedCount = 0;
  let hasMore = false;
  let pagesFetched = 0;
  let offset = 0;
  let requestFailure: ReturnType<typeof normalizeUnknownError> | null = null;

  while (returnedLeadIds < params.leadLimit) {
    const pageLimit = Math.min(YELP_LEAD_IMPORT_PAGE_SIZE, params.leadLimit - returnedLeadIds);
    let leadIds: string[] = [];

    try {
      const leadIdsResponse = await params.client.getBusinessLeadIds(params.business.encryptedYelpBusinessId, {
        limit: pageLimit,
        offset
      });
      const extracted = extractLeadIdsResponse(leadIdsResponse.data);
      leadIds = extracted.leadIds;
      hasMore = extracted.hasMore;
    } catch (error) {
      requestFailure = normalizeUnknownError(error);

      await createLeadSyncError({
        tenantId: params.tenantId,
        syncRunId: syncRun.id,
        category: "LEAD_BACKFILL_REQUEST",
        code: requestFailure.code,
        message: `Scheduled recent poll page ${pagesFetched + 1} (offset ${offset}): ${requestFailure.message}`,
        isRetryable: error instanceof YelpApiError ? isRetryable(error) : false,
        detailsJson: requestFailure.details ?? null
      });
      break;
    }

    pagesFetched += 1;
    returnedLeadIds += leadIds.length;

    const pageResults = await processLeadIdsBatch({
      tenantId: params.tenantId,
      syncRunId: syncRun.id,
      business: {
        id: params.business.id,
        locationId: params.business.locationId,
        encryptedYelpBusinessId: params.business.encryptedYelpBusinessId
      },
      client: params.client,
      leadIds,
      runAutomation: true,
      sourceEventType: "SCHEDULED_RECENT_POLL"
    });

    importedCount += pageResults.importedCount;
    updatedCount += pageResults.updatedCount;
    failedCount += pageResults.failedCount;
    initialAutomationProcessedCount += pageResults.initialAutomationProcessedCount;
    conversationAutomationProcessedCount += pageResults.conversationAutomationProcessedCount;

    await updateLeadSyncRun(syncRun.id, {
      status: "PROCESSING",
      businessId: params.business.id,
      statsJson: {
        ...shapeBackfillRunStats({
          importedCount,
          updatedCount,
          failedCount,
          returnedLeadIds,
          hasMore,
          pagesFetched,
          processingMs: Date.now() - startedAt
        }),
        initialAutomationProcessedCount,
        conversationAutomationProcessedCount,
        source: "scheduled_recent_poll"
      },
      responseJson: {
        businessId: params.business.id,
        yelpBusinessId: params.business.encryptedYelpBusinessId,
        returnedLeadIds,
        hasMore,
        pagesFetched,
        initialAutomationProcessedCount,
        conversationAutomationProcessedCount,
        source: "scheduled_recent_poll"
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
    businessId: params.business.id,
    finishedAt,
    lastSuccessfulSyncAt: finalStatus === "FAILED" ? null : finishedAt,
    statsJson: {
      ...shapeBackfillRunStats({
        importedCount,
        updatedCount,
        failedCount,
        returnedLeadIds,
        hasMore,
        pagesFetched,
        processingMs: Date.now() - startedAt
      }),
      initialAutomationProcessedCount,
      conversationAutomationProcessedCount,
      source: "scheduled_recent_poll"
    },
    responseJson: {
      businessId: params.business.id,
      yelpBusinessId: params.business.encryptedYelpBusinessId,
      returnedLeadIds,
      hasMore,
      pagesFetched,
      initialAutomationProcessedCount,
      conversationAutomationProcessedCount,
      source: "scheduled_recent_poll"
    },
    errorSummary:
      finalStatus === "FAILED"
        ? requestFailure?.message ?? "Scheduled recent lead poll failed for every returned Yelp lead ID."
        : requestFailure
          ? `Recent lead poll processed ${pagesFetched} Yelp page${pagesFetched === 1 ? "" : "s"} before a later page failed.`
          : failedCount > 0
            ? `${failedCount} Yelp lead refreshes failed.`
            : null
  });
  await recordAuditEvent({
    tenantId: params.tenantId,
    businessId: params.business.id,
    actionType: "lead.recent-poll.sync",
    status: finalStatus === "FAILED" ? "FAILED" : "SUCCESS",
    correlationId: syncRun.id,
    upstreamReference: params.business.encryptedYelpBusinessId,
    requestSummary: {
      businessId: params.business.id,
      yelpBusinessId: params.business.encryptedYelpBusinessId,
      limit: params.leadLimit
    },
    responseSummary: {
      importedCount,
      updatedCount,
      failedCount,
      returnedLeadIds,
      hasMore,
      pagesFetched,
      initialAutomationProcessedCount,
      conversationAutomationProcessedCount,
      status: finalStatus
    }
  });

  logInfo("leads.recent_poll.completed", {
    tenantId: params.tenantId,
    businessId: params.business.id,
    yelpBusinessId: params.business.encryptedYelpBusinessId,
    returnedLeadIds,
    importedCount,
    updatedCount,
    failedCount,
    initialAutomationProcessedCount,
    conversationAutomationProcessedCount,
    pagesFetched,
    processingMs: Date.now() - startedAt
  });

  return {
    syncRunId: syncRun.id,
    businessId: params.business.id,
    businessName: params.business.name,
    status: finalStatus,
    importedCount,
    updatedCount,
    failedCount,
    returnedLeadIds,
    hasMore,
    pagesFetched,
    initialAutomationProcessedCount,
    conversationAutomationProcessedCount
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
    businessId: tenantContext.business?.id ?? syncRun.businessId ?? null,
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

  const knownLeadId = syncRun.leadId ?? webhookEvent.leadId ?? null;

  if (knownLeadId) {
    await updateLeadWebhookSnapshot(tenantContext.tenantId, knownLeadId, {
      latestWebhookStatus: "PROCESSING",
      latestWebhookReceivedAt: receivedAt,
      latestWebhookErrorSummary: null
    });
  }

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

    await processAutomationForSyncedLead({
      tenantId: tenantContext.tenantId,
      lead,
      sourceEventId: update.eventId ?? null
    });

    await updateWebhookEventRecord(webhookEvent.id, {
      leadId: lead.id,
      status: "COMPLETED",
      processedAt: finishedAt,
      errorJson: null
    });
    await updateLeadWebhookSnapshot(tenantContext.tenantId, lead.id, {
      latestWebhookStatus: "COMPLETED",
      latestWebhookReceivedAt: receivedAt,
      latestWebhookErrorSummary: null
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
    await recordWebhookReconcileMetric({
      tenantId: tenantContext.tenantId,
      status: "SUCCEEDED",
      processingMs: Date.now() - processingStartedAt,
      receivedAt,
      completedAt: finishedAt
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
    const failedLeadId = syncRun.leadId ?? webhookEvent.leadId ?? null;

    if (failedLeadId) {
      await updateLeadWebhookSnapshot(tenantContext.tenantId, failedLeadId, {
        latestWebhookStatus: "FAILED",
        latestWebhookReceivedAt: receivedAt,
        latestWebhookErrorSummary: normalizedError.message
      });
    }
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
    await recordWebhookReconcileMetric({
      tenantId: tenantContext.tenantId,
      status: "FAILED",
      processingMs: Date.now() - processingStartedAt,
      receivedAt,
      completedAt: finishedAt
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

    const claimed = await claimLeadWebhookSyncRunForProcessing(tenantId, syncRun.id, new Date());

    if (!claimed) {
      throw new YelpValidationError("This lead intake issue is already being retried by another worker.");
    }

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
      await recordWebhookIntakeMetric({
        tenantId: tenantContext.tenantId,
        deliveryStatus: "DUPLICATE",
        occurredAt: update.interactionTime,
        receivedAt: existingWebhook.receivedAt
      });
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
    if (existingWebhook?.leadId) {
      await updateLeadWebhookSnapshot(tenantContext.tenantId, existingWebhook.leadId, {
        latestWebhookStatus: "QUEUED",
        latestWebhookReceivedAt: webhookEvent.receivedAt ?? new Date(),
        latestWebhookErrorSummary: null
      });
    }
    await recordWebhookIntakeMetric({
      tenantId: tenantContext.tenantId,
      deliveryStatus: webhookEvent.status,
      occurredAt: update.interactionTime,
      receivedAt: webhookEvent.receivedAt ?? new Date()
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
  const now = new Date();

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

      const claimed = await claimLeadWebhookSyncRunForProcessing(syncRun.tenantId, syncRun.id, now);

      if (!claimed) {
        continue;
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

export async function reconcileRecentYelpLeadsForAutomation(limit = 40) {
  const normalizedLimit = Math.max(0, Math.min(Math.trunc(limit), 100));

  if (normalizedLimit === 0) {
    return {
      tenantCount: 0,
      businessCount: 0,
      processedLeadCount: 0,
      importedCount: 0,
      updatedCount: 0,
      failedCount: 0,
      initialAutomationProcessedCount: 0,
      conversationAutomationProcessedCount: 0,
      results: []
    };
  }

  const tenants = await listTenantIds();
  const results: Array<Awaited<ReturnType<typeof syncRecentBusinessLeadsForAutomation>>> = [];
  let remainingLeadBudget = normalizedLimit;

  for (const tenant of tenants) {
    if (remainingLeadBudget <= 0) {
      break;
    }

    let client: YelpLeadsClient;

    try {
      const { credential } = await ensureYelpLeadsAccess(tenant.id);
      client = new YelpLeadsClient(credential);
    } catch (error) {
      const normalized = normalizeUnknownError(error);

      logError("leads.recent_poll.access_failed", {
        tenantId: tenant.id,
        message: normalized.message
      });
      continue;
    }

    const businesses = await listLeadBusinessOptions(tenant.id);

    for (const business of businesses) {
      if (remainingLeadBudget <= 0) {
        break;
      }

      if (!business.encryptedYelpBusinessId) {
        continue;
      }

      const { effectiveSettings } = await getLeadAutomationScopeConfig(tenant.id, business.id);
      const shouldPollForAutomation = effectiveSettings.isEnabled || effectiveSettings.conversationAutomationEnabled;

      if (!shouldPollForAutomation) {
        continue;
      }

      const leadLimit = Math.min(remainingLeadBudget, YELP_LEAD_IMPORT_PAGE_SIZE * 3);
      const result = await syncRecentBusinessLeadsForAutomation({
        tenantId: tenant.id,
        business: {
          id: business.id,
          name: business.name,
          locationId: business.locationId ?? null,
          encryptedYelpBusinessId: business.encryptedYelpBusinessId
        },
        client,
        leadLimit
      });

      results.push(result);
      remainingLeadBudget -= result.returnedLeadIds;
    }
  }

  return {
    tenantCount: tenants.length,
    businessCount: results.length,
    processedLeadCount: results.reduce((total, result) => total + result.returnedLeadIds, 0),
    importedCount: results.reduce((total, result) => total + result.importedCount, 0),
    updatedCount: results.reduce((total, result) => total + result.updatedCount, 0),
    failedCount: results.reduce((total, result) => total + result.failedCount, 0),
    initialAutomationProcessedCount: results.reduce(
      (total, result) => total + result.initialAutomationProcessedCount,
      0
    ),
    conversationAutomationProcessedCount: results.reduce(
      (total, result) => total + result.conversationAutomationProcessedCount,
      0
    ),
    results
  };
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
    status: filters.status,
    attention: filters.attention,
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
    status: filters.status,
    attention: filters.attention,
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

  const attentionCountFilters = {
    ...paginationFilters,
    attention: "NEEDS_ATTENTION" as const
  };
  const [attentionLeadCount, filteredLeadCount] = await Promise.all([
    countLeadRecords(tenantId, attentionCountFilters),
    countLeadRecords(tenantId, paginationFilters)
  ]);
  filteredLeads = filteredLeadCount;
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
      needsAttention: attentionLeadCount,
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
  const yelpConnection = getYelpConnectionSummary({
    hasYelpBusinessId: Boolean(lead.business?.encryptedYelpBusinessId ?? lead.externalBusinessId),
    latestWebhookStatus: latestWebhook?.status ?? "NOT_RECEIVED",
    latestWebhookReceivedAt: latestWebhook?.receivedAt ?? lead.latestWebhookReceivedAt ?? null,
    latestWebhookErrorSummary:
      latestWebhook?.syncRun?.errors[0]?.message ??
      lead.latestWebhookErrorSummary ??
      latestWebhook?.syncRun?.errorSummary ??
      null,
    latestIntakeStatus: latestIntakeSync?.status ?? null,
    latestIntakeErrorSummary: latestIntakeSync?.errors[0]?.message ?? latestIntakeSync?.errorSummary ?? null
  });
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
  const conversationTurns = lead.conversationAutomationTurns ?? [];
  const latestConversationTurn = conversationTurns[0] ?? null;
  const latestOperatorConversationActionAt =
    lead.conversationActions
      .filter(
        (action) =>
          action.initiator === "OPERATOR" &&
          action.status === "SENT" &&
          (action.actionType === "SEND_MESSAGE" || action.actionType === "MARK_REPLIED")
      )
      .map((action) => action.completedAt ?? action.createdAt)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  const conversationRollout = getLeadConversationRolloutState({
    enabled: automationScope.effectiveSettings.conversationAutomationEnabled,
    paused: automationScope.effectiveSettings.conversationGlobalPauseEnabled,
    mode: automationScope.effectiveSettings.conversationMode
  });
  const conversationPolicy = {
    enabled: automationScope.effectiveSettings.conversationAutomationEnabled,
    paused: automationScope.effectiveSettings.conversationGlobalPauseEnabled,
    mode: automationScope.effectiveSettings.conversationMode,
    modeLabel: humanizeLeadConversationMode(automationScope.effectiveSettings.conversationMode),
    rolloutLabel: conversationRollout.label,
    rolloutDescription: conversationRollout.description,
    pilotLabel: conversationRollout.pilotLabel,
    allowedIntentLabels: formatConversationIntentLabels(automationScope.effectiveSettings.conversationAllowedIntents),
    maxAutomatedTurns: automationScope.effectiveSettings.conversationMaxAutomatedTurns,
    reviewFallbackEnabled: automationScope.effectiveSettings.conversationReviewFallbackEnabled,
    escalateToIssueQueue: automationScope.effectiveSettings.conversationEscalateToIssueQueue
  };
  const conversationState = lead.conversationAutomationState
    ? {
        enabled: lead.conversationAutomationState.isEnabled,
        mode: lead.conversationAutomationState.mode,
        modeLabel: humanizeLeadConversationMode(lead.conversationAutomationState.mode),
        automatedTurnCount: lead.conversationAutomationState.automatedTurnCount,
        lastAutomatedReplyAt: lead.conversationAutomationState.lastAutomatedReplyAt,
        lastInboundAt: lead.conversationAutomationState.lastInboundAt,
        lastIntent: lead.conversationAutomationState.lastIntent,
        lastIntentLabel: lead.conversationAutomationState.lastIntent
          ? humanizeLeadConversationIntent(lead.conversationAutomationState.lastIntent)
          : null,
        lastDecision: lead.conversationAutomationState.lastDecision,
        lastDecisionLabel: lead.conversationAutomationState.lastDecision
          ? humanizeLeadConversationDecision(lead.conversationAutomationState.lastDecision)
          : null,
        lastStopReason: lead.conversationAutomationState.lastStopReason,
        lastStopReasonLabel: lead.conversationAutomationState.lastStopReason
          ? humanizeLeadConversationStopReason(lead.conversationAutomationState.lastStopReason)
          : null,
        humanTakeoverAt: lead.conversationAutomationState.humanTakeoverAt,
        escalatedAt: lead.conversationAutomationState.escalatedAt,
        blockedAt: lead.conversationAutomationState.blockedAt
      }
    : null;
  const conversationNeedsReview = Boolean(
    latestConversationTurn &&
      latestConversationTurn.decision !== "AUTO_REPLY" &&
      (!latestOperatorConversationActionAt ||
        latestOperatorConversationActionAt.getTime() <= latestConversationTurn.createdAt.getTime())
  );
  const latestConversationIssue = linkedIssues.find((issue) => issue.issueType === "AUTORESPONDER_FAILURE") ?? null;
  const conversationHistory = conversationTurns.map((turn) => {
    const decisionTrace = buildConversationDecisionTrace(turn.metadataJson, turn.template?.name ?? null);

    return {
      id: turn.id,
      createdAt: turn.createdAt,
      completedAt: turn.completedAt,
      mode: turn.mode,
      modeLabel: humanizeLeadConversationMode(turn.mode),
      intent: turn.intent,
      intentLabel: humanizeLeadConversationIntent(turn.intent),
      decision: turn.decision,
      decisionLabel: humanizeLeadConversationDecision(turn.decision),
      confidence: turn.confidence,
      stopReason: turn.stopReason,
      stopReasonLabel: turn.stopReason ? humanizeLeadConversationStopReason(turn.stopReason) : null,
      renderedSubject: turn.renderedSubject,
      renderedBody: turn.renderedBody,
      errorSummary: turn.errorSummary,
      templateName: turn.template?.name ?? null,
      decisionTrace,
      metadataJson: turn.metadataJson
    };
  });
  const conversationSuggestionTurn =
    conversationNeedsReview && latestConversationTurn?.decision === "REVIEW_ONLY" && latestConversationTurn.renderedBody
      ? conversationHistory.find((turn) => turn.id === latestConversationTurn.id) ?? null
      : null;

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
      followUp7dDelayDays: automationScope.effectiveSettings.followUp7dDelayDays,
      conversationPolicy
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
    conversationState,
    conversationReview: {
      needsReview: conversationNeedsReview,
      latestOperatorActionAt: latestOperatorConversationActionAt,
      latestIssue: latestConversationIssue
        ? {
            id: latestConversationIssue.id,
            summary: latestConversationIssue.summary,
            severity: latestConversationIssue.severity,
            lastDetectedAt: latestConversationIssue.lastDetectedAt
          }
        : null
    },
    conversationHistory,
    conversationSuggestion: conversationSuggestionTurn
      ? {
          turnId: conversationSuggestionTurn.id,
          title: conversationSuggestionTurn.decisionTrace.templateName
            ? `Suggested reply from ${conversationSuggestionTurn.decisionTrace.templateName}`
            : "Suggested conversation reply",
          subject: conversationSuggestionTurn.renderedSubject,
          body: conversationSuggestionTurn.renderedBody ?? "",
          warningCodes: conversationSuggestionTurn.decisionTrace.warningCodes,
          contentSourceLabel: conversationSuggestionTurn.decisionTrace.contentSourceLabel,
          promptSourceLabel: conversationSuggestionTurn.decisionTrace.promptSourceLabel,
          stopReasonLabel: conversationSuggestionTurn.stopReasonLabel
        }
      : null,
    conversationRecommendedNextAction: latestConversationTurn
      ? getConversationRecommendedNextAction(latestConversationTurn.decision, latestConversationTurn.stopReason)
      : conversationPolicy.enabled
        ? "No inbound conversation turn has been processed yet."
        : "Conversation automation is off for this lead scope.",
    replyComposer,
    aiAssist,
    linkedIssues: linkedIssues.map((issue) => ({
      id: issue.id,
      issueType: issue.issueType,
      severity: issue.severity,
      summary: issue.summary,
      lastDetectedAt: issue.lastDetectedAt
    })),
    yelpConnection: {
      ...yelpConnection,
      yelpBusinessId: lead.business?.encryptedYelpBusinessId ?? lead.externalBusinessId ?? null,
      latestWebhookReceivedAt: latestWebhook?.receivedAt ?? lead.latestWebhookReceivedAt ?? null,
      latestWebhookStatus: latestWebhook?.status ?? "NOT_RECEIVED",
      latestIntakeAt:
        latestIntakeSync?.lastSuccessfulSyncAt ??
        latestIntakeSync?.finishedAt ??
        latestIntakeSync?.startedAt ??
        null,
      latestIntakeStatus: latestIntakeSync?.status ?? null
    },
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
