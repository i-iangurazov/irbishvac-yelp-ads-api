import { beforeEach, describe, expect, it, vi } from "vitest";

const getCredentialSet = vi.fn();
const getSystemSetting = vi.fn();
const decryptSecret = vi.fn();
const getServerEnv = vi.fn();

vi.mock("@/lib/db/credentials-repository", () => ({
  getCredentialSet
}));

vi.mock("@/lib/db/settings-repository", () => ({
  getSystemSetting
}));

vi.mock("@/lib/utils/crypto", () => ({
  decryptSecret
}));

vi.mock("@/lib/utils/env", () => ({
  getServerEnv
}));

describe("Yelp runtime", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getSystemSetting.mockResolvedValue({
      hasLeadsApi: true
    });
    getCredentialSet.mockResolvedValue(null);
    decryptSecret.mockImplementation((value: string) => value);
    getServerEnv.mockReturnValue({
      YELP_REPORTING_BASE_URL: "https://api.yelp.com",
      YELP_ACCESS_TOKEN: undefined,
      YELP_API_KEY: undefined
    });
  });

  it("uses YELP_ACCESS_TOKEN as the explicit Leads bearer-token fallback", async () => {
    getServerEnv.mockReturnValue({
      YELP_REPORTING_BASE_URL: "https://api.yelp.com",
      YELP_ACCESS_TOKEN: "partner-access-token",
      YELP_API_KEY: "older-api-key"
    });

    const { ensureYelpLeadsAccess } = await import("@/lib/yelp/runtime");
    const result = await ensureYelpLeadsAccess("tenant_1");

    expect(result.credential.secret).toBe("partner-access-token");
    expect(result.credential.baseUrl).toBe("https://api.yelp.com");
  });

  it("prefers the saved bearer token over env fallbacks", async () => {
    getCredentialSet.mockResolvedValue({
      label: "Saved bearer token",
      baseUrl: "https://api.yelp.com",
      isEnabled: true,
      usernameEncrypted: null,
      secretEncrypted: "saved-secret",
      metadataJson: null
    });
    getServerEnv.mockReturnValue({
      YELP_REPORTING_BASE_URL: "https://api.yelp.com",
      YELP_ACCESS_TOKEN: "env-access-token",
      YELP_API_KEY: "env-api-key"
    });

    const { ensureYelpLeadsAccess } = await import("@/lib/yelp/runtime");
    const result = await ensureYelpLeadsAccess("tenant_1");

    expect(result.credential.secret).toBe("saved-secret");
  });

  it("keeps the older API key fallback when no access token is configured", async () => {
    getServerEnv.mockReturnValue({
      YELP_REPORTING_BASE_URL: "https://api.yelp.com",
      YELP_ACCESS_TOKEN: undefined,
      YELP_API_KEY: "fusion-fallback"
    });

    const { ensureYelpLeadsAccess } = await import("@/lib/yelp/runtime");
    const result = await ensureYelpLeadsAccess("tenant_1");

    expect(result.credential.secret).toBe("fusion-fallback");
  });
});
