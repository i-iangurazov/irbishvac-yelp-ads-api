import { describe, expect, it } from "vitest";

import { buildReportDeliveryCsv, buildReportDeliveryEmail } from "@/features/report-delivery/email";
import {
  isReadyForDelivery,
  mapReportStatusToGenerationStatus,
  shouldFanOutLocationDelivery,
  shouldSendAccountDelivery
} from "@/features/report-delivery/logic";
import {
  getReportScheduleDeliveryScopeLabel,
  readLocationRecipientOverridesJson,
  resolveRecipientRoute
} from "@/features/report-delivery/routing";
import { buildReportScheduleRunKey, getLatestScheduleWindow } from "@/features/report-delivery/schedule";
import { reportScheduleFormSchema } from "@/features/report-delivery/schemas";

describe("report delivery helpers", () => {
  it("calculates the latest completed weekly window", () => {
    const window = getLatestScheduleWindow(
      {
        cadence: "WEEKLY",
        timezone: "UTC",
        sendDayOfWeek: 1,
        sendHour: 8,
        sendMinute: 30
      },
      new Date("2026-04-21T10:00:00.000Z")
    );

    expect(window.startDate).toBe("2026-04-13");
    expect(window.endDate).toBe("2026-04-19");
    expect(window.scheduledFor.toISOString()).toBe("2026-04-20T08:30:00.000Z");
  });

  it("falls back to the previous weekly occurrence when the current send time has not passed", () => {
    const window = getLatestScheduleWindow(
      {
        cadence: "WEEKLY",
        timezone: "UTC",
        sendDayOfWeek: 1,
        sendHour: 8,
        sendMinute: 30
      },
      new Date("2026-04-20T07:00:00.000Z")
    );

    expect(window.startDate).toBe("2026-04-06");
    expect(window.endDate).toBe("2026-04-12");
    expect(window.scheduledFor.toISOString()).toBe("2026-04-13T08:30:00.000Z");
  });

  it("calculates the previous full month for monthly schedules", () => {
    const window = getLatestScheduleWindow(
      {
        cadence: "MONTHLY",
        timezone: "UTC",
        sendDayOfMonth: 3,
        sendHour: 9,
        sendMinute: 15
      },
      new Date("2026-04-05T12:00:00.000Z")
    );

    expect(window.startDate).toBe("2026-03-01");
    expect(window.endDate).toBe("2026-03-31");
    expect(window.scheduledFor.toISOString()).toBe("2026-04-03T09:15:00.000Z");
  });

  it("maps report request states into schedule generation states", () => {
    expect(mapReportStatusToGenerationStatus("REQUESTED")).toBe("REQUESTED");
    expect(mapReportStatusToGenerationStatus("PROCESSING")).toBe("PROCESSING");
    expect(mapReportStatusToGenerationStatus("READY")).toBe("READY");
    expect(mapReportStatusToGenerationStatus("FAILED")).toBe("FAILED");
  });

  it("only fans out location delivery from an account run with location rows", () => {
    expect(shouldFanOutLocationDelivery("ACCOUNT", "LOCATION_ONLY", 2)).toBe(true);
    expect(shouldFanOutLocationDelivery("ACCOUNT", "ACCOUNT_AND_LOCATION", 2)).toBe(true);
    expect(shouldFanOutLocationDelivery("ACCOUNT", "ACCOUNT_ONLY", 2)).toBe(false);
    expect(shouldFanOutLocationDelivery("LOCATION", "LOCATION_ONLY", 2)).toBe(false);
    expect(shouldFanOutLocationDelivery("ACCOUNT", "LOCATION_ONLY", 0)).toBe(false);
  });

  it("treats account delivery as optional based on explicit scope", () => {
    expect(shouldSendAccountDelivery("ACCOUNT_ONLY")).toBe(true);
    expect(shouldSendAccountDelivery("ACCOUNT_AND_LOCATION")).toBe(true);
    expect(shouldSendAccountDelivery("LOCATION_ONLY")).toBe(false);
  });

  it("resolves location recipient overrides with account fallback", () => {
    const overrides = readLocationRecipientOverridesJson([
      {
        locationId: "loc_1",
        recipientEmails: ["north@example.com", "ops@example.com"]
      }
    ]);

    expect(resolveRecipientRoute({
      defaultRecipients: ["account@example.com"],
      locationId: "loc_1",
      overrides
    })).toEqual({
      recipientEmails: ["north@example.com", "ops@example.com"],
      routingMode: "LOCATION_OVERRIDE",
      routingLabel: "Location recipient override"
    });

    expect(resolveRecipientRoute({
      defaultRecipients: ["account@example.com"],
      locationId: "loc_2",
      overrides
    })).toEqual({
      recipientEmails: ["account@example.com"],
      routingMode: "LOCATION_FALLBACK",
      routingLabel: "Default account recipients"
    });

    expect(resolveRecipientRoute({
      defaultRecipients: ["account@example.com"],
      locationId: null,
      overrides
    })).toEqual({
      recipientEmails: ["account@example.com"],
      routingMode: "UNKNOWN_LOCATION_FALLBACK",
      routingLabel: "Default account recipients (unknown location)"
    });
  });

  it("labels delivery scope clearly for operators", () => {
    expect(getReportScheduleDeliveryScopeLabel("ACCOUNT_ONLY")).toBe("Account rollup only");
    expect(getReportScheduleDeliveryScopeLabel("LOCATION_ONLY")).toBe("Per location only");
    expect(getReportScheduleDeliveryScopeLabel("ACCOUNT_AND_LOCATION")).toBe("Account and per location");
  });

  it("rejects duplicate location recipient overrides", () => {
    const parsed = reportScheduleFormSchema.safeParse({
      name: "Weekly client report",
      cadence: "WEEKLY",
      deliveryScope: "ACCOUNT_AND_LOCATION",
      timezone: "UTC",
      sendDayOfWeek: 1,
      sendHour: 8,
      sendMinute: 0,
      deliverPerLocation: true,
      isEnabled: true,
      recipientEmails: "owner@example.com",
      locationRecipientOverrides: [
        {
          locationId: "loc_1",
          recipientEmails: "north@example.com"
        },
        {
          locationId: "loc_1",
          recipientEmails: "duplicate@example.com"
        }
      ]
    });

    expect(parsed.success).toBe(false);
  });

  it("treats only READY plus PENDING as deliverable", () => {
    expect(isReadyForDelivery("READY", "PENDING")).toBe(true);
    expect(isReadyForDelivery("REQUESTED", "PENDING")).toBe(false);
    expect(isReadyForDelivery("READY", "FAILED")).toBe(false);
  });

  it("builds stable run keys per schedule window and scope", () => {
    const runKey = buildReportScheduleRunKey({
      scheduleId: "schedule_1",
      scheduledFor: new Date("2026-04-20T08:30:00.000Z"),
      windowStart: new Date("2026-04-13T00:00:00.000Z"),
      windowEnd: new Date("2026-04-19T23:59:00.000Z"),
      scope: "ACCOUNT",
      scopeKey: "account"
    });

    expect(runKey).toContain("schedule_1");
    expect(runKey).toContain("ACCOUNT");
    expect(runKey).toContain("account");
  });

  it("shapes CSV rows with source labels and multiple sections", () => {
    const rows = buildReportDeliveryCsv({
      windowLabel: "Apr 13, 2026 to Apr 19, 2026",
      scopeLabel: "Weekly client report",
      dashboardUrl: "https://example.com/reporting/report_1",
      totals: {
        yelpSpendCents: 120000,
        totalLeads: 10,
        mappedLeads: 8,
        active: 2,
        contacted: 7,
        booked: 4,
        scheduled: 3,
        jobInProgress: 2,
        completed: 2,
        won: 1,
        lost: 1,
        mappingRate: 80,
        bookedRate: 40,
        scheduledRate: 30,
        completionRate: 20,
        winRate: 10,
        closeRate: 20,
        costPerLeadCents: 12000,
        costPerBookedJobCents: 30000,
        costPerCompletedJobCents: 60000
      },
      locationBreakdown: [
        {
          bucketId: "loc_1",
          bucketLabel: "North",
          totalLeads: 6,
          mappedLeads: 5,
          active: 1,
          contacted: 4,
          booked: 2,
          scheduled: 2,
          jobInProgress: 1,
          completed: 1,
          won: 1,
          lost: 0,
          mappingRate: 83.3,
          bookedRate: 33.3,
          scheduledRate: 33.3,
          completionRate: 16.7,
          winRate: 16.7,
          closeRate: 16.7,
          yelpSpendCents: 70000
        }
      ],
      serviceBreakdown: [
        {
          bucketId: "svc_1",
          bucketLabel: "HVAC Repair",
          totalLeads: 5,
          mappedLeads: 4,
          active: 1,
          contacted: 3,
          booked: 2,
          scheduled: 1,
          jobInProgress: 1,
          completed: 1,
          won: 1,
          lost: 0,
          mappingRate: 80,
          bookedRate: 40,
          scheduledRate: 20,
          completionRate: 20,
          winRate: 20,
          closeRate: 20,
          yelpSpendCents: 50000
        }
      ],
      sourceLabels: {
        yelp: "Yelp-native delayed batch metrics",
        internal: "Internal-derived CRM lead and outcome metrics"
      }
    });

    expect(rows.map((row) => row.section)).toEqual(["summary", "location_breakdown", "service_breakdown"]);
    expect(rows[0]).toMatchObject({
      sourceYelp: "Yelp-native delayed batch metrics",
      sourceInternal: "Internal-derived CRM lead and outcome metrics",
      jobInProgress: 2,
      active: 2,
      contacted: 7,
      won: 1,
      lost: 1,
      mappingRatePct: 80,
      derivedCostPerBookedLeadCents: 30000
    });
  });

  it("preserves source boundaries in delivery email copy", () => {
    const email = buildReportDeliveryEmail({
      windowLabel: "Apr 13, 2026 to Apr 19, 2026",
      scopeLabel: "Weekly client report",
      dashboardUrl: "https://example.com/reporting/report_1",
      totals: {
        yelpSpendCents: 120000,
        totalLeads: 10,
        mappedLeads: 8,
        active: 2,
        contacted: 7,
        booked: 4,
        scheduled: 3,
        jobInProgress: 2,
        completed: 2,
        won: 1,
        lost: 1,
        mappingRate: 80,
        bookedRate: 40,
        scheduledRate: 30,
        completionRate: 20,
        winRate: 10,
        closeRate: 20,
        costPerLeadCents: 12000,
        costPerBookedJobCents: 30000,
        costPerCompletedJobCents: 60000
      },
      locationBreakdown: [],
      serviceBreakdown: [],
      sourceLabels: {
        yelp: "Yelp-native delayed batch metrics",
        internal: "Internal-derived CRM lead and outcome metrics"
      }
    });

    expect(email.text).toContain("Yelp-native delayed batch metrics");
    expect(email.text).toContain("Internal-derived CRM lead and outcome metrics");
    expect(email.text).toContain("Active: 2");
    expect(email.text).toContain("Win rate: 10%");
    expect(email.text).toContain("Dashboard link");
    expect(email.html).toContain("Open in dashboard");
  });
});
