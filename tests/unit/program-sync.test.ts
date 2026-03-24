import { describe, expect, it } from "vitest";

import {
  buildSynchronizedProgramConfiguration,
  parseSynchronizedProgramDate,
  resolveSynchronizedBudgetCents,
  resolveSynchronizedIsAutobid,
  resolveSynchronizedMaxBidCents,
  resolveSynchronizedProgramStatus,
  resolveSynchronizedProgramType
} from "@/features/ads-programs/sync";

describe("program sync helpers", () => {
  it("maps upstream program types and statuses into local enums", () => {
    expect(resolveSynchronizedProgramType("CPC")).toBe("CPC");
    expect(resolveSynchronizedProgramType("UNKNOWN_TYPE")).toBeNull();
    expect(resolveSynchronizedProgramStatus("ACTIVE")).toBe("ACTIVE");
    expect(resolveSynchronizedProgramStatus("INACTIVE")).toBe("ENDED");
    expect(resolveSynchronizedProgramStatus("NOT_A_REAL_STATUS")).toBe("FAILED");
  });

  it("derives budget information from program metrics and page-upgrade monthly rate", () => {
    expect(
      resolveSynchronizedBudgetCents({
        program_id: "cpc-1",
        program_type: "CPC",
        program_status: "ACTIVE",
        active_features: [],
        available_features: [],
        ad_categories: [],
        future_budget_changes: [],
        program_metrics: {
          budget: 500000,
          currency: "USD",
          is_autobid: true,
          max_bid: 4200
        }
      })
    ).toBe(500000);

    expect(
      resolveSynchronizedBudgetCents({
        program_id: "logo-1",
        program_type: "LOGO",
        program_status: "ACTIVE",
        active_features: [],
        available_features: [],
        ad_categories: [],
        future_budget_changes: [],
        page_upgrade_info: {
          monthly_rate: 30
        }
      })
    ).toBe(3000);
  });

  it("preserves useful sync metadata in configuration without dropping existing notes", () => {
    const syncedAt = new Date("2026-03-24T12:00:00.000Z");
    const configuration = buildSynchronizedProgramConfiguration(
      {
        program_id: "JjhIENbS68b2Wkomkbu6Jw",
        program_type: "CPC",
        program_status: "ACTIVE",
        program_pause_status: "NOT_PAUSED",
        active_features: ["AD_GOAL", "CALL_TRACKING"],
        available_features: ["AD_GOAL", "CALL_TRACKING", "STRICT_CATEGORY_TARGETING"],
        ad_categories: ["plumbing"],
        future_budget_changes: [],
        start_date: "2026-03-23",
        program_metrics: {
          budget: 1000000,
          currency: "USD",
          is_autobid: true,
          max_bid: null,
          fee_period: "Calendar Month"
        }
      },
      {
        notes: "Keep this customer at 10k.",
        scheduledBudgetDollars: "12000"
      },
      {
        budgetCents: 1000000,
        maxBidCents: null,
        isAutobid: true,
        feePeriod: "Calendar Month",
        syncedAt
      }
    );

    expect(configuration).toMatchObject({
      notes: "Keep this customer at 10k.",
      scheduledBudgetDollars: "12000",
      syncImportedFromYelp: true,
      syncSource: "PROGRAM_LIST",
      syncImportedAt: syncedAt.toISOString(),
      lastUpstreamProgramStatus: "ACTIVE",
      lastUpstreamPauseStatus: "NOT_PAUSED",
      monthlyBudgetDollars: "10000",
      isAutobid: true,
      feePeriod: "Calendar Month",
      adCategories: ["plumbing"]
    });
  });

  it("normalizes optional sync fields", () => {
    expect(resolveSynchronizedMaxBidCents({
      program_id: "cpc-2",
      program_type: "CPC",
      program_status: "ACTIVE",
      active_features: [],
      available_features: [],
      ad_categories: [],
      future_budget_changes: [],
      program_metrics: {
        max_bid: 1500,
        is_autobid: false
      }
    })).toBe(1500);

    expect(resolveSynchronizedIsAutobid({
      program_id: "cpc-3",
      program_type: "CPC",
      program_status: "ACTIVE",
      active_features: [],
      available_features: [],
      ad_categories: [],
      future_budget_changes: [],
      program_metrics: {
        is_autobid: false
      }
    })).toBe(false);

    expect(parseSynchronizedProgramDate("9999-12-31")).toBeNull();
    expect(parseSynchronizedProgramDate("2026-03-24")?.toISOString()).toBe("2026-03-24T00:00:00.000Z");
  });
});
