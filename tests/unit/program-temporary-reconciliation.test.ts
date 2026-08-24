import { describe, expect, it } from "vitest";

import {
  planTemporaryAugustCampaignReconciliation,
  verifyTemporaryAugustCampaignReadBack,
} from "@/features/ads-programs/temporary-reconciliation";

const plumbingProgram = {
  program_id: "yelp_plumbing",
  program_type: "CPC",
  program_status: "ACTIVE",
  ad_categories: ["plumbing"],
  end_date: "2026-08-31",
  program_metrics: { budget: 690_000 },
};

describe("temporary August campaign reconciliation", () => {
  it("is idempotent when the approved Plumbing program already exists", () => {
    expect(
      planTemporaryAugustCampaignReconciliation({
        layer: "AUGUST_PLUMBING_TEMP",
        localPrograms: [
          {
            id: "local_plumbing",
            upstreamProgramId: "yelp_plumbing",
            type: "CPC",
            status: "ACTIVE",
            configurationJson: { campaignLayer: "AUGUST_PLUMBING_TEMP" },
          },
        ],
        upstreamPrograms: [plumbingProgram],
      }),
    ).toMatchObject({
      action: "NOOP",
      localProgramId: "local_plumbing",
      upstreamProgramId: "yelp_plumbing",
    });
  });

  it("adopts an exact upstream program instead of creating a duplicate", () => {
    expect(
      planTemporaryAugustCampaignReconciliation({
        layer: "AUGUST_PLUMBING_TEMP",
        localPrograms: [],
        upstreamPrograms: [plumbingProgram],
      }),
    ).toMatchObject({
      action: "NOOP",
      localProgramId: null,
      upstreamProgramId: "yelp_plumbing",
    });
  });

  it("updates a tagged canonical program when approved values differ", () => {
    expect(
      planTemporaryAugustCampaignReconciliation({
        layer: "AUGUST_COMMERCIAL_HVAC_TEMP",
        localPrograms: [
          {
            id: "local_commercial",
            upstreamProgramId: "yelp_commercial",
            type: "CPC",
            status: "ACTIVE",
            configurationJson: {
              campaignLayer: "AUGUST_COMMERCIAL_HVAC_TEMP",
            },
          },
        ],
        upstreamPrograms: [
          {
            program_id: "yelp_commercial",
            program_type: "CPC",
            program_status: "ACTIVE",
            ad_categories: ["hvac"],
            end_date: "2026-08-31",
            program_metrics: { budget: 500_000 },
          },
        ],
      }),
    ).toMatchObject({ action: "UPDATE", upstreamProgramId: "yelp_commercial" });
  });

  it("blocks duplicate tagged local programs", () => {
    expect(
      planTemporaryAugustCampaignReconciliation({
        layer: "AUGUST_PLUMBING_TEMP",
        localPrograms: ["one", "two"].map((id) => ({
          id,
          upstreamProgramId: `yelp_${id}`,
          type: "CPC",
          status: "ACTIVE",
          configurationJson: { campaignLayer: "AUGUST_PLUMBING_TEMP" },
        })),
        upstreamPrograms: [],
      }).action,
    ).toBe("BLOCKED");
  });

  it("blocks an ambiguous existing Plumbing program", () => {
    expect(
      planTemporaryAugustCampaignReconciliation({
        layer: "AUGUST_PLUMBING_TEMP",
        localPrograms: [],
        upstreamPrograms: [
          {
            ...plumbingProgram,
            program_id: "existing_plumbing",
            end_date: null,
          },
        ],
      }).action,
    ).toBe("BLOCKED");
  });

  it("allows the approved temporary Commercial HVAC program alongside base HVAC", () => {
    expect(
      planTemporaryAugustCampaignReconciliation({
        layer: "AUGUST_COMMERCIAL_HVAC_TEMP",
        localPrograms: [],
        upstreamPrograms: [
          {
            program_id: "base_hvac",
            program_type: "CPC",
            program_status: "ACTIVE",
            ad_categories: ["hvac"],
            end_date: null,
            program_metrics: { budget: 1_419_000 },
          },
        ],
      }).action,
    ).toBe("CREATE");
  });

  it("verifies exact Yelp read-back values", () => {
    expect(
      verifyTemporaryAugustCampaignReadBack({
        layer: "AUGUST_PLUMBING_TEMP",
        upstreamProgramId: "yelp_plumbing",
        upstreamPrograms: [plumbingProgram],
      }),
    ).toEqual({
      verified: true,
      reason: "Yelp read-back matched every approved value.",
    });
    expect(
      verifyTemporaryAugustCampaignReadBack({
        layer: "AUGUST_PLUMBING_TEMP",
        upstreamProgramId: "yelp_plumbing",
        upstreamPrograms: [
          {
            ...plumbingProgram,
            program_metrics: { budget: 700_000 },
          },
        ],
      }).verified,
    ).toBe(false);
  });
});
