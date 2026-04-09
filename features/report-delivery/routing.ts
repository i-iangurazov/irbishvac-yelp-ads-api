import type { ReportScheduleDeliveryScope } from "@prisma/client";

export type LocationRecipientOverride = {
  locationId: string;
  recipientEmails: string[];
};

export type ResolvedRecipientRoute = {
  recipientEmails: string[];
  routingMode: "ACCOUNT_DEFAULT" | "LOCATION_OVERRIDE" | "LOCATION_FALLBACK" | "UNKNOWN_LOCATION_FALLBACK";
  routingLabel: string;
};

export function readLocationRecipientOverridesJson(value: unknown): LocationRecipientOverride[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const locationId = typeof record.locationId === "string" && record.locationId.length > 0 ? record.locationId : null;
    const recipientEmails = Array.isArray(record.recipientEmails)
      ? record.recipientEmails.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
      : [];

    if (!locationId || recipientEmails.length === 0) {
      return [];
    }

    return [
      {
        locationId,
        recipientEmails
      }
    ];
  });
}

export function getReportScheduleDeliveryScopeLabel(scope: ReportScheduleDeliveryScope) {
  switch (scope) {
    case "ACCOUNT_ONLY":
      return "Account rollup only";
    case "LOCATION_ONLY":
      return "Per location only";
    case "ACCOUNT_AND_LOCATION":
      return "Account and per location";
  }
}

export function shouldCreateLocationRuns(
  scheduleScope: ReportScheduleDeliveryScope,
  locationRowCount: number
) {
  return scheduleScope !== "ACCOUNT_ONLY" && locationRowCount > 0;
}

export function shouldSendAccountRun(scheduleScope: ReportScheduleDeliveryScope) {
  return scheduleScope !== "LOCATION_ONLY";
}

export function resolveRecipientRoute(params: {
  defaultRecipients: string[];
  locationId: string | null;
  overrides: LocationRecipientOverride[];
}) : ResolvedRecipientRoute {
  if (!params.locationId) {
    return {
      recipientEmails: params.defaultRecipients,
      routingMode: "UNKNOWN_LOCATION_FALLBACK",
      routingLabel: "Default account recipients (unknown location)"
    };
  }

  const override = params.overrides.find((item) => item.locationId === params.locationId);

  if (override) {
    return {
      recipientEmails: override.recipientEmails,
      routingMode: "LOCATION_OVERRIDE",
      routingLabel: "Location recipient override"
    };
  }

  return {
    recipientEmails: params.defaultRecipients,
    routingMode: "LOCATION_FALLBACK",
    routingLabel: "Default account recipients"
  };
}
