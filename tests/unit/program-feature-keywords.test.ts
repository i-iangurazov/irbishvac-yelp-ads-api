import { describe, expect, it } from "vitest";

import {
  keywordSetsMatch,
  negativeKeywordUpdateSchema,
  normalizeBlockedKeywords,
} from "@/features/program-features/keywords";

describe("program feature keywords", () => {
  it("normalizes whitespace and removes case-insensitive duplicates", () => {
    expect(
      normalizeBlockedKeywords([" HVAC jobs ", "hvac   jobs", "Free HVAC", ""]),
    ).toEqual(["HVAC jobs", "Free HVAC"]);
  });

  it("accepts only the dedicated negative-keyword request shape", () => {
    expect(
      negativeKeywordUpdateSchema.parse({
        type: "NEGATIVE_KEYWORD_TARGETING",
        blockedKeywords: [" jobs ", "JOBS", "free estimate"],
      }),
    ).toEqual({
      type: "NEGATIVE_KEYWORD_TARGETING",
      blockedKeywords: ["jobs", "free estimate"],
    });

    expect(() =>
      negativeKeywordUpdateSchema.parse({
        type: "LINK_TRACKING",
        blockedKeywords: [],
      }),
    ).toThrow();
  });

  it("compares provider read-back without depending on order or case", () => {
    expect(keywordSetsMatch(["HVAC jobs", "free"], ["FREE", "hvac jobs"])).toBe(
      true,
    );
    expect(keywordSetsMatch(["HVAC jobs"], ["HVAC careers"])).toBe(false);
  });
});
