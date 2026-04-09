import type {
  InternalLeadStatus,
  LeadAutomationCadence,
  LeadAutomationChannel,
  LeadAutomationSkipReason,
  RecordSourceSystem
} from "@prisma/client";

import type { LeadAutoresponderSettingsValues } from "@/features/autoresponder/schemas";

export type LeadAutomationVariableBag = {
  customer_name: string;
  business_name: string;
  location_name: string;
  service_type: string;
  lead_reference: string;
};

export type LeadAutomationCandidate = {
  id: string;
  externalLeadId: string;
  externalConversationId?: string | null;
  customerName: string | null;
  customerEmail: string | null;
  business: { id: string; name: string; location?: { id: string; name: string } | null } | null;
  location: { id: string; name: string } | null;
  serviceCategory: { id: string; name: string } | null;
  mappedServiceLabel: string | null;
  internalStatus: InternalLeadStatus;
  automationAttempts?: Array<{
    id: string;
    cadence?: LeadAutomationCadence | null;
    status?: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
    triggeredAt?: Date;
    dueAt?: Date | null;
    completedAt?: Date | null;
  }>;
  events?: Array<{
    eventType: string;
    actorType?: string | null;
    occurredAt?: Date | null;
    isReply?: boolean;
  }>;
  conversationActions?: Array<{
    actionType: "SEND_MESSAGE" | "MARK_READ" | "MARK_REPLIED";
    initiator: "AUTOMATION" | "OPERATOR" | "SYSTEM";
    status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
    createdAt: Date;
    completedAt?: Date | null;
  }>;
};

export type LeadAutomationRuleCandidate = {
  id: string;
  name: string;
  channel: LeadAutomationChannel;
  cadence: LeadAutomationCadence;
  priority: number;
  businessId: string | null;
  onlyDuringWorkingHours: boolean;
  timezone: string | null;
  workingDaysJson: unknown;
  startMinute: number | null;
  endMinute: number | null;
  locationId: string | null;
  serviceCategoryId: string | null;
  template: {
    id: string;
    name: string;
    isEnabled: boolean;
    subjectTemplate: string | null;
    bodyTemplate: string;
    sourceSystem: RecordSourceSystem;
  };
};

type EligibilityFailure = {
  eligible: false;
  skipReason: LeadAutomationSkipReason;
  message: string;
  rule?: LeadAutomationRuleCandidate | null;
};

type EligibilitySuccess = {
  eligible: true;
  rule: LeadAutomationRuleCandidate;
  recipient: string | null;
};

const lifecycleStopStatuses = new Set<InternalLeadStatus>([
  "BOOKED",
  "SCHEDULED",
  "JOB_IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
  "CLOSED_WON",
  "CLOSED_LOST",
  "LOST"
]);

export const leadAutomationChannelOptions = [
  {
    value: "YELP_THREAD",
    label: "Yelp thread"
  },
  {
    value: "EMAIL",
    label: "Yelp masked email fallback"
  }
] as const;

export function humanizeLeadAutomationCadence(cadence: LeadAutomationCadence | null | undefined) {
  switch (cadence) {
    case "FOLLOW_UP_24H":
      return "24-hour follow-up";
    case "FOLLOW_UP_7D":
      return "Following-week follow-up";
    case "INITIAL":
    default:
      return "Initial response";
  }
}

function startsWithAutomatedDisclosure(value: string) {
  return /^\s*(?:\[automated(?: message| reply)?\]|automated message|automated reply|automated response)/i.test(value);
}

export function applyLeadAutomationDisclosure(params: {
  channel: LeadAutomationChannel;
  subject: string;
  body: string;
  businessName?: string | null;
}) {
  const businessLabel = params.businessName?.trim() || "our team";
  const bodyDisclosure = `Automated message from ${businessLabel} via Yelp - a team member may follow up with more details.`;
  const nextBody = startsWithAutomatedDisclosure(params.body)
    ? params.body
    : `${bodyDisclosure}\n\n${params.body}`;

  if (params.channel !== "EMAIL") {
    return {
      subject: params.subject,
      body: nextBody
    };
  }

  const nextSubject = startsWithAutomatedDisclosure(params.subject)
    ? params.subject
    : `[Automated message] ${params.subject}`;

  return {
    subject: nextSubject,
    body: nextBody
  };
}

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function asNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is number => Number.isInteger(item) && item >= 0 && item <= 6);
}

function getLocalTimeParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return {
    weekday: weekdayLabels.indexOf(weekday as (typeof weekdayLabels)[number]),
    minuteOfDay: hour * 60 + minute
  };
}

export function formatMinuteOfDay(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Not set";
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatWorkingDayLabels(days: number[]) {
  if (days.length === 7) {
    return "Every day";
  }

  return days
    .sort((left, right) => left - right)
    .map((day) => weekdayLabels[day] ?? `Day ${day}`)
    .join(", ");
}

export function renderLeadAutomationTemplate(
  template: string | null | undefined,
  variables: LeadAutomationVariableBag
) {
  if (!template) {
    return "";
  }

  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, token: string) => {
    const key = token.toLowerCase() as keyof LeadAutomationVariableBag;
    return variables[key] ?? "";
  });
}

export function buildLeadAutomationVariables(lead: LeadAutomationCandidate): LeadAutomationVariableBag {
  return {
    customer_name: lead.customerName?.trim() || "there",
    business_name: lead.business?.name ?? "our team",
    location_name: lead.location?.name ?? lead.business?.location?.name ?? "your area",
    service_type: lead.serviceCategory?.name ?? lead.mappedServiceLabel ?? "your request",
    lead_reference: lead.externalLeadId
  };
}

export function isWithinWorkingHours(
  rule: Pick<
    LeadAutomationRuleCandidate,
    "onlyDuringWorkingHours" | "timezone" | "workingDaysJson" | "startMinute" | "endMinute"
  >,
  now = new Date()
) {
  if (!rule.onlyDuringWorkingHours) {
    return true;
  }

  if (!rule.timezone || rule.startMinute === null || rule.endMinute === null) {
    return false;
  }

  const allowedDays = asNumberArray(rule.workingDaysJson);

  if (allowedDays.length === 0) {
    return false;
  }

  const local = getLocalTimeParts(now, rule.timezone);

  return (
    allowedDays.includes(local.weekday) &&
    local.minuteOfDay >= rule.startMinute &&
    local.minuteOfDay < rule.endMinute
  );
}

export function getNextWorkingWindowStart(
  rule: Pick<
    LeadAutomationRuleCandidate,
    "onlyDuringWorkingHours" | "timezone" | "workingDaysJson" | "startMinute" | "endMinute"
  >,
  now = new Date()
) {
  if (!rule.onlyDuringWorkingHours) {
    return now;
  }

  if (!rule.timezone || rule.startMinute === null || rule.endMinute === null) {
    return null;
  }

  const allowedDays = asNumberArray(rule.workingDaysJson);

  if (allowedDays.length === 0) {
    return null;
  }

  const candidate = new Date(now.getTime() + 60_000);
  candidate.setUTCSeconds(0, 0);
  const maxMinutesToScan = 14 * 24 * 60;

  for (let minute = 0; minute < maxMinutesToScan; minute += 1) {
    if (isWithinWorkingHours(rule, candidate)) {
      return new Date(candidate);
    }

    candidate.setTime(candidate.getTime() + 60_000);
  }

  return null;
}

function ruleMatchesLead(lead: LeadAutomationCandidate, rule: LeadAutomationRuleCandidate) {
  if (rule.businessId && rule.businessId !== lead.business?.id) {
    return false;
  }

  if (rule.locationId && rule.locationId !== lead.location?.id && rule.locationId !== lead.business?.location?.id) {
    return false;
  }

  if (rule.serviceCategoryId && rule.serviceCategoryId !== lead.serviceCategory?.id) {
    return false;
  }

  return true;
}

export function selectLeadAutomationRule(
  lead: LeadAutomationCandidate,
  rules: LeadAutomationRuleCandidate[],
  cadence: LeadAutomationCadence = "INITIAL"
) {
  const matching = rules.filter((rule) => rule.cadence === cadence && ruleMatchesLead(lead, rule));

  return matching.sort((left, right) => {
    const leftSpecificity = Number(Boolean(left.locationId)) + Number(Boolean(left.serviceCategoryId));
    const rightSpecificity = Number(Boolean(right.locationId)) + Number(Boolean(right.serviceCategoryId));

    if (leftSpecificity !== rightSpecificity) {
      return rightSpecificity - leftSpecificity;
    }

    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return left.name.localeCompare(right.name);
  })[0] ?? null;
}

export function isLeadAutomationCadenceEnabled(
  settings: Pick<
    LeadAutoresponderSettingsValues,
    "followUp24hEnabled" | "followUp7dEnabled"
  >,
  cadence: LeadAutomationCadence
) {
  if (cadence === "FOLLOW_UP_24H") {
    return settings.followUp24hEnabled;
  }

  if (cadence === "FOLLOW_UP_7D") {
    return settings.followUp7dEnabled;
  }

  return true;
}

export function getLeadAutomationCadenceDelayMs(
  settings: Pick<
    LeadAutoresponderSettingsValues,
    "followUp24hDelayHours" | "followUp7dDelayDays"
  >,
  cadence: LeadAutomationCadence
) {
  if (cadence === "FOLLOW_UP_24H") {
    return settings.followUp24hDelayHours * 60 * 60 * 1000;
  }

  if (cadence === "FOLLOW_UP_7D") {
    return settings.followUp7dDelayDays * 24 * 60 * 60 * 1000;
  }

  return 0;
}

function isCustomerActor(actorType: string | null | undefined) {
  const normalized = actorType?.trim().toUpperCase();

  if (!normalized) {
    return false;
  }

  return normalized.includes("CONSUMER") || normalized.includes("CUSTOMER") || normalized === "USER";
}

function getReferenceTime(date: Date | null | undefined) {
  return date ? date.getTime() : null;
}

export function getLatestSuccessfulAutomationAt(lead: LeadAutomationCandidate) {
  return (
    lead.automationAttempts
      ?.filter((attempt) => attempt.status === "SENT")
      .map((attempt) => attempt.completedAt ?? attempt.triggeredAt ?? null)
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null
  );
}

export function hasCustomerReplySince(lead: LeadAutomationCandidate, since: Date | null) {
  const referenceTime = getReferenceTime(since);

  return (
    lead.events?.some((event) => {
      const occurredAt = getReferenceTime(event.occurredAt);

      if (occurredAt === null) {
        return false;
      }

      if (referenceTime !== null && occurredAt <= referenceTime) {
        return false;
      }

      return isCustomerActor(event.actorType ?? null);
    }) ?? false
  );
}

export function hasHumanTakeoverSince(lead: LeadAutomationCandidate, since: Date | null) {
  const referenceTime = getReferenceTime(since);

  return (
    lead.conversationActions?.some((action) => {
      if (action.initiator !== "OPERATOR" || action.status !== "SENT") {
        return false;
      }

      if (!["SEND_MESSAGE", "MARK_REPLIED"].includes(action.actionType)) {
        return false;
      }

      const actionTime = getReferenceTime(action.completedAt ?? action.createdAt);

      if (actionTime === null) {
        return false;
      }

      return referenceTime === null || actionTime > referenceTime;
    }) ?? false
  );
}

export function shouldStopForLifecycle(status: InternalLeadStatus) {
  return lifecycleStopStatuses.has(status);
}

export function evaluateLeadAutomationEligibility(params: {
  settings: LeadAutoresponderSettingsValues;
  smtpConfigured: boolean;
  lead: LeadAutomationCandidate;
  rules: LeadAutomationRuleCandidate[];
  cadence?: LeadAutomationCadence;
  now?: Date;
}): EligibilityFailure | EligibilitySuccess {
  const cadence = params.cadence ?? "INITIAL";
  const existingAttempt =
    params.lead.automationAttempts?.find((attempt) => (attempt.cadence ?? "INITIAL") === cadence) ?? null;

  if (existingAttempt) {
    return {
      eligible: false,
      skipReason: "DUPLICATE",
      message: `${humanizeLeadAutomationCadence(cadence)} already recorded an automation attempt for this lead.`
    };
  }

  if (!params.settings.isEnabled) {
    return {
      eligible: false,
      skipReason: "AUTORESPONDER_DISABLED",
      message: "Lead autoresponder is disabled for this tenant."
    };
  }

  if (cadence === "INITIAL") {
    if (hasHumanTakeoverSince(params.lead, null)) {
      return {
        eligible: false,
        skipReason: "HUMAN_TAKEOVER",
        message: "A team member already took over this conversation."
      };
    }

    if (shouldStopForLifecycle(params.lead.internalStatus)) {
      return {
        eligible: false,
        skipReason: "LIFECYCLE_STOPPED",
        message: "The current partner lifecycle state suppresses the initial autoresponder."
      };
    }
  }

  const rule = selectLeadAutomationRule(params.lead, params.rules, cadence);

  if (!rule) {
    return {
      eligible: false,
      skipReason: "NO_MATCHING_RULE",
      message: "No enabled lead automation rule matched this lead."
    };
  }

  if (!rule.template.isEnabled) {
    return {
      eligible: false,
      skipReason: "TEMPLATE_DISABLED",
      message: `Template ${rule.template.name} is disabled.`,
      rule
    };
  }

  if (rule.channel === "EMAIL") {
    if (!params.settings.emailFallbackEnabled) {
      return {
        eligible: false,
        skipReason: "CHANNEL_UNSUPPORTED",
        message: "Masked-email fallback is disabled for this autoresponder scope.",
        rule
      };
    }

    if (!params.smtpConfigured) {
      return {
        eligible: false,
        skipReason: "CHANNEL_UNSUPPORTED",
        message: "SMTP is not configured for Yelp masked-email fallback delivery.",
        rule
      };
    }

    if (!params.lead.customerEmail) {
      return {
        eligible: false,
        skipReason: "MISSING_CONTACT",
        message: "Yelp did not provide a masked email address for this lead.",
        rule
      };
    }
  }

  if (!isWithinWorkingHours(rule, params.now)) {
    return {
      eligible: false,
      skipReason: "OUTSIDE_WORKING_HOURS",
      message: "The matching automation rule only sends during configured working hours.",
      rule
    };
  }

  return {
    eligible: true,
    rule,
    recipient: rule.channel === "EMAIL" ? (params.lead.customerEmail as string) : null
  };
}

export function evaluateLeadAutomationFollowUpEligibility(params: {
  settings: LeadAutoresponderSettingsValues;
  lead: LeadAutomationCandidate;
  rules: LeadAutomationRuleCandidate[];
  cadence: Exclude<LeadAutomationCadence, "INITIAL">;
  currentAttemptId?: string | null;
  now?: Date;
}): EligibilityFailure | EligibilitySuccess {
  if (!params.settings.isEnabled) {
    return {
      eligible: false,
      skipReason: "AUTORESPONDER_DISABLED",
      message: "Lead autoresponder is disabled for this scope."
    };
  }

  if (!isLeadAutomationCadenceEnabled(params.settings, params.cadence)) {
    return {
      eligible: false,
      skipReason: "FOLLOW_UP_DISABLED",
      message: `${humanizeLeadAutomationCadence(params.cadence)} is disabled for this scope.`
    };
  }

  const existingAttempt =
    params.lead.automationAttempts?.find(
      (attempt) =>
        (attempt.cadence ?? "INITIAL") === params.cadence &&
        attempt.id !== params.currentAttemptId
    ) ?? null;

  if (existingAttempt) {
    return {
      eligible: false,
      skipReason: "DUPLICATE",
      message: `${humanizeLeadAutomationCadence(params.cadence)} already has an attempt recorded for this lead.`
    };
  }

  if (!params.lead.externalConversationId) {
    return {
      eligible: false,
      skipReason: "MISSING_THREAD_CONTEXT",
      message: "Yelp thread context is missing, so the follow-up cannot post safely."
    };
  }

  const latestSuccessfulAutomationAt = getLatestSuccessfulAutomationAt(params.lead);

  if (!latestSuccessfulAutomationAt) {
    return {
      eligible: false,
      skipReason: "MISSING_THREAD_CONTEXT",
      message: "No earlier automated thread reply exists to follow up on."
    };
  }

  if (hasCustomerReplySince(params.lead, latestSuccessfulAutomationAt)) {
    return {
      eligible: false,
      skipReason: "CUSTOMER_REPLIED",
      message: "The customer already replied after the last automated message."
    };
  }

  if (hasHumanTakeoverSince(params.lead, latestSuccessfulAutomationAt)) {
    return {
      eligible: false,
      skipReason: "HUMAN_TAKEOVER",
      message: "A team member already took over this conversation."
    };
  }

  if (shouldStopForLifecycle(params.lead.internalStatus)) {
    return {
      eligible: false,
      skipReason: "LIFECYCLE_STOPPED",
      message: "The current partner lifecycle state suppresses automated follow-up."
    };
  }

  const rule = selectLeadAutomationRule(params.lead, params.rules, params.cadence);

  if (!rule) {
    return {
      eligible: false,
      skipReason: "NO_MATCHING_RULE",
      message: `No enabled ${humanizeLeadAutomationCadence(params.cadence).toLowerCase()} rule matched this lead.`
    };
  }

  if (!rule.template.isEnabled) {
    return {
      eligible: false,
      skipReason: "TEMPLATE_DISABLED",
      message: `Template ${rule.template.name} is disabled.`,
      rule
    };
  }

  if (rule.channel !== "YELP_THREAD") {
    return {
      eligible: false,
      skipReason: "CHANNEL_UNSUPPORTED",
      message: `${humanizeLeadAutomationCadence(params.cadence)} must stay in the Yelp thread.`,
      rule
    };
  }

  if (!isWithinWorkingHours(rule, params.now)) {
    return {
      eligible: false,
      skipReason: "OUTSIDE_WORKING_HOURS",
      message: "The matching follow-up rule only sends during configured working hours.",
      rule
    };
  }

  return {
    eligible: true,
    rule,
    recipient: null
  };
}
