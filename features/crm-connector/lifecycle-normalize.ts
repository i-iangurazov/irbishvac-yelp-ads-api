import type { InternalLeadStatus } from "@prisma/client";

type ServiceTitanLifecycleSource = "LEAD" | "JOB" | "APPOINTMENT";

type ServiceTitanLifecycleSignal = {
  externalStatusEventId: string;
  source: ServiceTitanLifecycleSource;
  status: InternalLeadStatus;
  occurredAt: Date;
  substatus: string | null;
  payloadJson: Record<string, unknown>;
};

function normalizeStatusText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function parseOptionalDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function includesOneOf(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

export function mapServiceTitanLeadStatus(status: string | null | undefined): InternalLeadStatus | null {
  const normalized = normalizeStatusText(status);

  if (!normalized) {
    return null;
  }

  if (includesOneOf(normalized, ["lost", "dismiss", "junk", "spam"])) {
    return "CLOSED_LOST";
  }

  if (includesOneOf(normalized, ["won", "booked", "converted"])) {
    return "BOOKED";
  }

  if (includesOneOf(normalized, ["contacted", "reached"])) {
    return "CONTACTED";
  }

  if (includesOneOf(normalized, ["active", "open", "new", "submitted"])) {
    return "ACTIVE";
  }

  return null;
}

export function mapServiceTitanJobStatus(status: string | null | undefined): InternalLeadStatus | null {
  const normalized = normalizeStatusText(status);

  if (!normalized) {
    return null;
  }

  if (includesOneOf(normalized, ["cancel"])) {
    return "CANCELED";
  }

  if (includesOneOf(normalized, ["complete", "done", "close"])) {
    return "COMPLETED";
  }

  if (includesOneOf(normalized, ["progress", "working", "arrived", "dispatch", "en route", "enroute"])) {
    return "JOB_IN_PROGRESS";
  }

  if (includesOneOf(normalized, ["schedule", "assigned", "confirmed"])) {
    return "SCHEDULED";
  }

  return "BOOKED";
}

export function mapServiceTitanAppointmentStatus(status: string | null | undefined): InternalLeadStatus | null {
  const normalized = normalizeStatusText(status);

  if (!normalized) {
    return null;
  }

  if (includesOneOf(normalized, ["cancel"])) {
    return "CANCELED";
  }

  if (includesOneOf(normalized, ["complete", "done"])) {
    return "COMPLETED";
  }

  if (includesOneOf(normalized, ["arrived", "working", "progress", "in_progress", "in progress"])) {
    return "JOB_IN_PROGRESS";
  }

  if (includesOneOf(normalized, ["dispatch", "scheduled", "confirmed", "assigned", "booked"])) {
    return "SCHEDULED";
  }

  return null;
}

export function buildServiceTitanLeadSignal(input: {
  leadId: string;
  upstreamStatus?: string | null;
  createdOn?: string | null;
  modifiedOn?: string | null;
  summary?: string | null;
}): ServiceTitanLifecycleSignal | null {
  const mappedStatus = mapServiceTitanLeadStatus(input.upstreamStatus);

  if (!mappedStatus) {
    return null;
  }

  const occurredAt = parseOptionalDate(input.modifiedOn) ?? parseOptionalDate(input.createdOn) ?? new Date();
  const statusKey = normalizeStatusText(input.upstreamStatus) || mappedStatus.toLowerCase();

  return {
    externalStatusEventId: `servicetitan:lead:${input.leadId}:${statusKey}:${occurredAt.toISOString()}`,
    source: "LEAD",
    status: mappedStatus,
    occurredAt,
    substatus: input.upstreamStatus ?? null,
    payloadJson: {
      connector: "ServiceTitan",
      lifecycleSource: "LEAD",
      upstreamLeadId: input.leadId,
      upstreamStatus: input.upstreamStatus ?? null,
      summary: input.summary ?? null,
      occurredAt: occurredAt.toISOString()
    }
  };
}

export function buildServiceTitanJobSignal(input: {
  jobId: string;
  upstreamStatus?: string | null;
  createdOn?: string | null;
  modifiedOn?: string | null;
  completedOn?: string | null;
  canceledOn?: string | null;
}): ServiceTitanLifecycleSignal | null {
  const mappedStatus = mapServiceTitanJobStatus(input.upstreamStatus);

  if (!mappedStatus) {
    return null;
  }

  const occurredAt =
    parseOptionalDate(input.completedOn) ??
    parseOptionalDate(input.canceledOn) ??
    parseOptionalDate(input.modifiedOn) ??
    parseOptionalDate(input.createdOn) ??
    new Date();
  const statusKey = normalizeStatusText(input.upstreamStatus) || mappedStatus.toLowerCase();

  return {
    externalStatusEventId: `servicetitan:job:${input.jobId}:${statusKey}:${occurredAt.toISOString()}`,
    source: "JOB",
    status: mappedStatus,
    occurredAt,
    substatus: input.upstreamStatus ?? null,
    payloadJson: {
      connector: "ServiceTitan",
      lifecycleSource: "JOB",
      upstreamJobId: input.jobId,
      upstreamStatus: input.upstreamStatus ?? null,
      occurredAt: occurredAt.toISOString()
    }
  };
}

export function buildServiceTitanAppointmentSignal(appointments: Array<{
  id: string;
  status?: string | null;
  createdOn?: string | null;
  modifiedOn?: string | null;
  startsOn?: string | null;
  dispatchedOn?: string | null;
  arrivedOn?: string | null;
  completedOn?: string | null;
  canceledOn?: string | null;
}>): ServiceTitanLifecycleSignal | null {
  const candidates = appointments
    .map((appointment) => {
      const mappedStatus =
        mapServiceTitanAppointmentStatus(appointment.status) ??
        (appointment.completedOn
          ? ("COMPLETED" as const)
          : appointment.canceledOn
            ? ("CANCELED" as const)
            : appointment.arrivedOn
              ? ("JOB_IN_PROGRESS" as const)
              : appointment.dispatchedOn || appointment.startsOn
                ? ("SCHEDULED" as const)
                : null);

      if (!mappedStatus) {
        return null;
      }

      const occurredAt =
        parseOptionalDate(appointment.completedOn) ??
        parseOptionalDate(appointment.canceledOn) ??
        parseOptionalDate(appointment.arrivedOn) ??
        parseOptionalDate(appointment.dispatchedOn) ??
        parseOptionalDate(appointment.startsOn) ??
        parseOptionalDate(appointment.modifiedOn) ??
        parseOptionalDate(appointment.createdOn) ??
        new Date();
      const statusKey = normalizeStatusText(appointment.status) || mappedStatus.toLowerCase();

      return {
        externalStatusEventId: `servicetitan:appointment:${appointment.id}:${statusKey}:${occurredAt.toISOString()}`,
        source: "APPOINTMENT" as const,
        status: mappedStatus,
        occurredAt,
        substatus: appointment.status ?? null,
        payloadJson: {
          connector: "ServiceTitan",
          lifecycleSource: "APPOINTMENT",
          upstreamAppointmentId: appointment.id,
          upstreamStatus: appointment.status ?? null,
          occurredAt: occurredAt.toISOString()
        }
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());

  return candidates[0] ?? null;
}

export function dedupeServiceTitanLifecycleSignals(signals: Array<ServiceTitanLifecycleSignal | null | undefined>) {
  const deduped = new Map<string, ServiceTitanLifecycleSignal>();

  for (const signal of signals) {
    if (!signal) {
      continue;
    }

    deduped.set(signal.externalStatusEventId, signal);
  }

  return [...deduped.values()].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
}

export function getServiceTitanLifecycleSyncLabel(action: string | null | undefined) {
  if (action === "servicetitan_lifecycle_sync") {
    return "ServiceTitan lifecycle sync";
  }

  if (action === "servicetitan.business_units.sync") {
    return "ServiceTitan location catalog sync";
  }

  if (action === "servicetitan.categories.sync") {
    return "ServiceTitan service catalog sync";
  }

  return "CRM enrichment";
}
