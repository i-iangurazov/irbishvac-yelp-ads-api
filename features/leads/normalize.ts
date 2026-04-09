import { createHash } from "node:crypto";

import type {
  CrmLeadMappingState,
  InternalLeadStatus,
  LeadAutomationAttemptStatus,
  LeadAutomationSkipReason,
  RecordSourceSystem,
  SyncRunStatus,
  YelpLeadReplyState
} from "@prisma/client";

import { buildLeadAutomationSummary } from "@/features/autoresponder/normalize";
import { deriveCrmHealth, getMappingReferenceLabel } from "@/features/crm-enrichment/normalize";

type UnknownRecord = Record<string, unknown>;

export type ParsedLeadWebhookUpdate = {
  eventType: string;
  eventId?: string | null;
  leadId: string;
  interactionTime?: Date | null;
  raw: UnknownRecord;
};

export type NormalizedLeadEventRecord = {
  eventKey: string;
  externalEventId?: string | null;
  eventType: string;
  actorType?: string | null;
  occurredAt?: Date | null;
  isRead: boolean;
  isReply: boolean;
  payloadJson: unknown;
};

export type NormalizedLeadRecord = {
  businessId?: string | null;
  externalBusinessId?: string | null;
  externalConversationId?: string | null;
  sourceSystem: "YELP";
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  createdAtYelp: Date;
  latestInteractionAt?: Date | null;
  replyState: YelpLeadReplyState;
  readAt?: Date | null;
  repliedAt?: Date | null;
  internalStatus: "UNMAPPED";
  mappedServiceLabel?: string | null;
  metadataJson: unknown;
  rawSnapshotJson: unknown;
  lastSyncedAt: Date;
};

export type LeadListEntry = {
  id: string;
  externalLeadId: string;
  externalBusinessId: string | null;
  mappedBusinessName: string | null;
  mappedBusinessId: string | null;
  locationLabel: string | null;
  serviceLabel: string | null;
  customerLabel: string;
  createdAtYelp: Date;
  latestActivityAt: Date | null;
  lastSyncedAt: Date | null;
  replyState: YelpLeadReplyState;
  processingStatus: SyncRunStatus | "NOT_RECEIVED";
  processingError: string | null;
  mappingState: CrmLeadMappingState | "UNRESOLVED";
  mappingReference: string;
  internalStatus: InternalLeadStatus;
  internalStatusSource: RecordSourceSystem | null;
  automationStatus: LeadAutomationAttemptStatus | "NOT_TRIGGERED";
  automationMessage: string;
  crmHealthStatus: ReturnType<typeof deriveCrmHealth>["status"];
  crmHealthMessage: string;
  requiresAttention: boolean;
  attentionReasons: string[];
  openIssueCount: number;
  primaryIssue: {
    id: string;
    issueType: string;
    severity: string;
    summary: string;
  } | null;
};

type NormalizedLeadSnapshotParams = {
  leadId: string;
  externalBusinessId: string;
  mappedBusinessId?: string | null;
  webhookReceivedAt: Date;
  webhookUpdate: ParsedLeadWebhookUpdate;
  leadPayload: unknown;
  leadEventsPayload: unknown;
};

type LeadTimelineItem = {
  id: string;
  eventType: string;
  actorType: string | null;
  occurredAt: Date | null;
  isRead: boolean;
  isReply: boolean;
  payloadJson: unknown;
};

type LeadConversationActionTimelineItem = {
  id: string;
  actionType: string;
  actionLabel: string;
  initiator: string;
  initiatorLabel: string;
  channel: string;
  channelLabel: string;
  status: string;
  deliveryNote: string | null;
  recipient: string | null;
  renderedSubject: string | null;
  renderedBody: string | null;
  providerMessageId: string | null;
  providerStatus: string | null;
  providerMetadataJson: unknown;
  errorSummary: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  automationRuleName: string | null;
  automationTemplateName: string | null;
};

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function getStringValue(record: UnknownRecord | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function humanizeConversationActionType(actionType: string) {
  switch (actionType) {
    case "SEND_MESSAGE":
      return "Reply sent";
    case "MARK_READ":
      return "Marked read on Yelp";
    case "MARK_REPLIED":
      return "Marked replied on Yelp";
    default:
      return actionType.replaceAll("_", " ").toLowerCase();
  }
}

function humanizeConversationInitiator(initiator: string) {
  switch (initiator) {
    case "AUTOMATION":
      return "Automation";
    case "OPERATOR":
      return "Operator";
    default:
      return "System";
  }
}

function humanizeConversationChannel(channel: string) {
  switch (channel) {
    case "YELP_THREAD":
      return "Yelp thread";
    case "EMAIL":
      return "Yelp masked email";
    case "PHONE":
      return "Phone / SMS";
    default:
      return channel.replaceAll("_", " ").toLowerCase();
  }
}

function getNestedValue(record: UnknownRecord | null, path: string[]) {
  let current: unknown = record;

  for (const key of path) {
    const next = asRecord(current);

    if (!next || !(key in next)) {
      return undefined;
    }

    current = next[key];
  }

  return current;
}

function getString(record: UnknownRecord | null, paths: string[][]) {
  for (const path of paths) {
    const value = getNestedValue(record, path);

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getBoolean(record: UnknownRecord | null, paths: string[][]) {
  for (const path of paths) {
    const value = getNestedValue(record, path);

    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pickLatestDate(values: Array<Date | null | undefined>) {
  const normalized = values.filter((value): value is Date => Boolean(value));

  if (normalized.length === 0) {
    return null;
  }

  return normalized.reduce((latest, current) => (current.getTime() > latest.getTime() ? current : latest));
}

function getDate(record: UnknownRecord | null, paths: string[][]) {
  for (const path of paths) {
    const value = getNestedValue(record, path);

    if (typeof value === "string") {
      const parsed = parseDate(value);

      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

function unwrapLeadRecord(payload: unknown) {
  const record = asRecord(payload);

  if (!record) {
    return null;
  }

  const nestedLead = asRecord(record.lead);

  if (nestedLead) {
    return nestedLead;
  }

  const nestedData = asRecord(record.data);

  if (nestedData) {
    return nestedData;
  }

  return record;
}

function extractEventsArray(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = asRecord(payload);

  if (!record) {
    return [];
  }

  const candidates = [record.events, record.lead_events, record.interaction_events, record.messages, record.updates];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function fingerprint(value: unknown) {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

function normalizeReplyState(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.toUpperCase();

  if (normalized.includes("REPL")) {
    return "REPLIED" as const;
  }

  if (normalized.includes("READ")) {
    return "READ" as const;
  }

  if (normalized.includes("UNREAD")) {
    return "UNREAD" as const;
  }

  return null;
}

export function buildWebhookEventKey(businessId: string, update: ParsedLeadWebhookUpdate, index = 0) {
  const timestamp = update.interactionTime ? update.interactionTime.toISOString() : null;

  return [
    "leads_event",
    businessId,
    update.leadId,
    update.eventType,
    update.eventId ?? timestamp ?? `idx-${index}:${fingerprint(update.raw)}`
  ].join(":");
}

export function buildLeadEventKey(leadId: string, rawEvent: unknown, index = 0) {
  const record = asRecord(rawEvent);
  const externalEventId = getString(record, [["event_id"], ["id"], ["interaction_id"]]);
  const eventType = getString(record, [["event_type"], ["type"]]) ?? "UNKNOWN_EVENT";
  const occurredAt =
    getDate(record, [["interaction_time"], ["time_created"], ["created_at"], ["time"], ["occurred_at"]])?.toISOString() ?? null;

  return externalEventId
    ? `${leadId}:${externalEventId}`
    : `${leadId}:${eventType}:${occurredAt ?? `idx-${index}`}:${fingerprint(rawEvent)}`;
}

export function normalizeLeadEvents(leadId: string, payload: unknown) {
  const deduped = new Map<string, NormalizedLeadEventRecord>();

  extractEventsArray(payload).forEach((entry, index) => {
    const record = asRecord(entry);
    const eventType = getString(record, [["event_type"], ["type"]]) ?? "UNKNOWN_EVENT";
    const externalEventId = getString(record, [["event_id"], ["id"], ["interaction_id"]]);
    const actorType = getString(record, [["actor_type"], ["sender_type"], ["user_type"], ["source"]]);
    const occurredAt = getDate(record, [["interaction_time"], ["time_created"], ["created_at"], ["time"], ["occurred_at"]]);
    const upperEventType = eventType.toUpperCase();
    const isRead = getBoolean(record, [["is_read"], ["read"], ["flags", "is_read"]]) ?? upperEventType.includes("READ");
    const isReply =
      getBoolean(record, [["is_reply"], ["replied"], ["flags", "is_reply"]]) ??
      (upperEventType.includes("REPL") || upperEventType.includes("OUTSIDE_YELP_REPLY"));
    const eventKey = buildLeadEventKey(leadId, entry, index);

    deduped.set(eventKey, {
      eventKey,
      externalEventId,
      eventType,
      actorType,
      occurredAt,
      isRead,
      isReply,
      payloadJson: entry
    });
  });

  return [...deduped.values()].sort((left, right) => {
    const leftTime = left.occurredAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightTime = right.occurredAt?.getTime() ?? Number.MAX_SAFE_INTEGER;

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.eventKey.localeCompare(right.eventKey);
  });
}

export function normalizeLeadSnapshot(params: NormalizedLeadSnapshotParams) {
  const leadRecord = unwrapLeadRecord(params.leadPayload);
  const events = normalizeLeadEvents(params.leadId, params.leadEventsPayload);
  const explicitCreatedAt = getDate(leadRecord, [["time_created"], ["created_at"], ["created"]]);
  const explicitLatestActivity = getDate(leadRecord, [["last_activity_time"], ["latest_interaction_at"], ["interaction_time"], ["updated_at"]]);
  const customerName =
    getString(leadRecord, [["customer_name"], ["consumer_name"], ["customer", "name"], ["consumer", "name"], ["user", "name"]]) ??
    null;
  const customerEmail =
    getString(leadRecord, [["customer_email"], ["temporary_email_address"], ["customer", "email"], ["consumer", "email"], ["user", "email"]]) ??
    null;
  const customerPhone =
    getString(
      leadRecord,
      [["customer_phone"], ["masked_phone_number"], ["customer", "phone"], ["consumer", "phone"], ["user", "phone"], ["consumer", "masked_phone_number"]]
    ) ?? null;
  const readAt =
    getDate(leadRecord, [["read_at"], ["last_read_at"]]) ??
    [...events].reverse().find((event) => event.isRead)?.occurredAt ??
    null;
  const repliedAt =
    getDate(leadRecord, [["replied_at"], ["last_replied_at"]]) ??
    [...events].reverse().find((event) => event.isReply)?.occurredAt ??
    null;
  const explicitReplyState = normalizeReplyState(getString(leadRecord, [["reply_state"], ["replyState"], ["status"]]));
  const explicitIsReplied = getBoolean(leadRecord, [["is_replied"]]);
  const explicitIsRead = getBoolean(leadRecord, [["is_read"]]);
  const earliestEventTime = events[0]?.occurredAt ?? null;
  const latestEventTime = [...events].reverse().find((event) => event.occurredAt)?.occurredAt ?? null;
  const createdAtYelp = explicitCreatedAt ?? earliestEventTime ?? params.webhookUpdate.interactionTime ?? params.webhookReceivedAt;
  const latestInteractionAt =
    pickLatestDate([explicitLatestActivity, latestEventTime, params.webhookUpdate.interactionTime]) ?? createdAtYelp;
  const replyState: YelpLeadReplyState =
    explicitReplyState ??
    (explicitIsReplied || repliedAt ? "REPLIED" : explicitIsRead || readAt ? "READ" : createdAtYelp ? "UNREAD" : "UNKNOWN");

  const lead: NormalizedLeadRecord = {
    businessId: params.mappedBusinessId ?? null,
    externalBusinessId: params.externalBusinessId,
    externalConversationId:
      getString(leadRecord, [["conversation_id"], ["conversationId"], ["conversation", "id"]]) ?? null,
    sourceSystem: "YELP",
    customerName,
    customerEmail,
    customerPhone,
    createdAtYelp,
    latestInteractionAt,
    replyState,
    readAt,
    repliedAt,
    internalStatus: "UNMAPPED",
    mappedServiceLabel: null,
    metadataJson: {
      webhookEventType: params.webhookUpdate.eventType,
      webhookEventId: params.webhookUpdate.eventId ?? null,
      webhookInteractionTime: params.webhookUpdate.interactionTime?.toISOString() ?? null,
      normalizedEventCount: events.length
    },
    rawSnapshotJson: params.leadPayload,
    lastSyncedAt: params.webhookReceivedAt
  };

  return {
    lead,
    events
  };
}

export function buildLeadListEntry(lead: {
  id: string;
  externalLeadId: string;
  externalBusinessId: string | null;
  customerName: string | null;
  createdAtYelp: Date;
  latestInteractionAt: Date | null;
  lastSyncedAt?: Date | null;
  replyState: YelpLeadReplyState;
  business?: { id: string; name: string; location?: { id: string; name: string } | null } | null;
  location?: { id: string; name: string } | null;
  serviceCategory?: { id: string; name: string } | null;
  webhookEvents?: Array<{ status: SyncRunStatus; errorJson?: unknown | null }>;
  crmLeadMappings?: Array<{
    state: CrmLeadMappingState;
    sourceSystem: RecordSourceSystem;
    externalCrmLeadId?: string | null;
    externalOpportunityId?: string | null;
    externalJobId?: string | null;
    issueSummary?: string | null;
    matchedAt?: Date | null;
    lastSyncedAt?: Date | null;
    updatedAt?: Date | null;
  }>;
  crmStatusEvents?: Array<{
    status: InternalLeadStatus;
    sourceSystem: RecordSourceSystem;
  }>;
  automationAttempts?: Array<{
    cadence?: "INITIAL" | "FOLLOW_UP_24H" | "FOLLOW_UP_7D" | null;
    status: LeadAutomationAttemptStatus;
    recipient?: string | null;
    errorSummary?: string | null;
    skipReason?: LeadAutomationSkipReason | null;
    template?: { name: string } | null;
    dueAt?: Date | null;
  }>;
  syncRuns?: Array<{
    status: SyncRunStatus;
    errorSummary?: string | null;
    errors?: Array<{ message: string }>;
  }>;
  internalStatus: InternalLeadStatus;
}): LeadListEntry {
  const latestWebhook = lead.webhookEvents?.[0] ?? null;
  const mapping = lead.crmLeadMappings?.[0] ?? null;
  const latestInternalStatus = lead.crmStatusEvents?.[0] ?? null;
  const latestAutomationAttempt = lead.automationAttempts?.[0] ?? null;
  const errorJson = asRecord(latestWebhook?.errorJson ?? null);
  const processingError =
    getString(errorJson, [["message"], ["error", "message"]]) ??
    getString(errorJson, [["details", "message"]]) ??
    null;
  const crmHealth = deriveCrmHealth({
    mapping,
    recentSyncRuns: lead.syncRuns?.map((run) => ({
      status: run.status,
      errorSummary: run.errorSummary ?? run.errors?.[0]?.message ?? null
    }))
  });
  const automationSummary = buildLeadAutomationSummary(latestAutomationAttempt);
  const attentionReasons = [
    ...(latestWebhook && ["FAILED", "PARTIAL"].includes(latestWebhook.status)
      ? [processingError ?? `Intake ${latestWebhook.status === "FAILED" ? "failed" : "is partial"}`]
      : []),
    ...(!mapping || mapping.state === "UNRESOLVED" ? ["Needs CRM mapping"] : []),
    ...(mapping?.state === "CONFLICT" ? ["CRM mapping conflict"] : []),
    ...(mapping?.state === "ERROR" ? ["CRM mapping error"] : []),
    ...(["FAILED", "CONFLICT", "ERROR", "STALE"].includes(crmHealth.status) ? [crmHealth.message] : []),
    ...(automationSummary.status === "FAILED" ? [automationSummary.message] : [])
  ];

  return {
    id: lead.id,
    externalLeadId: lead.externalLeadId,
    externalBusinessId: lead.externalBusinessId,
    mappedBusinessName: lead.business?.name ?? null,
    mappedBusinessId: lead.business?.id ?? null,
    locationLabel: lead.location?.name ?? lead.business?.location?.name ?? null,
    serviceLabel: lead.serviceCategory?.name ?? null,
    customerLabel: lead.customerName ?? lead.externalLeadId,
    createdAtYelp: lead.createdAtYelp,
    latestActivityAt: lead.latestInteractionAt ?? null,
    lastSyncedAt: lead.lastSyncedAt ?? null,
    replyState: lead.replyState,
    processingStatus: latestWebhook?.status ?? (lead.lastSyncedAt ? "COMPLETED" : "NOT_RECEIVED"),
    processingError,
    mappingState: mapping?.state ?? "UNRESOLVED",
    mappingReference: mapping ? getMappingReferenceLabel(mapping) : "No CRM entity linked",
    internalStatus: lead.internalStatus,
    internalStatusSource: latestInternalStatus?.sourceSystem ?? null,
    automationStatus: automationSummary.status,
    automationMessage: automationSummary.message,
    crmHealthStatus: crmHealth.status,
    crmHealthMessage: crmHealth.message,
    requiresAttention: attentionReasons.length > 0,
    attentionReasons,
    openIssueCount: 0,
    primaryIssue: null
  } satisfies LeadListEntry;
}

export function buildLeadTimeline(
  events: Array<{
    eventKey: string;
    eventType: string;
    actorType: string | null;
    occurredAt: Date | null;
    isRead: boolean;
    isReply: boolean;
    payloadJson: unknown;
    createdAt?: Date | null;
  }>
) {
  return [...events]
    .sort((left, right) => {
      const leftTime = (left.occurredAt ?? left.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTime = (right.occurredAt ?? right.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;

      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      return left.eventKey.localeCompare(right.eventKey);
    })
    .map(
      (event) =>
        ({
          id: event.eventKey,
          eventType: event.eventType,
          actorType: event.actorType,
          occurredAt: event.occurredAt,
          isRead: event.isRead,
          isReply: event.isReply,
          payloadJson: event.payloadJson
        }) satisfies LeadTimelineItem
    );
}

export function buildLeadConversationActionTimeline(
  actions: Array<{
    id: string;
    actionType: string;
    initiator: string;
    channel: string;
    status: string;
    recipient: string | null;
    renderedSubject: string | null;
    renderedBody: string | null;
    providerMessageId: string | null;
    providerStatus: string | null;
    providerMetadataJson: unknown;
    errorSummary: string | null;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    automationAttempt?: {
      rule?: { name: string } | null;
      template?: { name: string } | null;
    } | null;
  }>
) {
  return [...actions]
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map((action) => {
      const providerMetadata = asRecord(action.providerMetadataJson);
      const deliveryChannel =
        getStringValue(providerMetadata, "deliveryChannel") ?? action.channel;
      const fallbackFrom = getStringValue(providerMetadata, "fallbackFrom");
      const refreshWarning = getStringValue(providerMetadata, "refreshWarning");
      const replyType = getStringValue(providerMetadata, "replyType");
      const deliveryNotes = [
        fallbackFrom ? `Fallback from ${humanizeConversationChannel(fallbackFrom)}.` : null,
        replyType === "PHONE" ? "Marked replied after phone or SMS follow-up outside Yelp." : null,
        replyType === "EMAIL" && action.actionType === "MARK_REPLIED"
          ? "Marked replied after Yelp masked email follow-up outside the Yelp thread."
          : null,
        refreshWarning ?? null
      ].filter(Boolean);

      return {
        id: action.id,
        actionType: action.actionType,
        actionLabel: humanizeConversationActionType(action.actionType),
        initiator: action.initiator,
        initiatorLabel: humanizeConversationInitiator(action.initiator),
        channel: action.channel,
        channelLabel: humanizeConversationChannel(deliveryChannel),
        status: action.status,
        deliveryNote: deliveryNotes.length > 0 ? deliveryNotes.join(" ") : null,
        recipient: action.recipient,
        renderedSubject: action.renderedSubject,
        renderedBody: action.renderedBody,
        providerMessageId: action.providerMessageId,
        providerStatus: action.providerStatus,
        providerMetadataJson: action.providerMetadataJson,
        errorSummary: action.errorSummary,
        createdAt: action.createdAt,
        startedAt: action.startedAt,
        completedAt: action.completedAt,
        automationRuleName: action.automationAttempt?.rule?.name ?? null,
        automationTemplateName: action.automationAttempt?.template?.name ?? null
      } satisfies LeadConversationActionTimelineItem;
    });
}
