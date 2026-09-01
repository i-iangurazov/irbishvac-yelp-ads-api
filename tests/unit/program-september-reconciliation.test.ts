import { describe, expect, it } from "vitest";

import {
  isApprovedSeptemberMainProgram,
  planSeptemberCampaignReconciliation,
  verifySeptemberCampaignReadBack,
} from "@/features/ads-programs/september-reconciliation";
import { requiresSeptemberServiceTargeting } from "@/features/ads-programs/layers";

const installationProgram = {
  program_id: "yelp_hvac_12k",
  program_type: "CPC",
  program_status: "ACTIVE",
  ad_categories: ["hvac"],
  start_date: "2026-09-01",
  end_date: "2026-09-30",
  program_metrics: { budget: 1_200_000 },
};

describe("September campaign reconciliation", () => {
  it("accepts the approved Yelp main read-back without relaxing other values", () => {
    const mainProgram = {
      program_id: "main",
      program_type: "CPC",
      program_status: "ACTIVE",
      ad_categories: ["hvac", "plumbing"],
      program_metrics: { budget: 990_000 },
    };

    expect(isApprovedSeptemberMainProgram(mainProgram)).toBe(true);
    expect(
      isApprovedSeptemberMainProgram({
        ...mainProgram,
        program_metrics: { budget: 1_000_000 },
      }),
    ).toBe(true);
    expect(
      isApprovedSeptemberMainProgram({
        ...mainProgram,
        program_metrics: { budget: 989_900 },
      }),
    ).toBe(false);
    expect(
      isApprovedSeptemberMainProgram({
        ...mainProgram,
        program_status: "INACTIVE",
      }),
    ).toBe(false);
  });

  it("requires feature targeting only for a partial HVAC boost scope", () => {
    expect(
      requiresSeptemberServiceTargeting("SEPTEMBER_END_OF_MONTH_BOOST", [
        "HVAC_REPAIR",
        "PLUMBING",
      ]),
    ).toBe(true);
    expect(
      requiresSeptemberServiceTargeting("SEPTEMBER_END_OF_MONTH_BOOST", [
        "HVAC_REPAIR",
        "HVAC_INSTALLATION",
        "HVAC_MAINTENANCE",
        "PLUMBING",
        "WATER_HEATER",
      ]),
    ).toBe(false);
  });

  it("is idempotent for a tagged campaign with exact values", () => {
    expect(
      planSeptemberCampaignReconciliation({
        layer: "SEPTEMBER_HVAC_INSTALLATION",
        localPrograms: [
          {
            id: "local_installation",
            upstreamProgramId: "yelp_hvac_12k",
            type: "CPC",
            status: "ACTIVE",
            configurationJson: {
              campaignLayer: "SEPTEMBER_HVAC_INSTALLATION",
            },
          },
        ],
        upstreamPrograms: [installationProgram],
      }),
    ).toMatchObject({
      action: "NOOP",
      localProgramId: "local_installation",
      upstreamProgramId: "yelp_hvac_12k",
    });
  });

  it("requires explicit adoption of an exact untagged Yelp program", () => {
    expect(
      planSeptemberCampaignReconciliation({
        layer: "SEPTEMBER_HVAC_INSTALLATION",
        localPrograms: [],
        upstreamPrograms: [installationProgram],
      }),
    ).toMatchObject({ action: "BLOCKED", upstreamProgramId: null });
  });

  it("requires explicit adoption when the matching program needs an end-date update", () => {
    expect(
      planSeptemberCampaignReconciliation({
        layer: "SEPTEMBER_HVAC_REPAIR",
        localPrograms: [],
        upstreamPrograms: [
          {
            ...installationProgram,
            end_date: "9999-12-31",
          },
        ],
      }),
    ).toMatchObject({ action: "BLOCKED", upstreamProgramId: null });
  });

  it("adopts an explicitly selected existing program", () => {
    expect(
      planSeptemberCampaignReconciliation({
        layer: "SEPTEMBER_HVAC_REPAIR",
        localPrograms: [],
        upstreamPrograms: [installationProgram],
        adoptUpstreamProgramId: "yelp_hvac_12k",
      }),
    ).toMatchObject({
      action: "NOOP",
      upstreamProgramId: "yelp_hvac_12k",
    });
  });

  it("blocks adoption when the program is assigned to another managed layer", () => {
    expect(
      planSeptemberCampaignReconciliation({
        layer: "SEPTEMBER_HVAC_REPAIR",
        localPrograms: [
          {
            id: "local_installation",
            upstreamProgramId: "yelp_hvac_12k",
            type: "CPC",
            status: "ACTIVE",
            configurationJson: {
              campaignLayer: "SEPTEMBER_HVAC_INSTALLATION",
            },
          },
        ],
        upstreamPrograms: [installationProgram],
        adoptUpstreamProgramId: "yelp_hvac_12k",
      }).action,
    ).toBe("BLOCKED");
  });

  it("creates a same-budget sibling after the existing program is assigned", () => {
    expect(
      planSeptemberCampaignReconciliation({
        layer: "SEPTEMBER_HVAC_REPAIR",
        localPrograms: [
          {
            id: "local_installation",
            upstreamProgramId: "yelp_hvac_12k",
            type: "CPC",
            status: "ACTIVE",
            configurationJson: {
              campaignLayer: "SEPTEMBER_HVAC_INSTALLATION",
            },
          },
        ],
        upstreamPrograms: [installationProgram],
      }).action,
    ).toBe("CREATE");
  });

  it("creates a missing Plumbing layer", () => {
    expect(
      planSeptemberCampaignReconciliation({
        layer: "SEPTEMBER_PLUMBING",
        localPrograms: [],
        upstreamPrograms: [installationProgram],
      }).action,
    ).toBe("CREATE");
  });

  it("blocks the boost until at least one approved direction is selected", () => {
    expect(
      planSeptemberCampaignReconciliation({
        layer: "SEPTEMBER_END_OF_MONTH_BOOST",
        localPrograms: [],
        upstreamPrograms: [],
      }),
    ).toMatchObject({ action: "BLOCKED" });
  });

  it("creates a boost with the resolved approved Yelp categories", () => {
    expect(
      planSeptemberCampaignReconciliation({
        layer: "SEPTEMBER_END_OF_MONTH_BOOST",
        localPrograms: [],
        upstreamPrograms: [],
        categoryAliases: ["hvac", "plumbing"],
      }),
    ).toMatchObject({ action: "CREATE" });
  });

  it("verifies the selected boost categories exactly", () => {
    const boostProgram = {
      program_id: "yelp_boost_5k",
      program_type: "CPC",
      program_status: "ACTIVE",
      ad_categories: ["plumbing", "waterheaterinstallrepair"],
      start_date: "2026-09-25",
      end_date: "2026-09-30",
      program_metrics: { budget: 500_000 },
    };

    expect(
      verifySeptemberCampaignReadBack({
        layer: "SEPTEMBER_END_OF_MONTH_BOOST",
        upstreamProgramId: "yelp_boost_5k",
        upstreamPrograms: [boostProgram],
        categoryAliases: ["plumbing", "waterheaterinstallrepair"],
      }).verified,
    ).toBe(true);
    expect(
      verifySeptemberCampaignReadBack({
        layer: "SEPTEMBER_END_OF_MONTH_BOOST",
        upstreamProgramId: "yelp_boost_5k",
        upstreamPrograms: [boostProgram],
        categoryAliases: ["hvac"],
      }).verified,
    ).toBe(false);
  });

  it("accepts Yelp's inactive status for an exact future-dated boost", () => {
    expect(
      verifySeptemberCampaignReadBack({
        layer: "SEPTEMBER_END_OF_MONTH_BOOST",
        upstreamProgramId: "future_boost",
        upstreamPrograms: [
          {
            program_id: "future_boost",
            program_type: "CPC",
            program_status: "INACTIVE",
            ad_categories: ["waterheaterinstallrepair", "plumbing", "hvac"],
            start_date: "2026-09-25",
            end_date: "2026-09-30",
            program_metrics: { budget: 500_000 },
          },
        ],
        categoryAliases: ["hvac", "plumbing", "waterheaterinstallrepair"],
      }).verified,
    ).toBe(true);
  });

  it("verifies exact read-back values", () => {
    expect(
      verifySeptemberCampaignReadBack({
        layer: "SEPTEMBER_HVAC_INSTALLATION",
        upstreamProgramId: "yelp_hvac_12k",
        upstreamPrograms: [installationProgram],
      }),
    ).toEqual({
      verified: true,
      reason: "Yelp read-back matched every approved September value.",
    });

    expect(
      verifySeptemberCampaignReadBack({
        layer: "SEPTEMBER_HVAC_INSTALLATION",
        upstreamProgramId: "yelp_hvac_12k",
        upstreamPrograms: [
          {
            ...installationProgram,
            program_metrics: { budget: 1_199_900 },
          },
        ],
      }).verified,
    ).toBe(false);
    expect(
      verifySeptemberCampaignReadBack({
        layer: "SEPTEMBER_HVAC_INSTALLATION",
        upstreamProgramId: "yelp_hvac_12k",
        upstreamPrograms: [
          {
            ...installationProgram,
            start_date: "2026-09-02",
          },
        ],
      }).verified,
    ).toBe(false);
  });
});
