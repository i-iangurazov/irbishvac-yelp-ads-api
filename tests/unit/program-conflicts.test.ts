import { describe, expect, it } from "vitest";

import { cpcCategoryTargetsOverlap, findConflictingCpcPrograms } from "@/features/ads-programs/conflicts";

describe("program conflict detection", () => {
  it("treats matching CPC category aliases as overlapping", () => {
    expect(cpcCategoryTargetsOverlap(["electricians"], ["electricians"])).toBe(true);
  });

  it("treats different CPC category aliases as non-overlapping", () => {
    expect(cpcCategoryTargetsOverlap(["electricians"], ["plumbing"])).toBe(false);
  });

  it("treats an unscoped CPC program as overlapping all category-targeted programs", () => {
    expect(cpcCategoryTargetsOverlap([], ["plumbing"])).toBe(true);
    expect(cpcCategoryTargetsOverlap(["plumbing"], [])).toBe(true);
  });

  it("finds only active-like CPC conflicts and ignores the edited program itself", () => {
    const result = findConflictingCpcPrograms(
      [
        {
          id: "program-1",
          upstreamProgramId: "upstream-1",
          type: "CPC",
          status: "ACTIVE",
          adCategoriesJson: ["electricians"]
        },
        {
          id: "program-2",
          upstreamProgramId: "upstream-2",
          type: "CPC",
          status: "ENDED",
          adCategoriesJson: ["electricians"]
        },
        {
          id: "program-3",
          upstreamProgramId: "upstream-3",
          type: "VL",
          status: "ACTIVE",
          adCategoriesJson: []
        }
      ],
      ["electricians"],
      "program-1"
    );

    expect(result).toEqual([]);
  });
});
