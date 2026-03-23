import { describe, expect, it } from "vitest";

import { getCredentialHealthViewModel } from "@/features/settings/view-models";

describe("settings view models", () => {
  it("treats a 404 test-path failure as a verification-path issue instead of ambiguous failure copy", () => {
    const result = getCredentialHealthViewModel({
      kind: "ADS_BASIC_AUTH",
      isEnabled: true,
      lastTestStatus: "FAILED",
      lastErrorMessage:
        'The test path "/" returned 404 from Yelp. The credentials may still be valid, but this path is not a valid connection check. Save a better test path and retry.',
      lastTestedAt: null,
      secretEncrypted: "configured",
      usernameEncrypted: "configured",
      metadataJson: {
        testPath: "/"
      }
    });

    expect(result.setupLabel).toBe("Credentials saved");
    expect(result.requestsLabel).toBe("Requests enabled");
    expect(result.testLabel).toBe("Test path needs update");
    expect(result.testVariant).toBe("warning");
  });

  it("downgrades the older generic Yelp not-found message into the same path warning", () => {
    const result = getCredentialHealthViewModel({
      kind: "ADS_BASIC_AUTH",
      isEnabled: true,
      lastTestStatus: "FAILED",
      lastErrorMessage: "The requested Yelp resource was not found.",
      lastTestedAt: null,
      secretEncrypted: "configured",
      usernameEncrypted: "configured",
      metadataJson: {
        testPath: "/"
      }
    });

    expect(result.testLabel).toBe("Test path needs update");
    expect(result.detail).toContain('"/"');
  });

  it("treats Fusion credentials as configured without requiring a username", () => {
    const result = getCredentialHealthViewModel({
      kind: "REPORTING_FUSION",
      isEnabled: false,
      lastTestStatus: "UNTESTED",
      lastErrorMessage: null,
      lastTestedAt: null,
      secretEncrypted: "configured",
      usernameEncrypted: null,
      metadataJson: null
    });

    expect(result.setupLabel).toBe("Credentials saved");
    expect(result.requestsLabel).toBe("Requests paused");
    expect(result.testLabel).toBe("Not tested yet");
  });
});
