import { describe, expect, it } from "vitest";

import { assertTenantAutomationScope } from "@/features/autoresponder/scope-policy";

const options = {
  businesses: [{ id: "business-a" }],
  locations: [{ id: "location-a" }],
  serviceCategories: [{ id: "service-a" }],
};

describe("autoresponder tenant scope policy", () => {
  it("accepts only IDs owned by the active tenant", () => {
    expect(() =>
      assertTenantAutomationScope(options, {
        businessIds: ["business-a", null],
        locationIds: ["location-a", ""],
        serviceCategoryIds: ["service-a", undefined],
      }),
    ).not.toThrow();
  });

  it.each([
    ["business", { businessIds: ["business-b"] }],
    ["location", { locationIds: ["location-b"] }],
    ["service", { serviceCategoryIds: ["service-b"] }],
  ])("rejects a cross-tenant %s ID", (_label, selection) => {
    expect(() => assertTenantAutomationScope(options, selection)).toThrow(
      /not available in the active tenant/i,
    );
  });
});
