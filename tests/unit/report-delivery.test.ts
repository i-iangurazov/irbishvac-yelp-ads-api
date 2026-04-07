import { describe, expect, it } from "vitest";

import { buildReportDeliveryCsv, buildReportDeliveryEmail } from "@/features/report-delivery/email";
import {
  isReadyForDelivery,
  mapReportStatusToGenerationStatus,
  shouldFanOutLocationDelivery
} from "@/features/report-delivery/logic";
import { buildReportScheduleRunKey, getLatestScheduleWindow } from "@/features/report-delivery/schedule";

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
    expect(shouldFanOutLocationDelivery("ACCOUNT", true, 2)).toBe(true);
    expect(shouldFanOutLocationDelivery("ACCOUNT", false, 2)).toBe(false);
    expect(shouldFanOutLocationDelivery("LOCATION", true, 2)).toBe(false);
    expect(shouldFanOutLocationDelivery("ACCOUNT", true, 0)).toBe(false);
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
        booked: 4,
        scheduled: 3,
        jobInProgress: 2,
        completed: 2,
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
          booked: 2,
          scheduled: 2,
          jobInProgress: 1,
          completed: 1,
          closeRate: 16.7,
          yelpSpendCents: 70000
        }
      ],
      serviceBreakdown: [
        {
          bucketId: "svc_1",
          bucketLabel: "HVAC Repair",
          totalLeads: 5,
          booked: 2,
          scheduled: 1,
          jobInProgress: 1,
          completed: 1,
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
      jobInProgress: 2
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
        booked: 4,
        scheduled: 3,
        jobInProgress: 2,
        completed: 2,
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
    expect(email.text).toContain("Dashboard link");
    expect(email.html).toContain("Open in dashboard");
  });
});
