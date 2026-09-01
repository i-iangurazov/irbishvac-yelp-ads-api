import { describe, expect, it } from "vitest";

import {
  planSeptemberCampaignReconciliation,
  verifySeptemberCampaignReadBack,
} from "@/features/ads-programs/september-reconciliation";

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

  it("creates a missing Plumbing layer", () => {
    expect(
      planSeptemberCampaignReconciliation({
        layer: "SEPTEMBER_PLUMBING",
        localPrograms: [],
        upstreamPrograms: [installationProgram],
      }).action,
    ).toBe("CREATE");
  });

  it("blocks the boost until its trade scope is approved", () => {
    expect(
      planSeptemberCampaignReconciliation({
        layer: "SEPTEMBER_END_OF_MONTH_BOOST",
        localPrograms: [],
        upstreamPrograms: [],
      }),
    ).toMatchObject({ action: "BLOCKED" });
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
  });
});
