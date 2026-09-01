import { describe, expect, it } from "vitest";

import {
  cpcCategoryTargetsOverlap,
  findConflictingCpcPrograms,
} from "@/features/ads-programs/conflicts";

describe("program conflict detection", () => {
  it("treats matching CPC category aliases as overlapping", () => {
    expect(cpcCategoryTargetsOverlap(["electricians"], ["electricians"])).toBe(
      true,
    );
  });

  it("treats different CPC category aliases as non-overlapping", () => {
    expect(cpcCategoryTargetsOverlap(["electricians"], ["plumbing"])).toBe(
      false,
    );
  });

  it("allows all-category CPC programs to coexist with category-specific CPC programs", () => {
    expect(cpcCategoryTargetsOverlap([], ["plumbing"])).toBe(false);
    expect(cpcCategoryTargetsOverlap(["plumbing"], [])).toBe(false);
  });

  it("treats two all-category CPC programs as overlapping", () => {
    expect(cpcCategoryTargetsOverlap([], [])).toBe(true);
  });

  it("treats explicit full listing categories as the main listing-wide program", () => {
    const listingCategoryAliases = [
      "waterheaterinstallrepair",
      "plumbing",
      "hvac",
    ];

    expect(
      cpcCategoryTargetsOverlap(
        ["waterheaterinstallrepair", "plumbing", "hvac"],
        ["plumbing"],
        { listingCategoryAliases },
      ),
    ).toBe(false);
    expect(
      cpcCategoryTargetsOverlap(
        ["waterheaterinstallrepair", "plumbing", "hvac"],
        [],
        { listingCategoryAliases },
      ),
    ).toBe(true);
  });

  it("does not flag a synced main CPC as a conflict for a category-specific CPC", () => {
    const result = findConflictingCpcPrograms(
      [
        {
          id: "program-main",
          upstreamProgramId: "4WnJ0ZU6e36WnJHdLt-leA",
          type: "CPC",
          status: "ACTIVE",
          adCategoriesJson: ["waterheaterinstallrepair", "plumbing", "hvac"],
        },
      ],
      ["plumbing"],
      undefined,
      {
        listingCategoryAliases: [
          "waterheaterinstallrepair",
          "plumbing",
          "hvac",
        ],
      },
    );

    expect(result).toEqual([]);
  });

  it("finds only active-like CPC conflicts and ignores the edited program itself", () => {
    const result = findConflictingCpcPrograms(
      [
        {
          id: "program-1",
          upstreamProgramId: "upstream-1",
          type: "CPC",
          status: "ACTIVE",
          adCategoriesJson: ["electricians"],
        },
        {
          id: "program-2",
          upstreamProgramId: "upstream-2",
          type: "CPC",
          status: "ENDED",
          adCategoriesJson: ["electricians"],
        },
        {
          id: "program-3",
          upstreamProgramId: "upstream-3",
          type: "VL",
          status: "ACTIVE",
          adCategoriesJson: [],
        },
      ],
      ["electricians"],
      "program-1",
    );

    expect(result).toEqual([]);
  });

  it("allows the approved temporary commercial HVAC layer to overlap an existing HVAC campaign", () => {
    const result = findConflictingCpcPrograms(
      [
        {
          id: "install",
          type: "CPC",
          status: "ACTIVE",
          adCategoriesJson: ["hvac"],
          configurationJson: { campaignLayer: "GENERAL" },
        },
      ],
      ["hvac"],
      undefined,
      { requestedCampaignLayer: "AUGUST_COMMERCIAL_HVAC_TEMP" },
    );

    expect(result).toEqual([]);
  });

  it("allows distinct managed September HVAC layers to overlap", () => {
    const result = findConflictingCpcPrograms(
      [
        {
          id: "installation",
          type: "CPC",
          status: "ACTIVE",
          adCategoriesJson: ["hvac"],
          configurationJson: {
            campaignLayer: "SEPTEMBER_HVAC_INSTALLATION",
          },
        },
      ],
      ["hvac"],
      undefined,
      { requestedCampaignLayer: "SEPTEMBER_HVAC_REPAIR" },
    );

    expect(result).toEqual([]);
  });

  it("allows the scheduled managed boost to overlap the managed main campaign", () => {
    const result = findConflictingCpcPrograms(
      [
        {
          id: "main",
          type: "CPC",
          status: "ACTIVE",
          adCategoriesJson: ["waterheaterinstallrepair", "plumbing", "hvac"],
          configurationJson: { campaignLayer: "MAIN" },
        },
      ],
      ["hvac", "plumbing", "waterheaterinstallrepair"],
      undefined,
      { requestedCampaignLayer: "SEPTEMBER_END_OF_MONTH_BOOST" },
    );

    expect(result).toEqual([]);
  });

  it("still blocks duplicate programs within the same September layer", () => {
    const result = findConflictingCpcPrograms(
      [
        {
          id: "installation",
          type: "CPC",
          status: "ACTIVE",
          adCategoriesJson: ["hvac"],
          configurationJson: {
            campaignLayer: "SEPTEMBER_HVAC_INSTALLATION",
          },
        },
      ],
      ["hvac"],
      undefined,
      { requestedCampaignLayer: "SEPTEMBER_HVAC_INSTALLATION" },
    );

    expect(result).toHaveLength(1);
  });
});
