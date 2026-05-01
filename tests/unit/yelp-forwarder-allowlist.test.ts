import { describe, expect, it } from "vitest";

import {
  buildYelpForwarderAllowlistState,
  parseYelpAllowedBusinessIds
} from "@/features/businesses/yelp-forwarder-allowlist";

describe("Yelp forwarder allowlist readiness", () => {
  it("normalizes comma-separated Yelp business IDs", () => {
    expect(parseYelpAllowedBusinessIds(" biz_1, biz_2,biz_1 ,, ")).toEqual(["biz_1", "biz_2"]);
  });

  it("returns unknown when the mirrored allowlist is not configured", () => {
    const state = buildYelpForwarderAllowlistState({
      encryptedYelpBusinessId: "biz_1",
      allowedBusinessIds: []
    });

    expect(state.status).toBe("UNKNOWN");
    expect(state.isAllowed).toBeNull();
  });

  it("returns ready when the business is present", () => {
    const state = buildYelpForwarderAllowlistState({
      encryptedYelpBusinessId: "biz_2",
      allowedBusinessIds: ["biz_1", "biz_2"]
    });

    expect(state.status).toBe("READY");
    expect(state.isAllowed).toBe(true);
  });

  it("returns failed when a configured allowlist excludes the business", () => {
    const state = buildYelpForwarderAllowlistState({
      encryptedYelpBusinessId: "biz_missing",
      allowedBusinessIds: ["biz_1", "biz_2"]
    });

    expect(state.status).toBe("FAILED");
    expect(state.isAllowed).toBe(false);
  });
});
