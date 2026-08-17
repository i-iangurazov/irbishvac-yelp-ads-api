import { describe, expect, it } from "vitest";

import {
  analyzeBusinessCpcTargeting,
  resolveProgramCategoryScope,
} from "@/features/ads-programs/targeting";

const listingCategories = [
  { alias: "hvac", label: "HVAC" },
  { alias: "plumbing", label: "Plumbing" },
  {
    alias: "waterheaterinstallrepair",
    label: "Water Heater Installation/Repair",
  },
];

function cpcProgram(
  id: string,
  categories: string[],
  status: "ACTIVE" | "ENDED" = "ACTIVE",
) {
  return {
    id,
    upstreamProgramId: id,
    type: "CPC" as const,
    status,
    adCategoriesJson: categories,
  };
}

describe("program targeting integrity", () => {
  it("classifies non-CPC, inferred listing-wide, explicit listing-wide, and category-specific scopes", () => {
    expect(
      resolveProgramCategoryScope("LOGO", [], listingCategories).kind,
    ).toBe("NOT_APPLICABLE");
    expect(resolveProgramCategoryScope("CPC", [], listingCategories).kind).toBe(
      "LISTING_WIDE_INFERRED",
    );
    expect(
      resolveProgramCategoryScope(
        "CPC",
        ["hvac", "plumbing", "waterheaterinstallrepair"],
        listingCategories,
      ).kind,
    ).toBe("LISTING_WIDE_EXPLICIT");
    expect(
      resolveProgramCategoryScope("CPC", ["hvac"], listingCategories).kind,
    ).toBe("CATEGORY_SPECIFIC");
  });

  it("flags the production failure pattern: no main program and duplicate HVAC campaigns", () => {
    const issues = analyzeBusinessCpcTargeting(
      [
        cpcProgram("main-looking-but-hvac", ["hvac"]),
        cpcProgram("existing-hvac", ["hvac"]),
      ],
      listingCategories,
    );

    expect(issues.map((issue) => issue.code)).toEqual([
      "MISSING_LISTING_WIDE_PROGRAM",
      "DUPLICATE_CATEGORY_SCOPE",
    ]);
  });

  it("accepts one explicit listing-wide program plus category-specific layers", () => {
    const issues = analyzeBusinessCpcTargeting(
      [
        cpcProgram("main", ["hvac", "plumbing", "waterheaterinstallrepair"]),
        cpcProgram("hvac-layer", ["hvac"]),
      ],
      listingCategories,
    );

    expect(issues).toEqual([]);
  });

  it("ignores ended campaigns and flags unknown aliases", () => {
    const issues = analyzeBusinessCpcTargeting(
      [
        cpcProgram("main", ["hvac", "plumbing", "waterheaterinstallrepair"]),
        cpcProgram("ended-duplicate", ["hvac"], "ENDED"),
        cpcProgram("bad-alias", ["roofing"]),
      ],
      listingCategories,
    );

    expect(issues.map((issue) => issue.code)).toEqual([
      "UNKNOWN_CATEGORY_ALIAS",
    ]);
  });

  it("flags an unknown alias even when the program also covers the full listing", () => {
    const issues = analyzeBusinessCpcTargeting(
      [
        cpcProgram("main", [
          "hvac",
          "plumbing",
          "waterheaterinstallrepair",
          "roofing",
        ]),
      ],
      listingCategories,
    );

    expect(issues.map((issue) => issue.code)).toEqual([
      "UNKNOWN_CATEGORY_ALIAS",
    ]);
  });

  it("flags overlapping category-specific programs with different scopes", () => {
    const issues = analyzeBusinessCpcTargeting(
      [
        cpcProgram("main", ["hvac", "plumbing", "waterheaterinstallrepair"]),
        cpcProgram("first", ["hvac", "plumbing"]),
        cpcProgram("second", ["plumbing"]),
      ],
      listingCategories,
    );

    expect(issues.map((issue) => issue.code)).toEqual([
      "OVERLAPPING_CATEGORY_SCOPE",
    ]);
  });
});
