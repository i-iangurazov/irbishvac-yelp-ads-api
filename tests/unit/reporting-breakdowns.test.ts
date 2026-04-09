import { describe, expect, it } from "vitest";

import { buildBreakdownCsvRows, buildReportBreakdown } from "@/features/reporting/breakdowns";

const options = {
  locations: [
    { id: "loc_1", name: "North" },
    { id: "loc_2", name: "South" }
  ],
  serviceCategories: [
    { id: "svc_1", name: "HVAC Repair", slug: "hvac-repair" },
    { id: "svc_2", name: "Plumbing", slug: "plumbing" }
  ]
} as const;

describe("report breakdown aggregation", () => {
  it("groups by location and keeps unknown buckets visible", () => {
    const breakdown = buildReportBreakdown({
      view: "location",
      filters: {
        from: "2026-04-01",
        to: "2026-04-07",
        locationId: undefined,
        serviceCategoryId: undefined
      },
      leads: [
        {
          createdAtYelp: new Date("2026-04-02T09:00:00.000Z"),
          internalStatus: "BOOKED",
          locationId: "loc_1",
          crmLeadMappings: [{ state: "MANUAL_OVERRIDE" }]
        },
        {
          createdAtYelp: new Date("2026-04-03T09:00:00.000Z"),
          internalStatus: "COMPLETED",
          business: { locationId: "loc_2" },
          crmLeadMappings: [{ state: "MATCHED" }]
        },
        {
          createdAtYelp: new Date("2026-04-04T09:00:00.000Z"),
          internalStatus: "UNMAPPED",
          crmLeadMappings: [{ state: "UNRESOLVED" }]
        }
      ],
      results: [
        {
          business: { locationId: "loc_1" },
          payloadJson: {
            rows: [{ date: "2026-04-02", adSpendCents: 12000 }]
          }
        },
        {
          business: { locationId: null },
          payloadJson: {
            rows: [{ date: "2026-04-03", adSpendCents: 3000 }]
          }
        }
      ],
      options
    });

    expect(breakdown.totals).toMatchObject({
      totalLeads: 3,
      mappedLeads: 2,
      active: 0,
      contacted: 0,
      booked: 1,
      scheduled: 0,
      jobInProgress: 0,
      completed: 1,
      won: 0,
      lost: 0,
      mappingRate: 66.7,
      bookedRate: 33.3,
      completionRate: 33.3,
      yelpSpendCents: 15000
    });
    expect(breakdown.rows.map((row) => row.bucketLabel)).toEqual(["North", "South", "Unknown location"]);
    expect(breakdown.rows.find((row) => row.bucketLabel === "Unknown location")).toMatchObject({
      totalLeads: 1,
      yelpSpendCents: 3000
    });
  });

  it("groups by service, supports mapped service spend, and calculates cost metrics", () => {
    const breakdown = buildReportBreakdown({
      view: "service",
      filters: {
        from: "2026-04-01",
        to: "2026-04-07",
        locationId: undefined,
        serviceCategoryId: undefined
      },
      leads: [
        {
          createdAtYelp: new Date("2026-04-02T09:00:00.000Z"),
          internalStatus: "BOOKED",
          serviceCategoryId: "svc_1",
          crmLeadMappings: [{ state: "MANUAL_OVERRIDE" }]
        },
        {
          createdAtYelp: new Date("2026-04-03T09:00:00.000Z"),
          internalStatus: "COMPLETED",
          serviceCategoryId: "svc_1",
          crmLeadMappings: [{ state: "MATCHED" }]
        },
        {
          createdAtYelp: new Date("2026-04-04T09:00:00.000Z"),
          internalStatus: "SCHEDULED",
          serviceCategoryId: null,
          crmLeadMappings: [{ state: "UNRESOLVED" }]
        }
      ],
      results: [
        {
          business: { locationId: "loc_1" },
          payloadJson: {
            rows: [
              { date: "2026-04-02", adSpendCents: 15000, serviceCategorySlug: "hvac-repair" },
              { date: "2026-04-03", adSpendCents: 5000 }
            ]
          }
        }
      ],
      options
    });

    expect(breakdown.rows.map((row) => row.bucketLabel)).toEqual(["HVAC Repair", "Unknown service"]);
    expect(breakdown.rows[0]).toMatchObject({
      totalLeads: 2,
      mappedLeads: 2,
      active: 0,
      contacted: 0,
      booked: 1,
      completed: 1,
      won: 0,
      lost: 0,
      mappingRate: 100,
      bookedRate: 50,
      completionRate: 50,
      yelpSpendCents: 15000,
      closeRate: 50,
      costPerLeadCents: 7500,
      costPerBookedJobCents: 15000,
      costPerCompletedJobCents: 15000
    });
    expect(breakdown.rows[1]).toMatchObject({
      totalLeads: 1,
      scheduled: 1,
      jobInProgress: 0,
      yelpSpendCents: 5000
    });
  });

  it("applies location and service filters before grouping", () => {
    const breakdown = buildReportBreakdown({
      view: "service",
      filters: {
        from: "2026-04-01",
        to: "2026-04-07",
        locationId: "loc_1",
        serviceCategoryId: "svc_1"
      },
      leads: [
        {
          createdAtYelp: new Date("2026-04-02T09:00:00.000Z"),
          internalStatus: "BOOKED",
          locationId: "loc_1",
          serviceCategoryId: "svc_1",
          crmLeadMappings: [{ state: "MANUAL_OVERRIDE" }]
        },
        {
          createdAtYelp: new Date("2026-04-03T09:00:00.000Z"),
          internalStatus: "COMPLETED",
          locationId: "loc_2",
          serviceCategoryId: "svc_1",
          crmLeadMappings: [{ state: "MATCHED" }]
        }
      ],
      results: [
        {
          business: { locationId: "loc_1" },
          payloadJson: {
            rows: [{ date: "2026-04-02", adSpendCents: 8000, serviceCategorySlug: "hvac-repair" }]
          }
        },
        {
          business: { locationId: "loc_2" },
          payloadJson: {
            rows: [{ date: "2026-04-03", adSpendCents: 9000, serviceCategorySlug: "hvac-repair" }]
          }
        }
      ],
      options
    });

    expect(breakdown.rows).toHaveLength(1);
    expect(breakdown.rows[0]).toMatchObject({
      bucketLabel: "HVAC Repair",
      totalLeads: 1,
      yelpSpendCents: 8000
    });
  });

  it("shapes filtered breakdown rows for CSV export", () => {
    const breakdown = buildReportBreakdown({
      view: "location",
      filters: {
        from: "2026-04-01",
        to: "2026-04-07",
        locationId: undefined,
        serviceCategoryId: undefined
      },
      leads: [
        {
          createdAtYelp: new Date("2026-04-02T09:00:00.000Z"),
          internalStatus: "COMPLETED",
          locationId: "loc_1",
          crmLeadMappings: [{ state: "MATCHED" }]
        }
      ],
      results: [
        {
          business: { locationId: "loc_1" },
          payloadJson: {
            rows: [{ date: "2026-04-02", adSpendCents: 10000 }]
          }
        }
      ],
      options
    });

    expect(buildBreakdownCsvRows(breakdown)).toEqual([
      {
        bucket: "North",
        yelpLeadIntakeCount: 1,
        partnerMappedLeads: 1,
        partnerActive: 0,
        partnerContacted: 0,
        partnerBooked: 0,
        partnerScheduled: 0,
        partnerJobInProgress: 0,
        partnerCompleted: 1,
        partnerWon: 0,
        partnerLost: 0,
        derivedMappingRatePct: 100,
        derivedBookedRatePct: 0,
        derivedScheduledRatePct: 0,
        derivedCompletionRatePct: 100,
        derivedWinRatePct: 0,
        derivedCloseRatePct: 100,
        yelpSpendCents: 10000,
        leadSharePct: 100,
        spendSharePct: 100,
        derivedCostPerLeadCents: 10000,
        derivedCostPerBookedLeadCents: null,
        derivedCostPerCompletedJobCents: 10000
      }
    ]);
  });
});
