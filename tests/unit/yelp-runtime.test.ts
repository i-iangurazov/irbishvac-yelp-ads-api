import { beforeEach, describe, expect, it, vi } from "vitest";

const getCredentialSet = vi.fn();
const updateCredentialAuthMaterial = vi.fn();
const getSystemSetting = vi.fn();
const decryptSecret = vi.fn();
const encryptSecret = vi.fn();
const getServerEnv = vi.fn();
const refreshYelpOAuthAccessToken = vi.fn();

vi.mock("@/lib/db/credentials-repository", () => ({
  getCredentialSet,
  updateCredentialAuthMaterial,
}));

vi.mock("@/lib/db/settings-repository", () => ({
  getSystemSetting,
}));

vi.mock("@/lib/utils/crypto", () => ({
  decryptSecret,
  encryptSecret,
}));

vi.mock("@/lib/utils/env", () => ({
  getServerEnv,
}));

vi.mock("@/lib/yelp/oauth", () => ({
  refreshYelpOAuthAccessToken,
}));

describe("Yelp runtime", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getSystemSetting.mockResolvedValue({
      hasLeadsApi: true,
    });
    getCredentialSet.mockResolvedValue(null);
    decryptSecret.mockImplementation((value: string) => value);
    encryptSecret.mockImplementation((value: string) => `encrypted:${value}`);
    updateCredentialAuthMaterial.mockResolvedValue({});
    getServerEnv.mockReturnValue({
      YELP_REPORTING_BASE_URL: "https://api.yelp.com",
      YELP_CLIENT_ID: undefined,
      YELP_CLIENT_SECRET: undefined,
      YELP_ACCESS_TOKEN: undefined,
      YELP_API_KEY: undefined,
    });
  });

  it("uses YELP_ACCESS_TOKEN as the explicit Leads bearer-token fallback", async () => {
    getServerEnv.mockReturnValue({
      YELP_REPORTING_BASE_URL: "https://api.yelp.com",
      YELP_CLIENT_ID: undefined,
      YELP_CLIENT_SECRET: undefined,
      YELP_ACCESS_TOKEN: "partner-access-token",
      YELP_API_KEY: "older-api-key",
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
      metadataJson: null,
    });
    getServerEnv.mockReturnValue({
      YELP_REPORTING_BASE_URL: "https://api.yelp.com",
      YELP_CLIENT_ID: undefined,
      YELP_CLIENT_SECRET: undefined,
      YELP_ACCESS_TOKEN: "env-access-token",
      YELP_API_KEY: "env-api-key",
    });

    const { ensureYelpLeadsAccess } = await import("@/lib/yelp/runtime");
    const result = await ensureYelpLeadsAccess("tenant_1");

    expect(result.credential.secret).toBe("saved-secret");
  });

  it("keeps the older API key fallback when no access token is configured", async () => {
    getServerEnv.mockReturnValue({
      YELP_REPORTING_BASE_URL: "https://api.yelp.com",
      YELP_CLIENT_ID: undefined,
      YELP_CLIENT_SECRET: undefined,
      YELP_ACCESS_TOKEN: undefined,
      YELP_API_KEY: "fusion-fallback",
    });

    const { ensureYelpLeadsAccess } = await import("@/lib/yelp/runtime");
    const result = await ensureYelpLeadsAccess("tenant_1");

    expect(result.credential.secret).toBe("fusion-fallback");
  });

  it("prefers YELP_API_KEY for Business Subscriptions because Yelp documents it as a Places API-key flow", async () => {
    getServerEnv.mockReturnValue({
      YELP_REPORTING_BASE_URL: "https://api.yelp.com",
      YELP_CLIENT_ID: undefined,
      YELP_CLIENT_SECRET: undefined,
      YELP_ACCESS_TOKEN: "oauth-leads-token",
      YELP_API_KEY: "places-api-key",
    });

    const { ensureYelpBusinessSubscriptionsAccess } =
      await import("@/lib/yelp/runtime");
    const result = await ensureYelpBusinessSubscriptionsAccess("tenant_1");

    expect(result.credential.secret).toBe("places-api-key");
  });

  it("refreshes an expired saved OAuth access token before returning Leads credentials", async () => {
    refreshYelpOAuthAccessToken.mockResolvedValue({
      accessToken: "new-access-token",
      tokenType: "Bearer",
      accessTokenExpiresAt: "2026-06-01T00:00:00.000Z",
      refreshToken: "new-refresh-token",
      refreshTokenExpiresAt: "2027-06-01T00:00:00.000Z",
      rawResponse: {},
    });
    getCredentialSet.mockResolvedValue({
      label: "Saved OAuth token",
      baseUrl: "https://api.yelp.com",
      isEnabled: true,
      usernameEncrypted: "saved-client-id",
      secretEncrypted: "old-access-token",
      metadataJson: {
        oauth: {
          clientSecretEncrypted: "saved-client-secret",
          refreshTokenEncrypted: "saved-refresh-token",
          accessTokenExpiresAt: new Date(
            Date.now() - 60 * 60 * 1000,
          ).toISOString(),
        },
      },
    });

    const { ensureYelpLeadsAccess } = await import("@/lib/yelp/runtime");
    const result = await ensureYelpLeadsAccess("tenant_1");

    expect(refreshYelpOAuthAccessToken).toHaveBeenCalledWith({
      clientId: "saved-client-id",
      clientSecret: "saved-client-secret",
      refreshToken: "saved-refresh-token",
      baseUrl: "https://api.yelp.com",
      tokenPath: "/oauth2/token/v3",
    });
    expect(updateCredentialAuthMaterial).toHaveBeenCalledWith(
      "tenant_1",
      "REPORTING_FUSION",
      expect.objectContaining({
        secretEncrypted: "encrypted:new-access-token",
        metadataJson: expect.objectContaining({
          oauth: expect.objectContaining({
            refreshTokenEncrypted: "encrypted:new-refresh-token",
            accessTokenExpiresAt: "2026-06-01T00:00:00.000Z",
            refreshTokenExpiresAt: "2027-06-01T00:00:00.000Z",
          }),
        }),
      }),
    );
    expect(result.credential.secret).toBe("new-access-token");
  });

  it("keeps an unexpired saved OAuth access token without refreshing", async () => {
    getCredentialSet.mockResolvedValue({
      label: "Saved OAuth token",
      baseUrl: "https://api.yelp.com",
      isEnabled: true,
      usernameEncrypted: "saved-client-id",
      secretEncrypted: "current-access-token",
      metadataJson: {
        oauth: {
          clientSecretEncrypted: "saved-client-secret",
          refreshTokenEncrypted: "saved-refresh-token",
          accessTokenExpiresAt: new Date(
            Date.now() + 60 * 60 * 1000,
          ).toISOString(),
        },
      },
    });

    const { ensureYelpLeadsAccess } = await import("@/lib/yelp/runtime");
    const result = await ensureYelpLeadsAccess("tenant_1");

    expect(refreshYelpOAuthAccessToken).not.toHaveBeenCalled();
    expect(updateCredentialAuthMaterial).not.toHaveBeenCalled();
    expect(result.credential.secret).toBe("current-access-token");
  });
});
