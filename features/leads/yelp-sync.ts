import "server-only";

import type { YelpBusinessLeadIdsResponseDto } from "@/lib/yelp/schemas";

import { normalizeLeadSnapshot } from "@/features/leads/normalize";
import {
  findLeadRecordByExternalLeadId,
  upsertLeadEventRecords,
  upsertLeadRecord
} from "@/lib/db/leads-repository";
import type { YelpLeadsClient } from "@/lib/yelp/leads-client";

const phoneSourceRank: Record<string, number> = {
  NONE: 0,
  MASKED: 1,
  TEMPORARY: 2,
  NESTED_DIRECT: 3,
  LEGACY_DIRECT: 4,
  UNMASKED: 5
};

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getMetadataString(value: unknown, key: string) {
  const candidate = asRecord(value)[key];
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : null;
}

function getPhoneSourceRank(source: string | null) {
  return source ? phoneSourceRank[source] ?? 0 : 0;
}

export function extractLeadIdsResponse(payload: YelpBusinessLeadIdsResponseDto) {
  if (Array.isArray(payload)) {
    return {
      leadIds: payload,
      hasMore: false
    };
  }

  return {
    leadIds: payload.lead_ids ?? [],
    hasMore: payload.has_more ?? false
  };
}

export async function syncLeadSnapshotFromYelp(params: {
  tenantId: string;
  business: {
    id?: string | null;
    locationId: string | null;
    encryptedYelpBusinessId: string;
  };
  client: YelpLeadsClient;
  leadId: string;
  receivedAt: Date;
  sourceEventType: string;
  sourceEventId?: string | null;
  sourceInteractionTime?: Date | null;
}) {
  const [leadResponse, leadEventsResponse] = await Promise.all([
    params.client.getLead(params.leadId),
    params.client.getLeadEvents(params.leadId)
  ]);
  const existingLead = await findLeadRecordByExternalLeadId(params.tenantId, params.leadId);
  const normalized = normalizeLeadSnapshot({
    leadId: params.leadId,
    externalBusinessId: params.business.encryptedYelpBusinessId,
    mappedBusinessId: params.business.id ?? null,
    webhookReceivedAt: params.receivedAt,
    webhookUpdate: {
      eventType: params.sourceEventType,
      eventId: params.sourceEventId ?? null,
      leadId: params.leadId,
      interactionTime: params.sourceInteractionTime ?? null,
      raw: {
        lead_id: params.leadId,
        source_event_type: params.sourceEventType
      }
    },
    leadPayload: leadResponse.data,
    leadEventsPayload: leadEventsResponse.data
  });
  const normalizedMetadata = asRecord(normalized.lead.metadataJson);
  const existingMetadata = asRecord(existingLead?.metadataJson);
  const incomingPhoneSource = getMetadataString(normalizedMetadata, "customerPhoneSource");
  const existingPhoneSource = getMetadataString(existingMetadata, "customerPhoneSource");
  const shouldKeepExistingPhone =
    Boolean(existingLead?.customerPhone) &&
    (!normalized.lead.customerPhone || getPhoneSourceRank(existingPhoneSource) > getPhoneSourceRank(incomingPhoneSource));
  const persistedCustomerPhone = shouldKeepExistingPhone
    ? existingLead?.customerPhone ?? null
    : normalized.lead.customerPhone ?? null;
  const phoneMetadata = shouldKeepExistingPhone
    ? {
        customerPhoneSource: existingPhoneSource ?? "UNKNOWN",
        customerPhoneSourcePath: getMetadataString(existingMetadata, "customerPhoneSourcePath"),
        customerPhoneVerifiedDirect: Boolean(asRecord(existingMetadata).customerPhoneVerifiedDirect),
        customerPhoneExpiresAt: getMetadataString(existingMetadata, "customerPhoneExpiresAt"),
        customerPhonePreservedFromPreviousSync: true
      }
    : {};
  const phoneBecameAvailable = Boolean(persistedCustomerPhone && !existingLead?.customerPhone);
  const phoneChanged = Boolean(
    persistedCustomerPhone &&
      existingLead?.customerPhone &&
      persistedCustomerPhone !== existingLead.customerPhone
  );
  const lead = await upsertLeadRecord(params.tenantId, params.leadId, {
    businessId: normalized.lead.businessId ?? params.business.id ?? null,
    locationId: existingLead?.locationId ?? params.business.locationId ?? null,
    serviceCategoryId: existingLead?.serviceCategoryId ?? null,
    externalBusinessId: normalized.lead.externalBusinessId ?? null,
    externalConversationId: normalized.lead.externalConversationId ?? null,
    sourceSystem: "YELP",
    customerName: normalized.lead.customerName ?? null,
    customerEmail: normalized.lead.customerEmail ?? null,
    customerPhone: persistedCustomerPhone,
    createdAtYelp: normalized.lead.createdAtYelp,
    latestInteractionAt: normalized.lead.latestInteractionAt ?? null,
    replyState: normalized.lead.replyState,
    readAt: normalized.lead.readAt ?? null,
    repliedAt: normalized.lead.repliedAt ?? null,
    internalStatus: existingLead?.internalStatus ?? "UNMAPPED",
    mappedServiceLabel: existingLead?.mappedServiceLabel ?? null,
    metadataJson: {
      ...existingMetadata,
      ...normalizedMetadata,
      ...phoneMetadata,
      customerPhoneBecameAvailable: phoneBecameAvailable,
      customerPhoneChanged: phoneChanged,
      customerPhoneLastObservedAt: persistedCustomerPhone ? params.receivedAt.toISOString() : null
    } as never,
    rawSnapshotJson: normalized.lead.rawSnapshotJson as never,
    firstSeenAt: existingLead?.firstSeenAt ?? params.receivedAt,
    lastSyncedAt: params.receivedAt
  });
  const normalizedEvents = await upsertLeadEventRecords(
    params.tenantId,
    lead.id,
    normalized.events.map((event) => ({
      eventKey: event.eventKey,
      externalEventId: event.externalEventId ?? null,
      eventType: event.eventType,
      actorType: event.actorType ?? null,
      occurredAt: event.occurredAt ?? null,
      isRead: event.isRead,
      isReply: event.isReply,
      payloadJson: event.payloadJson
    }))
  );

  return {
    existingLead,
    lead,
    normalizedEventCount: normalizedEvents.length,
    phoneBecameAvailable,
    phoneChanged
  };
}
