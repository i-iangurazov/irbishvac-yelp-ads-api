import { describe, expect, it } from "vitest";

import {
  getPacificMtdDateRange,
  getProgramMtdSpendCents,
  getProgramSpendState,
  inferProgramCampaignLayer,
} from "@/features/ads-programs/metrics";

const augustNow = new Date("2026-08-24T18:00:00.000Z");

describe("Yelp program metrics", () => {
  it("does not mislabel Program List ad_cost as MTD", () => {
    const program = {
      budgetCents: 6_000_000,
      configurationJson: {},
      summaryJson: {
        program_metrics: {
          ad_cost: 986_760,
          currency: "USD",
          fee_period: "CALENDAR_MONTH",
        },
      },
      currency: "USD",
      lastSyncedAt: new Date("2026-08-24T17:00:00.000Z"),
    };

    expect(getProgramMtdSpendCents(program)).toBeNull();
    expect(getProgramSpendState(program, augustNow)).toMatchObject({
      amountCents: 986_760,
      mtdAmountCents: null,
      status: "current",
      periodLabel: "Yelp fee period: CALENDAR_MONTH",
    });
    expect(getProgramSpendState(program, augustNow).warning).toContain(
      "does not prove",
    );
  });

  it("derives forward MTD only when daily snapshots include a prior-month baseline", () => {
    const program = {
      budgetCents: 6_000_000,
      configurationJson: {
        programSpendDailySnapshots: [
          {
            observedDate: "2026-07-31",
            observedAt: "2026-08-01T06:30:00.000Z",
            amountCents: 900_000,
            currency: "USD",
            feePeriod: "Calendar Month",
          },
          {
            observedDate: "2026-08-01",
            observedAt: "2026-08-02T06:30:00.000Z",
            amountCents: 25_000,
            currency: "USD",
            feePeriod: "Calendar Month",
          },
          {
            observedDate: "2026-08-24",
            observedAt: "2026-08-24T17:00:00.000Z",
            amountCents: 986_760,
            currency: "USD",
            feePeriod: "Calendar Month",
          },
        ],
      },
      summaryJson: {},
      currency: "USD",
    };

    expect(getProgramSpendState(program, augustNow)).toMatchObject({
      amountCents: 986_760,
      mtdAmountCents: 986_760,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-24",
      source: "Derived from daily Yelp Program List billing-period snapshots",
      status: "current",
    });
  });

  it("does not derive historical MTD without a prior-month snapshot", () => {
    const program = {
      budgetCents: 6_000_000,
      configurationJson: {
        programSpendDailySnapshots: [
          {
            observedDate: "2026-08-24",
            observedAt: "2026-08-24T17:00:00.000Z",
            amountCents: 986_760,
            currency: "USD",
            feePeriod: "Calendar Month",
          },
        ],
      },
      summaryJson: {
        program_metrics: {
          ad_cost: 986_760,
          currency: "USD",
          fee_period: "Calendar Month",
        },
      },
      currency: "USD",
    };

    expect(getProgramSpendState(program, augustNow)).toMatchObject({
      amountCents: 986_760,
      mtdAmountCents: null,
      periodLabel: "Yelp fee period: Calendar Month",
    });
  });

  it("accepts explicit date-bounded evidence for the current Pacific MTD range", () => {
    const program = {
      budgetCents: 600_000,
      configurationJson: {
        programSpendEvidence: {
          kind: "DATE_BOUNDED_MTD",
          amountCents: 123_456,
          periodStart: "2026-08-01",
          periodEnd: "2026-08-24",
          source: "Yelp Reporting API",
          currency: "USD",
          lastSuccessfulSync: "2026-08-24T17:00:00.000Z",
        },
      },
      summaryJson: {},
      currency: "USD",
    };

    expect(getProgramSpendState(program, augustNow)).toMatchObject({
      amountCents: 123_456,
      mtdAmountCents: 123_456,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-24",
      source: "Yelp Reporting API",
      status: "current",
      warning: null,
    });
  });

  it("marks date-bounded evidence stale when it is not for the current range", () => {
    const state = getProgramSpendState(
      {
        budgetCents: 600_000,
        configurationJson: {
          programSpendEvidence: {
            kind: "DATE_BOUNDED_MTD",
            amountCents: 123_456,
            periodStart: "2026-08-01",
            periodEnd: "2026-08-23",
          },
        },
        summaryJson: {},
      },
      augustNow,
    );

    expect(state.status).toBe("stale");
    expect(state.mtdAmountCents).toBeNull();
  });

  it("uses Pacific time at the UTC month boundary", () => {
    expect(
      getPacificMtdDateRange(new Date("2026-09-01T06:59:59.000Z")),
    ).toMatchObject({ startDate: "2026-08-01", endDate: "2026-08-31" });
    expect(
      getPacificMtdDateRange(new Date("2026-09-01T07:00:00.000Z")),
    ).toMatchObject({ startDate: "2026-09-01", endDate: "2026-09-01" });
  });

  it("surfaces pending and error reporting states", () => {
    const base = {
      budgetCents: 600_000,
      summaryJson: {},
      currency: "USD",
    };

    expect(
      getProgramSpendState(
        {
          ...base,
          configurationJson: {
            programSpendEvidence: { status: "PENDING" },
          },
        },
        augustNow,
      ).status,
    ).toBe("pending");
    expect(
      getProgramSpendState(
        {
          ...base,
          configurationJson: {
            programSpendEvidence: {
              status: "ERROR",
              error: "Reporting API unavailable",
            },
          },
        },
        augustNow,
      ),
    ).toMatchObject({
      status: "error",
      warning: "Reporting API unavailable",
    });
  });

  it("does not invent spend when Yelp omits ad_cost", () => {
    expect(
      getProgramSpendState(
        {
          budgetCents: 600_000,
          configurationJson: {},
          summaryJson: {},
        },
        augustNow,
      ),
    ).toMatchObject({ amountCents: null, status: "missing" });
  });

  it("labels an imported $60K program as the main campaign", () => {
    expect(
      inferProgramCampaignLayer({
        budgetCents: 6_000_000,
        configurationJson: {},
        summaryJson: {},
      }),
    ).toBe("MAIN");
  });
});
