import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDefaultTenant = vi.fn();
const getCredentialSet = vi.fn();
const upsertCredentialSet = vi.fn();
const recordAuditEvent = vi.fn();

vi.mock("@/lib/db/tenant", () => ({ getDefaultTenant }));
vi.mock("@/lib/db/credentials-repository", () => ({
  getCredentialSet,
  upsertCredentialSet,
}));
vi.mock("@/features/audit/service", () => ({ recordAuditEvent }));
vi.mock("@/lib/utils/crypto", () => ({
  encryptSecret: (value: string) => `encrypted:${value}`,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("MAIN_PLATFORM_WEBHOOK_SHARED_SECRET", "topsecret");
  vi.stubEnv("YELP_CLIENT_ID", "client-id");
  vi.stubEnv("YELP_CLIENT_SECRET", "client-secret");
  getDefaultTenant.mockResolvedValue({ id: "tenant_1", slug: "irbis" });
  getCredentialSet.mockResolvedValue(null);
  upsertCredentialSet.mockResolvedValue({ id: "credential_1" });
  recordAuditEvent.mockResolvedValue({ id: "audit_1" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function buildRequest(secret = "topsecret") {
  return new Request("http://localhost/api/internal/yelp/oauth-token-sync", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-irbis-forward-secret": secret,
    },
    body: JSON.stringify({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      expiresOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      scope: "leads r2r_get_businesses",
    }),
  });
}

describe("Yelp OAuth token sync route", () => {
  it("rejects a missing or invalid shared secret", async () => {
    const { POST } =
      await import("@/app/api/internal/yelp/oauth-token-sync/route");
    const response = await POST(buildRequest("wrong-secret"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Unauthorized.",
    });
    expect(upsertCredentialSet).not.toHaveBeenCalled();
  });

  it("fails closed when machine authentication is not configured", async () => {
    vi.stubEnv("MAIN_PLATFORM_WEBHOOK_SHARED_SECRET", "");
    vi.resetModules();
    const { POST } =
      await import("@/app/api/internal/yelp/oauth-token-sync/route");
    const response = await POST(buildRequest());

    expect(response.status).toBe(503);
    expect(upsertCredentialSet).not.toHaveBeenCalled();
  });

  it("stores the complete OAuth token family encrypted and audits the sync", async () => {
    const { POST } =
      await import("@/app/api/internal/yelp/oauth-token-sync/route");
    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      credentialKind: "REPORTING_FUSION",
      refreshTokenConfigured: true,
    });
    expect(upsertCredentialSet).toHaveBeenCalledWith(
      "tenant_1",
      "REPORTING_FUSION",
      expect.objectContaining({
        usernameEncrypted: "encrypted:client-id",
        secretEncrypted: "encrypted:access-token",
        isEnabled: true,
        lastTestStatus: "UNTESTED",
        metadataJson: expect.objectContaining({
          oauth: expect.objectContaining({
            clientSecretEncrypted: "encrypted:client-secret",
            refreshTokenEncrypted: "encrypted:refresh-token",
            tokenPath: "/oauth2/token/v3",
            tokenSource: "webhook-oauth-callback",
          }),
        }),
      }),
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_1",
        actionType: "settings.credential.reporting_fusion.webhook_oauth_sync",
        status: "SUCCESS",
      }),
    );
  });

  it("rejects an expired token without changing credentials", async () => {
    const request = new Request(
      "http://localhost/api/internal/yelp/oauth-token-sync",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-irbis-forward-secret": "topsecret",
        },
        body: JSON.stringify({
          accessToken: "access-token",
          refreshToken: "refresh-token",
          tokenType: "Bearer",
          expiresOn: new Date(Date.now() - 1000).toISOString(),
        }),
      },
    );
    const { POST } =
      await import("@/app/api/internal/yelp/oauth-token-sync/route");
    const response = await POST(request);

    expect(response.status).toBe(422);
    expect(upsertCredentialSet).not.toHaveBeenCalled();
  });
});
