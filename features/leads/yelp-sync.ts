import "server-only";

import type { YelpBusinessLeadIdsResponseDto } from "@/lib/yelp/schemas";

import { normalizeLeadSnapshot } from "@/features/leads/normalize";
import {
  findLeadRecordByExternalLeadId,
  upsertLeadEventRecords,
  upsertLeadRecord
} from "@/lib/db/leads-repository";
import type { YelpLeadsClient } from "@/lib/yelp/leads-client";

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
  const lead = await upsertLeadRecord(params.tenantId, params.leadId, {
    businessId: normalized.lead.businessId ?? params.business.id ?? null,
    locationId: existingLead?.locationId ?? params.business.locationId ?? null,
    serviceCategoryId: existingLead?.serviceCategoryId ?? null,
    externalBusinessId: normalized.lead.externalBusinessId ?? null,
    externalConversationId: normalized.lead.externalConversationId ?? null,
    sourceSystem: "YELP",
    customerName: normalized.lead.customerName ?? null,
    customerEmail: normalized.lead.customerEmail ?? null,
    customerPhone: normalized.lead.customerPhone ?? null,
    createdAtYelp: normalized.lead.createdAtYelp,
    latestInteractionAt: normalized.lead.latestInteractionAt ?? null,
    replyState: normalized.lead.replyState,
    readAt: normalized.lead.readAt ?? null,
    repliedAt: normalized.lead.repliedAt ?? null,
    internalStatus: existingLead?.internalStatus ?? "UNMAPPED",
    mappedServiceLabel: existingLead?.mappedServiceLabel ?? null,
    metadataJson: normalized.lead.metadataJson as never,
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
    normalizedEventCount: normalizedEvents.length
  };
}
