import type { LeadAutomationAttemptStatus, LeadAutomationSkipReason } from "@prisma/client";

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getDeliveredChannelLabel(providerMetadataJson: unknown, requestedChannel: string | null) {
  const record = asRecord(providerMetadataJson);
  const deliveredChannel =
    typeof record?.deliveryChannel === "string"
      ? record.deliveryChannel
      : typeof requestedChannel === "string"
        ? requestedChannel
        : null;

  if (deliveredChannel === "YELP_THREAD") {
    return "Yelp thread";
  }

  if (deliveredChannel === "EMAIL") {
    return "External email";
  }

  return null;
}

function humanizeSkipReason(reason: LeadAutomationSkipReason | null) {
  switch (reason) {
    case "AUTORESPONDER_DISABLED":
      return "Autoresponder disabled";
    case "NO_MATCHING_RULE":
      return "No matching rule";
    case "TEMPLATE_DISABLED":
      return "Template disabled";
    case "MISSING_CONTACT":
      return "Missing customer contact";
    case "OUTSIDE_WORKING_HOURS":
      return "Outside working hours";
    case "CHANNEL_UNSUPPORTED":
      return "Channel unsupported";
    case "DUPLICATE":
      return "Duplicate prevented";
    default:
      return null;
  }
}

export function buildLeadAutomationSummary(
  attempt:
    | {
        status: LeadAutomationAttemptStatus;
        recipient?: string | null;
        errorSummary?: string | null;
        skipReason?: LeadAutomationSkipReason | null;
        template?: { name: string } | null;
        channel?: string | null;
        providerMetadataJson?: unknown;
      }
    | null
) {
  if (!attempt) {
    return {
      status: "NOT_TRIGGERED" as const,
      message: "No first-response attempt recorded yet."
    };
  }

  if (attempt.status === "FAILED") {
    return {
      status: attempt.status,
      message: attempt.errorSummary ?? "Delivery failed."
    };
  }

  if (attempt.status === "SKIPPED") {
    return {
      status: attempt.status,
      message: humanizeSkipReason(attempt.skipReason ?? null) ?? "Delivery skipped."
    };
  }

  if (attempt.status === "SENT") {
    const deliveredChannel = getDeliveredChannelLabel(
      attempt.providerMetadataJson ?? null,
      attempt.channel ?? null
    );

    return {
      status: attempt.status,
      message:
        deliveredChannel === "Yelp thread"
          ? "Posted in Yelp thread."
          : attempt.recipient
            ? `Sent by email to ${attempt.recipient}`
            : deliveredChannel
              ? `${deliveredChannel} sent.`
              : "Message sent."
    };
  }

  return {
    status: attempt.status,
    message: attempt.template?.name ? `Using ${attempt.template.name}` : "Delivery pending."
  };
}

export function buildLeadAutomationHistory(
  attempts: Array<{
    id: string;
    status: LeadAutomationAttemptStatus;
    skipReason: LeadAutomationSkipReason | null;
    channel: string | null;
    recipient: string | null;
    renderedSubject: string | null;
    renderedBody: string | null;
    providerMessageId: string | null;
    providerStatus: string | null;
    providerMetadataJson: unknown;
    errorSummary: string | null;
    triggeredAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    template?: { id: string; name: string } | null;
    rule?: {
      id: string;
      name: string;
      location?: { id: string; name: string } | null;
      serviceCategory?: { id: string; name: string } | null;
    } | null;
  }>
) {
  return [...attempts]
    .sort((left, right) => left.triggeredAt.getTime() - right.triggeredAt.getTime())
    .map((attempt) => ({
      id: attempt.id,
      status: attempt.status,
      skipReason: attempt.skipReason,
      skipReasonLabel: humanizeSkipReason(attempt.skipReason),
      channel: attempt.channel,
      recipient: attempt.recipient,
      renderedSubject: attempt.renderedSubject,
      renderedBody: attempt.renderedBody,
      providerMessageId: attempt.providerMessageId,
      providerStatus: attempt.providerStatus,
      providerMetadataJson: attempt.providerMetadataJson,
      errorSummary: attempt.errorSummary,
      deliveryChannelLabel: getDeliveredChannelLabel(
        attempt.providerMetadataJson,
        attempt.channel
      ),
      triggeredAt: attempt.triggeredAt,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      templateName: attempt.template?.name ?? null,
      ruleName: attempt.rule?.name ?? null,
      scopeLabel:
        attempt.rule?.serviceCategory?.name || attempt.rule?.location?.name
          ? [attempt.rule?.location?.name, attempt.rule?.serviceCategory?.name].filter(Boolean).join(" • ")
          : "Account-wide"
    }));
}
