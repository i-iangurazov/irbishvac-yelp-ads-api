import type {
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
  customerName: string | null;
  customerEmail: string | null;
  business: { id: string; name: string; location?: { id: string; name: string } | null } | null;
  location: { id: string; name: string } | null;
  serviceCategory: { id: string; name: string } | null;
  mappedServiceLabel: string | null;
  automationAttempts?: Array<{ id: string }>;
};

export type LeadAutomationRuleCandidate = {
  id: string;
  name: string;
  channel: LeadAutomationChannel;
  priority: number;
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

export const leadAutomationChannelOptions = [
  {
    value: "YELP_THREAD",
    label: "Yelp thread"
  },
  {
    value: "EMAIL",
    label: "External email"
  }
] as const;

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

function ruleMatchesLead(lead: LeadAutomationCandidate, rule: LeadAutomationRuleCandidate) {
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
  rules: LeadAutomationRuleCandidate[]
) {
  const matching = rules.filter((rule) => ruleMatchesLead(lead, rule));

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

export function evaluateLeadAutomationEligibility(params: {
  settings: LeadAutoresponderSettingsValues;
  smtpConfigured: boolean;
  lead: LeadAutomationCandidate;
  rules: LeadAutomationRuleCandidate[];
  now?: Date;
}): EligibilityFailure | EligibilitySuccess {
  const existingAttempt = params.lead.automationAttempts?.[0] ?? null;

  if (existingAttempt) {
    return {
      eligible: false,
      skipReason: "DUPLICATE",
      message: "The first-response automation already recorded an attempt for this lead."
    };
  }

  if (!params.settings.isEnabled) {
    return {
      eligible: false,
      skipReason: "AUTORESPONDER_DISABLED",
      message: "Lead autoresponder is disabled for this tenant."
    };
  }

  const rule = selectLeadAutomationRule(params.lead, params.rules);

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
    if (!params.smtpConfigured) {
      return {
        eligible: false,
        skipReason: "CHANNEL_UNSUPPORTED",
        message: "SMTP is not configured for external email delivery.",
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
