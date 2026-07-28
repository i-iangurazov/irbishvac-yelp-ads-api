import { describe, expect, it } from "vitest";

import {
  getYelpCategoryDisplayLabel,
  normalizeYelpCategories,
} from "@/lib/yelp/categories";

describe("Yelp category display labels", () => {
  it("uses the business catalog label for an alias-only program category", () => {
    const [category] = normalizeYelpCategories(["plumbing"]);
    const catalog = normalizeYelpCategories([
      { alias: "plumbing", label: "Plumbing Services" },
    ]);

    expect(getYelpCategoryDisplayLabel(category!, catalog)).toBe(
      "Plumbing Services",
    );
  });

  it("gives the water-heater alias a readable fallback label", () => {
    const [category] = normalizeYelpCategories(["waterheaterinstallrepair"]);

    expect(getYelpCategoryDisplayLabel(category!)).toBe(
      "Water Heater Installation/Repair",
    );
  });
});
