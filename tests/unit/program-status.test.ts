import { describe, expect, it } from "vitest";

import {
  isBusinessEligibleForProgramInventory,
  isCurrentLocalProgramStatus,
  isCurrentUpstreamProgramStatus,
} from "@/features/ads-programs/status";

describe("program status visibility", () => {
  it("keeps only current local program statuses visible", () => {
    expect(isCurrentLocalProgramStatus("ACTIVE")).toBe(true);
    expect(isCurrentLocalProgramStatus("SCHEDULED")).toBe(true);
    expect(isCurrentLocalProgramStatus("PROCESSING")).toBe(true);
    expect(isCurrentLocalProgramStatus("ENDED")).toBe(false);
    expect(isCurrentLocalProgramStatus("FAILED")).toBe(false);
    expect(isCurrentLocalProgramStatus("DRAFT")).toBe(false);
  });

  it("keeps only current upstream program statuses visible", () => {
    expect(isCurrentUpstreamProgramStatus("ACTIVE")).toBe(true);
    expect(isCurrentUpstreamProgramStatus("QUEUED")).toBe(true);
    expect(isCurrentUpstreamProgramStatus("PARTIAL")).toBe(true);
    expect(isCurrentUpstreamProgramStatus("INACTIVE")).toBe(false);
    expect(isCurrentUpstreamProgramStatus("ENDED")).toBe(false);
    expect(isCurrentUpstreamProgramStatus("FAILED")).toBe(false);
  });

  it("hides programs when Yelp reports no access to the business", () => {
    expect(
      isBusinessEligibleForProgramInventory({
        name: "Irbis HVAC",
        readinessJson: { yelpBusinessSyncStatus: "NO_ACCESS" },
      }),
    ).toBe(false);
  });

  it("hides programs belonging to test businesses", () => {
    expect(
      isBusinessEligibleForProgramInventory({
        name: "Plumbing Business Tester - Test",
        readinessJson: { yelpBusinessSyncStatus: "ACTIVE" },
      }),
    ).toBe(false);
    expect(
      isBusinessEligibleForProgramInventory({
        name: "Testing HVAC",
        readinessJson: {},
      }),
    ).toBe(false);
  });

  it("keeps programs for working businesses", () => {
    expect(
      isBusinessEligibleForProgramInventory({
        name: "Irbis HVAC and Plumbing",
        readinessJson: { yelpBusinessSyncStatus: "ACTIVE" },
      }),
    ).toBe(true);
  });
});
