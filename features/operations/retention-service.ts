import "server-only";

import {
  listAuditEventsForRetention,
  listConversationTurnsForRetention,
  listSyncErrorsForRetention,
  listSyncRunsForRetention,
  listWebhookEventsForRetention,
  redactAuditEventDebugSummaries,
  redactAuditEventRawPayload,
  redactConversationTurns,
  redactSyncErrors,
  redactSyncRuns,
  redactWebhookEvents
} from "@/lib/db/retention-repository";
import { listTenantIds, upsertSystemSetting } from "@/lib/db/settings-repository";

export const operationalRetentionPolicy = {
  webhookPayloadHotDays: 30,
  syncRunDebugHotDays: 45,
  auditRawPayloadHotDays: 30,
  auditDebugHotDays: 90,
  conversationTurnHotDays: 90,
  syncErrorDetailHotDays: 60
} as const;

const operationalRetentionStateKey = "operationalRetentionState";

type RetentionCountByTenant = Map<string, Record<string, number>>;

function buildTombstone(kind: string, redactedAt: string, hotDays: number) {
  return {
    retained: false,
    kind,
    reason: "RETENTION_POLICY",
    hotRetentionDays: hotDays,
    redactedAt
  };
}

function incrementTenantCounts(countsByTenant: RetentionCountByTenant, tenantId: string, key: string, amount = 1) {
  const current = countsByTenant.get(tenantId) ?? {};
  current[key] = (current[key] ?? 0) + amount;
  countsByTenant.set(tenantId, current);
}

function hasJsonValue(value: unknown) {
  return value !== null && value !== undefined;
}

export async function runOperationalRetention(limitPerModel = 250) {
  const now = new Date();
  const countsByTenant: RetentionCountByTenant = new Map();
  const redactedAt = now.toISOString();
  const webhookBefore = new Date(now.getTime() - operationalRetentionPolicy.webhookPayloadHotDays * 24 * 60 * 60 * 1000);
  const syncRunBefore = new Date(now.getTime() - operationalRetentionPolicy.syncRunDebugHotDays * 24 * 60 * 60 * 1000);
  const auditRawBefore = new Date(now.getTime() - operationalRetentionPolicy.auditRawPayloadHotDays * 24 * 60 * 60 * 1000);
  const auditDebugBefore = new Date(now.getTime() - operationalRetentionPolicy.auditDebugHotDays * 24 * 60 * 60 * 1000);
  const conversationBefore = new Date(now.getTime() - operationalRetentionPolicy.conversationTurnHotDays * 24 * 60 * 60 * 1000);
  const syncErrorBefore = new Date(now.getTime() - operationalRetentionPolicy.syncErrorDetailHotDays * 24 * 60 * 60 * 1000);

  const webhookRows = (await listWebhookEventsForRetention(webhookBefore, limitPerModel))
    .filter((row) => hasJsonValue(row.headersJson) || hasJsonValue(row.errorJson))
    .slice(0, limitPerModel);
  await redactWebhookEvents(
    webhookRows.map((row) => row.id),
    buildTombstone("yelpWebhookEvent.payloadJson", redactedAt, operationalRetentionPolicy.webhookPayloadHotDays)
  );
  for (const row of webhookRows) {
    incrementTenantCounts(countsByTenant, row.tenantId, "webhookPayloadsRedacted");
  }

  const syncRunRows = (await listSyncRunsForRetention(syncRunBefore, limitPerModel))
    .filter((row) => hasJsonValue(row.requestJson) || hasJsonValue(row.responseJson))
    .slice(0, limitPerModel);
  await redactSyncRuns(syncRunRows.map((row) => row.id));
  for (const row of syncRunRows) {
    incrementTenantCounts(countsByTenant, row.tenantId, "syncRunDebugRecordsRedacted");
  }

  const auditRawRows = await listAuditEventsForRetention(auditRawBefore, limitPerModel);
  const auditRawIds = auditRawRows
    .filter((row) => hasJsonValue(row.rawPayloadSummaryJson))
    .map((row) => row.id)
    .slice(0, limitPerModel);
  await redactAuditEventRawPayload(auditRawIds);
  for (const row of auditRawRows.filter((candidate) => auditRawIds.includes(candidate.id))) {
    incrementTenantCounts(countsByTenant, row.tenantId, "auditRawPayloadsRedacted");
  }

  const auditDebugRows = await listAuditEventsForRetention(auditDebugBefore, limitPerModel);
  const auditDebugIds = auditDebugRows
    .filter(
      (row) =>
        hasJsonValue(row.requestSummaryJson) ||
        hasJsonValue(row.responseSummaryJson) ||
        hasJsonValue(row.beforeJson) ||
        hasJsonValue(row.afterJson)
    )
    .map((row) => row.id)
    .slice(0, limitPerModel);
  await redactAuditEventDebugSummaries(auditDebugIds);
  for (const row of auditDebugRows.filter((candidate) => auditDebugIds.includes(candidate.id))) {
    incrementTenantCounts(countsByTenant, row.tenantId, "auditDebugSummariesRedacted");
  }

  const conversationRows = (await listConversationTurnsForRetention(conversationBefore, limitPerModel))
    .filter(
      (row) => row.renderedSubject !== null || row.renderedBody !== null || hasJsonValue(row.metadataJson)
    )
    .slice(0, limitPerModel);
  await redactConversationTurns(
    conversationRows.map((row) => row.id),
    buildTombstone(
      "leadConversationAutomationTurn.metadataJson",
      redactedAt,
      operationalRetentionPolicy.conversationTurnHotDays
    )
  );
  for (const row of conversationRows) {
    incrementTenantCounts(countsByTenant, row.tenantId, "conversationTurnsRedacted");
  }

  const syncErrorRows = (await listSyncErrorsForRetention(syncErrorBefore, limitPerModel))
    .filter((row) => hasJsonValue(row.detailsJson))
    .slice(0, limitPerModel);
  await redactSyncErrors(syncErrorRows.map((row) => row.id));
  for (const row of syncErrorRows) {
    incrementTenantCounts(countsByTenant, row.tenantId, "syncErrorsRedacted");
  }

  const tenants = await listTenantIds();

  await Promise.all(
    tenants.map((tenant) =>
      upsertSystemSetting(tenant.id, operationalRetentionStateKey, {
        lastRunAt: redactedAt,
        limitPerModel,
        policy: operationalRetentionPolicy,
        counts: countsByTenant.get(tenant.id) ?? {}
      })
    )
  );

  return {
    processedAt: redactedAt,
    limitPerModel,
    policy: operationalRetentionPolicy,
    counts: {
      webhookPayloadsRedacted: webhookRows.length,
      syncRunDebugRecordsRedacted: syncRunRows.length,
      auditRawPayloadsRedacted: auditRawIds.length,
      auditDebugSummariesRedacted: auditDebugIds.length,
      conversationTurnsRedacted: conversationRows.length,
      syncErrorsRedacted: syncErrorRows.length
    },
    tenantCount: tenants.length
  };
}
