import "server-only";

import type { SyncRunStatus } from "@prisma/client";

import { buildLeadAutomationHistory, buildLeadAutomationSummary } from "@/features/autoresponder/normalize";
import { processLeadAutoresponderForNewLead } from "@/features/autoresponder/service";
import { recordAuditEvent } from "@/features/audit/service";
import { buildLeadCrmSummary, getLeadConversionSummary } from "@/features/crm-enrichment/service";
import {
  buildLeadConversationActionTimeline,
  buildLeadListEntry,
  buildLeadTimeline,
  buildWebhookEventKey,
  type ParsedLeadWebhookUpdate
} from "@/features/leads/normalize";
import { getLeadReplyComposerState } from "@/features/leads/messaging-service";
import { extractLeadIdsResponse, syncLeadSnapshotFromYelp } from "@/features/leads/yelp-sync";
import { leadBackfillSchema, leadFiltersSchema, type LeadFiltersInput } from "@/features/leads/schemas";
import { getBusinessById } from "@/lib/db/businesses-repository";
import {
  countLeadRecords,
  createLeadSyncError,
  createLeadSyncRun,
  createWebhookEventRecord,
  findLeadRecordByExternalLeadId,
  findBusinessesByExternalYelpBusinessId,
  findWebhookEventByKey,
  getLeadRecordById,
  listLeadBackfillRuns,
  listFailedLeadWebhookEvents,
  listLeadBusinessOptions,
  listLeadRecords,
  updateLeadSyncRun,
  updateWebhookEventRecord,
  upsertLeadEventRecords,
  upsertLeadRecord
} from "@/lib/db/leads-repository";
import { toJsonValue } from "@/lib/db/json";
import { getDefaultTenant } from "@/lib/db/tenant";
import { logError, logInfo } from "@/lib/utils/logging";
import { normalizeUnknownError, YelpApiError, YelpValidationError } from "@/lib/yelp/errors";
import { yelpLeadWebhookPayloadSchema } from "@/lib/yelp/schemas";
import { ensureYelpLeadsAccess, getCapabilityFlags } from "@/lib/yelp/runtime";
import { YelpLeadsClient } from "@/lib/yelp/leads-client";

export const YELP_LEAD_IMPORT_PAGE_SIZE = 20;

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
  const receivedAt = new Date();
  const tenantContext = await resolveTenantContext(parsed.data.data.id);
  let firstFailure: YelpApiError | null = null;
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
          status: "PROCESSING",
          processedAt: null,
          errorJson: null
        })
      : await createWebhookEventRecord({
          tenantId: tenantContext.tenantId,
          syncRunId: syncRun.id,
          eventKey,
          deliveryId: resolveDeliveryId(normalizedHeaders),
          topic: "leads_event",
          status: "PROCESSING",
          headersJson: normalizedHeaders,
          payloadJson: {
            delivery: parsed.data,
            update: rawUpdate
          }
        });

    logInfo("leads.webhook.received", {
      tenantId: tenantContext.tenantId,
      eventKey,
      businessId: parsed.data.data.id,
      leadId: update.leadId,
      eventType: update.eventType
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
          encryptedYelpBusinessId: parsed.data.data.id
        },
        client,
        leadId: update.leadId,
        receivedAt,
        sourceEventType: update.eventType,
        sourceEventId: update.eventId ?? null,
        sourceInteractionTime: update.interactionTime ?? null
      });
      const finishedAt = new Date();

      if (!existingLead) {
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
          normalizedEventCount
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
        correlationId: eventKey,
        upstreamReference: update.leadId,
        requestSummary: {
          eventType: update.eventType,
          eventId: update.eventId ?? null,
          yelpBusinessId: parsed.data.data.id
        },
        responseSummary: {
          localLeadId: lead.id,
          normalizedEventCount
        },
        rawPayloadSummary: toJsonValue(rawUpdate)
      });

      logInfo("leads.webhook.processed", {
        tenantId: tenantContext.tenantId,
        eventKey,
        localLeadId: lead.id,
        normalizedEventCount
      });

      results.push({
        eventKey,
        deliveryStatus: "COMPLETED",
        leadId: update.leadId,
        localLeadId: lead.id
      });
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
        errorSummary: normalizedError.message
      });
      await createLeadSyncError({
        tenantId: tenantContext.tenantId,
        syncRunId: syncRun.id,
        category: "LEAD_WEBHOOK_PROCESSING",
        code: normalizedError.code,
        message: normalizedError.message,
        isRetryable: isRetryable(normalizedError),
        detailsJson: normalizedError.details ?? null
      });
      await recordAuditEvent({
        tenantId: tenantContext.tenantId,
        businessId: tenantContext.business?.id ?? undefined,
        actionType: "lead.webhook.process",
        status: "FAILED",
        correlationId: eventKey,
        upstreamReference: update.leadId,
        requestSummary: {
          eventType: update.eventType,
          eventId: update.eventId ?? null,
          yelpBusinessId: parsed.data.data.id
        },
        responseSummary: {
          code: normalizedError.code,
          message: normalizedError.message
        },
        rawPayloadSummary: toJsonValue(rawUpdate)
      });

      logError("leads.webhook.failed", {
        tenantId: tenantContext.tenantId,
        eventKey,
        code: normalizedError.code,
        message: normalizedError.message
      });

      results.push({
        eventKey,
        deliveryStatus: "FAILED",
        leadId: update.leadId,
        message: normalizedError.message
      });

      firstFailure ??= normalizedError;
    }
  }

  if (firstFailure) {
    throw firstFailure;
  }

  return {
    tenantId: tenantContext.tenantId,
    externalBusinessId: parsed.data.data.id,
    results
  };
}

export async function syncBusinessLeadsWorkflow(tenantId: string, actorId: string, input: unknown) {
  const values = leadBackfillSchema.parse(input);
  const business = await getBusinessById(values.businessId, tenantId);

  if (!business.encryptedYelpBusinessId) {
    throw new YelpValidationError("This business is missing a Yelp business ID.");
  }

  const { credential } = await ensureYelpLeadsAccess(tenantId);
  const client = new YelpLeadsClient(credential);
  const startedAt = new Date();
  const syncRun = await createLeadSyncRun({
    tenantId,
    businessId: business.id,
    type: "YELP_LEADS_BACKFILL",
    capabilityKey: "hasLeadsApi",
    correlationId: `lead-backfill:${business.id}:${startedAt.toISOString()}`,
    requestJson: {
      businessId: business.id,
      yelpBusinessId: business.encryptedYelpBusinessId,
      limit: YELP_LEAD_IMPORT_PAGE_SIZE
    }
  });

  try {
    const leadIdsResponse = await client.getBusinessLeadIds(business.encryptedYelpBusinessId, { limit: YELP_LEAD_IMPORT_PAGE_SIZE });
    const { leadIds, hasMore } = extractLeadIdsResponse(leadIdsResponse.data);
    let importedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    for (const leadId of leadIds) {
      try {
        const result = await syncLeadSnapshotFromYelp({
          tenantId,
          business: {
            id: business.id,
            locationId: business.locationId ?? null,
            encryptedYelpBusinessId: business.encryptedYelpBusinessId
          },
          client,
          leadId,
          receivedAt: new Date(),
          sourceEventType: "BACKFILL_IMPORT",
          sourceEventId: null,
          sourceInteractionTime: null
        });

        if (result.existingLead) {
          updatedCount += 1;
        } else {
          importedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        const normalized = normalizeUnknownError(error);

        await createLeadSyncError({
          tenantId,
          syncRunId: syncRun.id,
          category: "LEAD_BACKFILL_PROCESSING",
          code: normalized.code,
          message: `${leadId}: ${normalized.message}`,
          isRetryable: normalized instanceof YelpApiError ? isRetryable(normalized) : false,
          detailsJson: normalized.details ?? null
        });
      }
    }

    const finishedAt = new Date();
    const finalStatus: SyncRunStatus =
      failedCount === 0 ? "COMPLETED" : importedCount > 0 || updatedCount > 0 ? "PARTIAL" : "FAILED";

    await updateLeadSyncRun(syncRun.id, {
      status: finalStatus,
      finishedAt,
      lastSuccessfulSyncAt: finalStatus === "FAILED" ? null : finishedAt,
      statsJson: {
        importedCount,
        updatedCount,
        failedCount,
        returnedLeadIds: leadIds.length,
        hasMore
      },
      responseJson: {
        businessId: business.id,
        yelpBusinessId: business.encryptedYelpBusinessId,
        returnedLeadIds: leadIds.length,
        hasMore
      },
      errorSummary:
        finalStatus === "FAILED"
          ? "Lead import failed for every returned Yelp lead ID."
          : failedCount > 0
            ? `${failedCount} Yelp lead imports failed.`
            : hasMore
              ? "Imported the available Yelp lead IDs returned in the first page. Yelp indicated more lead IDs exist."
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
        limit: YELP_LEAD_IMPORT_PAGE_SIZE
      },
      responseSummary: {
        importedCount,
        updatedCount,
        failedCount,
        returnedLeadIds: leadIds.length,
        hasMore,
        status: finalStatus
      }
    });

    return {
      syncRunId: syncRun.id,
      status: finalStatus,
      importedCount,
      updatedCount,
      failedCount,
      returnedLeadIds: leadIds.length,
      hasMore
    };
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
        limit: YELP_LEAD_IMPORT_PAGE_SIZE
      },
      responseSummary: {
        message: normalized.message,
        code: normalized.code
      }
    });
    throw error;
  }
}

export async function getLeadsIndex(tenantId: string, rawFilters?: LeadFiltersInput) {
  const filters = leadFiltersSchema.parse(rawFilters ?? {});
  const [capabilities, businesses, leads, failedDeliveries, conversionMetrics, backfillRuns, totalSyncedLeads] = await Promise.all([
    getCapabilityFlags(tenantId),
    listLeadBusinessOptions(tenantId),
    listLeadRecords(tenantId, {
      businessId: filters.businessId,
      mappingState: filters.mappingState,
      internalStatus: filters.internalStatus,
      from: filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : undefined,
      to: filters.to ? endOfDay(filters.to) : undefined
    }),
    listFailedLeadWebhookEvents(tenantId, 6),
    getLeadConversionSummary(tenantId),
    listLeadBackfillRuns(tenantId, 5),
    countLeadRecords(tenantId)
  ]);
  let rows = leads.map((lead) => buildLeadListEntry(lead));

  if (filters.status) {
    rows = rows.filter((lead) => lead.processingStatus === filters.status);
  }

  const latestBackfill = backfillRuns[0] ?? null;
  const latestBackfillStats =
    typeof latestBackfill?.statsJson === "object" && latestBackfill?.statsJson !== null
      ? (latestBackfill.statsJson as {
          importedCount?: number;
          updatedCount?: number;
          failedCount?: number;
          returnedLeadIds?: number;
          hasMore?: boolean;
        })
      : null;

  return {
    capabilityEnabled: capabilities.hasLeadsApi,
    filters,
    businesses,
    summary: {
      totalSyncedLeads,
      filteredLeads: rows.length,
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
              pageSize: YELP_LEAD_IMPORT_PAGE_SIZE,
              errorSummary: latestBackfill.errorSummary
            }
          : null
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
  const automationSummary = buildLeadAutomationSummary(lead.automationAttempts[0] ?? null);
  const messageHistory = buildLeadConversationActionTimeline(lead.conversationActions);
  const replyComposer = await getLeadReplyComposerState(tenantId, leadId);

  return {
    lead,
    timeline,
    crm,
    automationHistory,
    automationSummary,
    messageHistory,
    replyComposer,
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
      yelp: "Lead identifiers, thread events, and reply or read markers come from Yelp after the console refreshes the lead snapshot.",
      crm: "CRM entity IDs, internal lifecycle statuses, and mapping exceptions belong to internal systems or operator overrides.",
      local: "Processing status, message delivery attempts, mark-read or mark-replied actions, and sync failures are local console records.",
      automation: "Autoresponder rules decide whether to send the first reply. Outbound channel history is shown separately from the Yelp-native thread."
    }
  };
}
