import { describe, expect, it } from "vitest";

import { buildCombinedReportPayload } from "@/features/reporting/payloads";

describe("buildCombinedReportPayload", () => {
  it("aggregates totals and decorates rows for multi-business reports", () => {
    const payload = buildCombinedReportPayload({
      results: [
        {
          businessId: "business-1",
          business: { name: "Alpha" },
          payloadJson: {
            totals: {
              impressions: 10,
              clicks: 3
            },
            rows: [{ date: "2026-03-01", impressions: 10 }]
          }
        },
        {
          businessId: "business-2",
          business: { name: "Beta" },
          payloadJson: {
            totals: {
              impressions: 5,
              calls: 2
            },
            rows: [{ date: "2026-03-01", impressions: 5 }]
          }
        }
      ]
    } as never);

    expect(payload.totals).toEqual({
      impressions: 15,
      clicks: 3,
      calls: 2
    });
    expect(payload.rows).toEqual([
      {
        businessId: "business-1",
        businessName: "Alpha",
        date: "2026-03-01",
        impressions: 10
      },
      {
        businessId: "business-2",
        businessName: "Beta",
        date: "2026-03-01",
        impressions: 5
      }
    ]);
  });
});
