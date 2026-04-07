import { describe, expect, it } from "vitest";

import { buildLeadTimeline } from "@/features/leads/normalize";
import {
  buildInternalStatusTimeline,
  buildLeadConversionMetrics,
  deriveCrmHealth,
  isResolvedCrmMappingState
} from "@/features/crm-enrichment/normalize";

describe("CRM enrichment helpers", () => {
  it("treats matched and manual override states as resolved mappings", () => {
    expect(isResolvedCrmMappingState("MATCHED")).toBe(true);
    expect(isResolvedCrmMappingState("MANUAL_OVERRIDE")).toBe(true);
    expect(isResolvedCrmMappingState("UNRESOLVED")).toBe(false);
  });

  it("marks an unresolved lead without sync failures as unresolved", () => {
    const health = deriveCrmHealth({
      mapping: {
        state: "UNRESOLVED",
        sourceSystem: "INTERNAL",
        matchedAt: null,
        lastSyncedAt: null,
        updatedAt: new Date("2026-04-01T09:00:00.000Z"),
        issueSummary: null
      },
      recentSyncRuns: []
    });

    expect(health.status).toBe("UNRESOLVED");
  });

  it("marks a manual override as current when there are no sync failures", () => {
    const health = deriveCrmHealth({
      mapping: {
        state: "MANUAL_OVERRIDE",
        sourceSystem: "INTERNAL",
        matchedAt: new Date("2026-04-01T09:00:00.000Z"),
        lastSyncedAt: new Date("2026-04-01T09:00:00.000Z"),
        updatedAt: new Date("2026-04-01T09:00:00.000Z"),
        issueSummary: "Operator-linked after phone verification."
      },
      recentSyncRuns: []
    });

    expect(health.status).toBe("CURRENT");
    expect(health.message).toContain("manual override");
  });

  it("surfaces mapping conflicts clearly", () => {
    const health = deriveCrmHealth({
      mapping: {
        state: "CONFLICT",
        sourceSystem: "CRM",
        matchedAt: null,
        lastSyncedAt: new Date("2026-04-01T09:00:00.000Z"),
        updatedAt: new Date("2026-04-01T09:00:00.000Z"),
        issueSummary: "CRM lead crm-123 is already linked elsewhere."
      },
      recentSyncRuns: []
    });

    expect(health.status).toBe("CONFLICT");
    expect(health.message).toContain("crm-123");
  });

  it("marks stale CRM mappings when sync freshness falls behind", () => {
    const health = deriveCrmHealth({
      mapping: {
        state: "MATCHED",
        sourceSystem: "CRM",
        matchedAt: new Date("2026-03-20T09:00:00.000Z"),
        lastSyncedAt: new Date("2026-03-20T09:00:00.000Z"),
        updatedAt: new Date("2026-03-20T09:00:00.000Z"),
        issueSummary: null
      },
      recentSyncRuns: [],
      now: new Date("2026-04-03T09:00:00.000Z")
    });

    expect(health.status).toBe("STALE");
  });

  it("orders internal lifecycle events chronologically", () => {
    const timeline = buildInternalStatusTimeline([
      {
        id: "crm-status-2",
        status: "SCHEDULED",
        sourceSystem: "CRM",
        occurredAt: new Date("2026-04-01T10:00:00.000Z"),
        payloadJson: {}
      },
      {
        id: "crm-status-1",
        status: "BOOKED",
        sourceSystem: "INTERNAL",
        occurredAt: new Date("2026-04-01T09:00:00.000Z"),
        payloadJson: {}
      }
    ]);

    expect(timeline.map((item) => item.status)).toEqual(["BOOKED", "SCHEDULED"]);
  });

  it("keeps Yelp-native and internal timelines separate", () => {
    const yelpTimeline = buildLeadTimeline([
      {
        eventKey: "lead_1:evt_1",
        eventType: "NEW_EVENT",
        actorType: "CONSUMER",
        occurredAt: new Date("2026-04-01T09:00:00.000Z"),
        isRead: false,
        isReply: false,
        payloadJson: {}
      }
    ]);
    const internalTimeline = buildInternalStatusTimeline([
      {
        id: "crm-status-1",
        status: "CONTACTED",
        sourceSystem: "INTERNAL",
        occurredAt: new Date("2026-04-01T09:30:00.000Z"),
        payloadJson: {}
      }
    ]);

    expect(yelpTimeline[0]).toHaveProperty("eventType", "NEW_EVENT");
    expect((yelpTimeline[0] as Record<string, unknown>).status).toBeUndefined();
    expect(internalTimeline[0]).toHaveProperty("status", "CONTACTED");
    expect((internalTimeline[0] as Record<string, unknown>).eventType).toBeUndefined();
  });

  it("derives internal conversion metrics from current lead outcomes", () => {
    const metrics = buildLeadConversionMetrics([
      {
        internalStatus: "BOOKED",
        crmLeadMappings: [{ state: "MANUAL_OVERRIDE" }]
      },
      {
        internalStatus: "COMPLETED",
        crmLeadMappings: [{ state: "MATCHED" }]
      },
      {
        internalStatus: "UNMAPPED",
        crmLeadMappings: [{ state: "UNRESOLVED" }]
      },
      {
        internalStatus: "SCHEDULED",
        crmLeadMappings: []
      }
    ]);

    expect(metrics).toEqual({
      totalLeads: 4,
      mappedLeads: 2,
      bookedLeads: 1,
      scheduledJobs: 1,
      completedJobs: 1,
      closeRate: 25
    });
  });
});
