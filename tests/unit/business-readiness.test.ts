import { describe, expect, it } from "vitest";

import { buildCpcReadiness } from "@/features/businesses/service";

describe("business readiness", () => {
  it("blocks launch when Yelp says the saved business ID migrated", () => {
    const readiness = buildCpcReadiness(
      {
        hasAboutText: true,
        yelpBusinessSyncStatus: "MIGRATED",
        yelpBusinessSyncDestinationBusinessId: "new_yelp_business_id",
      },
      [{ label: "HVAC", alias: "hvac" }],
    );

    expect(readiness.isReadyForCpc).toBe(false);
    expect(readiness.missingItems[0]).toContain("new_yelp_business_id");
    expect(readiness.yelpBusinessSyncStatus).toBe("MIGRATED");
  });

  it("blocks launch when Yelp no longer recognizes the saved business ID", () => {
    const readiness = buildCpcReadiness(
      {
        hasAboutText: true,
        yelpBusinessSyncStatus: "NOT_FOUND",
      },
      [{ label: "HVAC", alias: "hvac" }],
    );

    expect(readiness.isReadyForCpc).toBe(false);
    expect(readiness.missingItems[0]).toContain("did not recognize");
    expect(readiness.yelpBusinessSyncStatus).toBe("NOT_FOUND");
  });
});
