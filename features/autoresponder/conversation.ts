import type {
  LeadConversationAutomationMode,
  LeadConversationConfidence,
  LeadConversationDecision,
  LeadConversationIntent,
  LeadConversationStopReason
} from "@prisma/client";

import type { LeadAutomationCandidate } from "@/features/autoresponder/logic";
import type { LeadAutoresponderSettingsValues } from "@/features/autoresponder/schemas";

type LeadConversationEvent = NonNullable<LeadAutomationCandidate["events"]>[number];

export type LeadConversationClassification = {
  messageText: string;
  intent: LeadConversationIntent;
  confidence: LeadConversationConfidence;
  templateKind:
    | "REQUEST_DETAILS"
    | "RECEIVED_UPDATE"
    | "BOOKING_NEXT_STEP"
    | "CANNOT_ESTIMATE";
};

export type LeadConversationDecisionResult = {
  decision: LeadConversationDecision;
  stopReason: LeadConversationStopReason | null;
  shouldCreateIssue: boolean;
};

export function getLeadConversationRolloutState(params: {
  enabled: boolean;
  paused: boolean;
  mode: LeadConversationAutomationMode;
}) {
  if (params.paused) {
    return {
      label: "Paused",
      description: "Conversation automation is paused tenant-wide. New inbound turns stay with operators.",
      pilotLabel: "Paused"
    };
  }

  if (!params.enabled) {
    return {
      label: "Human-only",
      description: "Inbound conversation turns stay with operators unless a business scope enables them.",
      pilotLabel: "Human-only"
    };
  }

  switch (params.mode) {
    case "BOUNDED_AUTO_REPLY":
      return {
        label: "Bounded auto-reply",
        description: "Only approved low-risk inbound intents may auto-send. Everything else routes to review or handoff.",
        pilotLabel: "Auto-reply on"
      };
    case "HUMAN_HANDOFF":
      return {
        label: "Human handoff",
        description: "Conversation automation is on for visibility and audit, but every inbound turn still requires a person.",
        pilotLabel: "Human handoff"
      };
    case "REVIEW_ONLY":
    default:
      return {
        label: "Review-only",
        description: "Safe inbound turns can prepare suggested replies, but a person must still review and send them.",
        pilotLabel: "Review-only"
      };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getStringAtPath(value: unknown, path: readonly string[]) {
  let current: unknown = value;

  for (const key of path) {
    const record = asRecord(current);

    if (!record) {
      return null;
    }

    current = record[key];
  }

  return typeof current === "string" && current.trim().length > 0 ? current.trim() : null;
}

export function extractLeadConversationMessage(payload: unknown) {
  const candidates = [
    ["message"],
    ["text"],
    ["request_content"],
    ["content"],
    ["body"],
    ["data", "message"],
    ["data", "text"],
    ["event", "message"],
    ["event", "text"],
    ["payload", "message"],
    ["payload", "text"],
    ["details", "message"],
    ["details", "text"]
  ] as const;

  for (const path of candidates) {
    const value = getStringAtPath(payload, path);

    if (value) {
      return value;
    }
  }

  return null;
}

export function stripAutomationDisclosure(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .replace(/^\s*\[(?:irbishvac\s+)?automated(?: message| reply)?\]\s*/i, "")
    .replace(/^\s*(?:irbishvac\s+)?automated (?:message|reply) from .*?(?:\n\n|\n|$)/i, "")
    .trim();
}

export function isCustomerConversationEvent(
  event: Pick<LeadConversationEvent, "actorType" | "eventType" | "isReply" | "payloadJson">
) {
  const normalized = event.actorType?.trim().toUpperCase() ?? "";
  const eventType = event.eventType?.trim().toUpperCase() ?? "";

  if (normalized.includes("CONSUMER") || normalized.includes("CUSTOMER") || normalized === "USER") {
    return true;
  }

  if (normalized.includes("BUSINESS") || normalized.includes("PARTNER") || normalized.includes("OWNER")) {
    return false;
  }

  if (
    eventType.includes("BUSINESS") ||
    eventType.includes("OWNER") ||
    eventType.includes("PARTNER") ||
    eventType.includes("OUTBOUND")
  ) {
    return false;
  }

  if (eventType.includes("CONSUMER") || eventType.includes("CUSTOMER") || eventType.includes("INBOUND")) {
    return true;
  }

  if (extractLeadConversationMessage(event.payloadJson)) {
    return true;
  }

  return event.isReply !== true;
}

function isEventNewerThanBoundary(
  event: Pick<LeadConversationEvent, "eventKey" | "occurredAt">,
  boundary: { lastProcessedEventKey?: string | null; lastInboundAt?: Date | null } | null | undefined,
  after?: Date | null
) {
  if (!boundary) {
    return !after || !event.occurredAt || event.occurredAt.getTime() > after.getTime();
  }

  if (boundary.lastProcessedEventKey && event.eventKey && event.eventKey === boundary.lastProcessedEventKey) {
    return false;
  }

  if (boundary.lastInboundAt && event.occurredAt && event.occurredAt.getTime() <= boundary.lastInboundAt.getTime()) {
    return false;
  }

  if (after && event.occurredAt && event.occurredAt.getTime() <= after.getTime()) {
    return false;
  }

  return true;
}

export function findNextInboundConversationEvent(
  lead: Pick<LeadAutomationCandidate, "events" | "conversationAutomationState">,
  sourceEventId?: string | null,
  options?: {
    after?: Date | null;
  }
) {
  const orderedEvents = [...(lead.events ?? [])].sort((left, right) => {
    const leftTime = left.occurredAt?.getTime() ?? 0;
    const rightTime = right.occurredAt?.getTime() ?? 0;
    return leftTime - rightTime;
  });

  if (sourceEventId) {
    const exact = orderedEvents.find(
      (event) =>
        event.externalEventId === sourceEventId &&
        isCustomerConversationEvent(event)
    );

    if (exact && isEventNewerThanBoundary(exact, lead.conversationAutomationState, options?.after ?? null)) {
      return exact;
    }
  }

  return (
    orderedEvents.find(
      (event) =>
        isCustomerConversationEvent(event) &&
        isEventNewerThanBoundary(event, lead.conversationAutomationState, options?.after ?? null)
    ) ?? null
  );
}

function includesAny(text: string, expressions: RegExp[]) {
  return expressions.some((expression) => expression.test(text));
}

export function classifyInboundConversationEvent(event: Pick<LeadConversationEvent, "payloadJson">): LeadConversationClassification | null {
  const messageText = extractLeadConversationMessage(event.payloadJson)?.trim();

  if (!messageText) {
    return null;
  }

  const normalized = messageText.toLowerCase();

  if (
    includesAny(normalized, [
      /\bangry\b/,
      /\bupset\b/,
      /\bfrustrated\b/,
      /\bterrible\b/,
      /\bawful\b/,
      /\bcomplain\b/,
      /\bcomplaint\b/,
      /\bunacceptable\b/,
      /\bscam\b/,
      /\bnot happy\b/,
      /\bthis is ridiculous\b/
    ])
  ) {
    return {
      messageText,
      intent: "COMPLAINT_ESCALATION",
      confidence: "HIGH",
      templateKind: "REQUEST_DETAILS"
    };
  }

  if (includesAny(normalized, [/\bprice\b/, /\bcost\b/, /\bquote\b/, /\bestimate\b/, /\bhow much\b/, /\bpricing\b/])) {
    return {
      messageText,
      intent: "QUOTE_PRICING_REQUEST",
      confidence: "HIGH",
      templateKind: "CANNOT_ESTIMATE"
    };
  }

  if (
    includesAny(normalized, [
      /\bavailable\b/,
      /\bavailability\b/,
      /\bwhen can\b/,
      /\bwhat time\b/,
      /\btoday\b/,
      /\btomorrow\b/,
      /\bthis afternoon\b/,
      /\bthis morning\b/,
      /\barrive\b/,
      /\barrival\b/,
      /\bschedule\b/,
      /\bappointment\b/
    ])
  ) {
    return {
      messageText,
      intent: "AVAILABILITY_TIMING_REQUEST",
      confidence: "HIGH",
      templateKind: "BOOKING_NEXT_STEP"
    };
  }

  if (
    includesAny(normalized, [
      /\bbook\b/,
      /\bmove forward\b/,
      /\bready to\b/,
      /\bset it up\b/,
      /\bnext step\b/,
      /\bcome out\b/
    ])
  ) {
    return {
      messageText,
      intent: "BOOKING_INTENT",
      confidence: "MEDIUM",
      templateKind: "BOOKING_NEXT_STEP"
    };
  }

  if (includesAny(normalized, [/^\s*(thanks|thank you|ok|okay|got it|sounds good|understood)\b/, /\bthanks\b/]) && normalized.length <= 80) {
    return {
      messageText,
      intent: "BASIC_ACKNOWLEDGMENT",
      confidence: "HIGH",
      templateKind: "RECEIVED_UPDATE"
    };
  }

  if (
    includesAny(normalized, [
      /\bphoto\b/,
      /\bpicture\b/,
      /\baddress\b/,
      /\blocated at\b/,
      /\bzip\b/,
      /\bcity\b/,
      /\bunit\b/,
      /\bleaking\b/,
      /\bnot working\b/,
      /\bissue is\b/,
      /\bproblem is\b/
    ]) ||
    normalized.length >= 80
  ) {
    return {
      messageText,
      intent: "MISSING_DETAILS_PROVIDED",
      confidence: normalized.length >= 120 ? "HIGH" : "MEDIUM",
      templateKind: "RECEIVED_UPDATE"
    };
  }

  if (
    includesAny(normalized, [
      /\banything else\b/,
      /\bwhat else\b/,
      /\bdo you need\b/,
      /\bshould i send\b/,
      /\bcan i send\b/,
      /\bdoes this help\b/,
      /\bwill this work\b/,
      /\?\s*$/
    ])
  ) {
    return {
      messageText,
      intent: "SIMPLE_NEXT_STEP_CLARIFICATION",
      confidence: "MEDIUM",
      templateKind: "REQUEST_DETAILS"
    };
  }

  if (normalized.length < 12) {
    return {
      messageText,
      intent: "UNSUPPORTED_AMBIGUOUS",
      confidence: "LOW",
      templateKind: "REQUEST_DETAILS"
    };
  }

  return {
    messageText,
    intent: "UNSUPPORTED_AMBIGUOUS",
    confidence: "MEDIUM",
    templateKind: "REQUEST_DETAILS"
  };
}

export function humanizeLeadConversationMode(mode: LeadConversationAutomationMode) {
  switch (mode) {
    case "BOUNDED_AUTO_REPLY":
      return "Bounded auto-reply";
    case "HUMAN_HANDOFF":
      return "Human handoff";
    case "REVIEW_ONLY":
    default:
      return "Review-only";
  }
}

export function humanizeLeadConversationIntent(intent: LeadConversationIntent) {
  return intent
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function humanizeLeadConversationDecision(decision: LeadConversationDecision) {
  switch (decision) {
    case "AUTO_REPLY":
      return "Auto-replied";
    case "HUMAN_HANDOFF":
      return "Human handoff";
    case "REVIEW_ONLY":
    default:
      return "Review-only";
  }
}

export function humanizeLeadConversationStopReason(reason: LeadConversationStopReason | null | undefined) {
  switch (reason) {
    case "CONVERSATION_DISABLED":
      return "Conversation automation is disabled.";
    case "ROLLOUT_PAUSED":
      return "Conversation automation is paused by the tenant kill switch.";
    case "LIFECYCLE_STOPPED":
      return "The current lifecycle state suppresses conversation automation.";
    case "MODE_REVIEW_ONLY":
      return "This business is set to review-only conversation handling.";
    case "MODE_HUMAN_HANDOFF":
      return "This business requires human handoff for conversation turns.";
    case "INTENT_NOT_ALLOWED":
      return "This intent is not approved for auto-reply.";
    case "LOW_CONFIDENCE":
      return "Automation confidence was too low to act safely.";
    case "MAX_AUTOMATED_TURNS_REACHED":
      return "The thread already reached the automated turn limit.";
    case "HUMAN_TAKEOVER":
      return "A team member already took over the thread.";
    case "CUSTOMER_ESCALATION":
      return "The customer tone or content requires a person.";
    case "PRICING_RISK":
      return "Pricing or quote requests require human review.";
    case "AVAILABILITY_RISK":
      return "Availability or arrival timing requires a person.";
    case "UNCLEAR_SERVICE":
      return "The request is too unclear for safe automation.";
    case "MISSING_THREAD_CONTEXT":
      return "The Yelp thread context is incomplete.";
    case "SEND_FAILED":
      return "The automated reply failed to send.";
    default:
      return "Conversation automation stopped.";
  }
}

function isCriticalIntent(intent: LeadConversationIntent) {
  return (
    intent === "QUOTE_PRICING_REQUEST" ||
    intent === "AVAILABILITY_TIMING_REQUEST" ||
    intent === "COMPLAINT_ESCALATION" ||
    intent === "HUMAN_ONLY"
  );
}

export function decideInboundConversationResponse(params: {
  settings: LeadAutoresponderSettingsValues;
  lead: Pick<LeadAutomationCandidate, "externalConversationId" | "internalStatus" | "conversationActions" | "conversationAutomationState">;
  classification: LeadConversationClassification;
  hasHumanTakeover: boolean;
}) : LeadConversationDecisionResult {
  if (params.settings.conversationGlobalPauseEnabled) {
    return {
      decision: "HUMAN_HANDOFF",
      stopReason: "ROLLOUT_PAUSED",
      shouldCreateIssue: false
    };
  }

  if (!params.settings.conversationAutomationEnabled) {
    return {
      decision: "HUMAN_HANDOFF",
      stopReason: "CONVERSATION_DISABLED",
      shouldCreateIssue: false
    };
  }

  if (!params.lead.externalConversationId) {
    return {
      decision: "HUMAN_HANDOFF",
      stopReason: "MISSING_THREAD_CONTEXT",
      shouldCreateIssue: true
    };
  }

  if (params.hasHumanTakeover) {
    return {
      decision: "HUMAN_HANDOFF",
      stopReason: "HUMAN_TAKEOVER",
      shouldCreateIssue: false
    };
  }

  if (
    (params.lead.conversationAutomationState?.automatedTurnCount ?? 0) >=
    params.settings.conversationMaxAutomatedTurns
  ) {
    return {
      decision: "HUMAN_HANDOFF",
      stopReason: "MAX_AUTOMATED_TURNS_REACHED",
      shouldCreateIssue: params.settings.conversationEscalateToIssueQueue
    };
  }

  if (params.classification.confidence === "LOW") {
    return {
      decision: "HUMAN_HANDOFF",
      stopReason: "LOW_CONFIDENCE",
      shouldCreateIssue: params.settings.conversationEscalateToIssueQueue
    };
  }

  switch (params.classification.intent) {
    case "COMPLAINT_ESCALATION":
      return {
        decision: "HUMAN_HANDOFF",
        stopReason: "CUSTOMER_ESCALATION",
        shouldCreateIssue: params.settings.conversationEscalateToIssueQueue
      };
    case "QUOTE_PRICING_REQUEST":
      return {
        decision: "HUMAN_HANDOFF",
        stopReason: "PRICING_RISK",
        shouldCreateIssue: params.settings.conversationEscalateToIssueQueue
      };
    case "AVAILABILITY_TIMING_REQUEST":
      return {
        decision: "HUMAN_HANDOFF",
        stopReason: "AVAILABILITY_RISK",
        shouldCreateIssue: params.settings.conversationEscalateToIssueQueue
      };
    case "UNSUPPORTED_AMBIGUOUS":
    case "HUMAN_ONLY":
      return {
        decision: "HUMAN_HANDOFF",
        stopReason: "UNCLEAR_SERVICE",
        shouldCreateIssue: params.settings.conversationEscalateToIssueQueue
      };
    default:
      break;
  }

  if (params.settings.conversationMode === "HUMAN_HANDOFF") {
    return {
      decision: "HUMAN_HANDOFF",
      stopReason: "MODE_HUMAN_HANDOFF",
      shouldCreateIssue: false
    };
  }

  if (params.settings.conversationMode === "REVIEW_ONLY") {
    return {
      decision: "REVIEW_ONLY",
      stopReason: "MODE_REVIEW_ONLY",
      shouldCreateIssue: false
    };
  }

  const isAllowedIntent = params.settings.conversationAllowedIntents.includes(params.classification.intent);

  if (isAllowedIntent) {
    return {
      decision: "AUTO_REPLY",
      stopReason: null,
      shouldCreateIssue: false
    };
  }

  if (params.settings.conversationReviewFallbackEnabled && !isCriticalIntent(params.classification.intent)) {
    return {
      decision: "REVIEW_ONLY",
      stopReason: "INTENT_NOT_ALLOWED",
      shouldCreateIssue: false
    };
  }

  return {
    decision: "HUMAN_HANDOFF",
    stopReason: "INTENT_NOT_ALLOWED",
    shouldCreateIssue: params.settings.conversationEscalateToIssueQueue
  };
}
