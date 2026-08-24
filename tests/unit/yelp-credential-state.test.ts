import { describe, expect, it } from "vitest";

import { isYelpCredentialAuthFailure } from "@/lib/yelp/credential-state";

describe("Yelp credential auth state", () => {
  it("opens the circuit only for a stored authentication failure", () => {
    expect(
      isYelpCredentialAuthFailure({
        lastTestStatus: "FAILED",
        lastErrorMessage:
          "Yelp authentication failed. Check the configured credentials.",
      }),
    ).toBe(true);

    expect(
      isYelpCredentialAuthFailure({
        lastTestStatus: "FAILED",
        lastErrorMessage: "The requested Yelp resource was not found.",
      }),
    ).toBe(false);

    expect(
      isYelpCredentialAuthFailure({
        lastTestStatus: "SUCCESS",
        lastErrorMessage: "401",
      }),
    ).toBe(false);
  });
});
