import { beforeEach, describe, expect, it, vi } from "vitest";

import { YelpMissingAccessError } from "@/lib/yelp/errors";

const mocks = vi.hoisted(() => ({
  getCredentialSet: vi.fn(),
  listCredentialSets: vi.fn(),
  updateCredentialTestResult: vi.fn(),
  upsertCredentialSet: vi.fn(),
  listLeadBusinessOptions: vi.fn(),
  getSystemSetting: vi.fn(),
  upsertSystemSetting: vi.fn(),
  recordAuditEvent: vi.fn(),
  getCapabilityFlags: vi.fn(),
  getCredentialConfig: vi.fn(),
  ensureYelpLeadsAccess: vi.fn(),
  getBusinessLeadIds: vi.fn(),
}));

vi.mock("@/lib/db/credentials-repository", () => ({
  getCredentialSet: mocks.getCredentialSet,
  listCredentialSets: mocks.listCredentialSets,
  updateCredentialTestResult: mocks.updateCredentialTestResult,
  upsertCredentialSet: mocks.upsertCredentialSet,
}));

vi.mock("@/lib/db/leads-repository", () => ({
  listLeadBusinessOptions: mocks.listLeadBusinessOptions,
}));

vi.mock("@/lib/db/settings-repository", () => ({
  getSystemSetting: mocks.getSystemSetting,
  upsertSystemSetting: mocks.upsertSystemSetting,
}));

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock("@/lib/utils/crypto", () => ({
  encryptSecret: (value: string) => `encrypted:${value}`,
}));

vi.mock("@/lib/utils/env", () => ({
  getServerEnv: () => ({
    YELP_REPORTING_BASE_URL: "https://api.yelp.com",
    YELP_BUSINESS_MATCH_BASE_URL: "https://api.yelp.com",
    YELP_DATA_INGESTION_BASE_URL: "https://api.yelp.com",
    YELP_ADS_BASE_URL: "https://partner-api.yelp.com",
  }),
}));

vi.mock("@/lib/yelp/runtime", () => ({
  getCapabilityFlags: mocks.getCapabilityFlags,
  getCredentialConfig: mocks.getCredentialConfig,
  ensureYelpLeadsAccess: mocks.ensureYelpLeadsAccess,
}));

vi.mock("@/lib/yelp/leads-client", () => ({
  YelpLeadsClient: class {
    getBusinessLeadIds = mocks.getBusinessLeadIds;
  },
}));

const credential = {
  label: "Yelp API Bearer Token",
  baseUrl: "https://api.yelp.com",
  isEnabled: true,
  secret: "current-access-token",
};

describe("settings credential service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCapabilityFlags.mockResolvedValue({
      hasLeadsApi: true,
      hasReportingApi: true,
      reportingApiEnabled: true,
    });
    mocks.getCredentialConfig.mockResolvedValue(credential);
    mocks.ensureYelpLeadsAccess.mockResolvedValue({ credential });
    mocks.getSystemSetting.mockResolvedValue(null);
    mocks.upsertSystemSetting.mockResolvedValue({});
    mocks.recordAuditEvent.mockResolvedValue({});
    mocks.updateCredentialTestResult.mockResolvedValue({});
  });

  it("removes a stale refresh-token family when a new access token is pasted alone", async () => {
    const existing = {
      id: "credential_1",
      tenantId: "tenant_1",
      kind: "REPORTING_FUSION",
      label: "Yelp API Bearer Token",
      usernameEncrypted: "encrypted:old-client-id",
      secretEncrypted: "encrypted:old-access-token",
      baseUrl: "https://api.yelp.com",
      isEnabled: true,
      metadataJson: {
        oauth: {
          clientSecretEncrypted: "encrypted:old-client-secret",
          refreshTokenEncrypted: "encrypted:stale-refresh-token",
          refreshTokenExpiresAt: "2027-01-01T00:00:00.000Z",
          accessTokenExpiresAt: "2026-01-01T00:00:00.000Z",
          lastRefreshedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    };
    mocks.getCredentialSet.mockResolvedValue(existing);
    mocks.upsertCredentialSet.mockImplementation(
      async (_tenantId, _kind, data) => ({ ...existing, ...data }),
    );

    const { saveCredentialSet } = await import("@/features/settings/service");
    await saveCredentialSet("tenant_1", "actor_1", {
      kind: "REPORTING_FUSION",
      label: "Yelp API Bearer Token",
      secret: "new-access-token",
      oauthClientId: "current-client-id",
      oauthClientSecret: "current-client-secret",
      oauthRefreshToken: "",
      baseUrl: "https://api.yelp.com",
      isEnabled: true,
      testPath: "",
    });

    const saved = mocks.upsertCredentialSet.mock.calls[0]?.[2];
    expect(saved.metadataJson.oauth).toEqual({
      clientSecretEncrypted: "encrypted:current-client-secret",
      tokenPath: "/oauth2/token/v3",
    });
    expect(saved.secretEncrypted).toBe("encrypted:new-access-token");
  });

  it("tests the next saved business when the token cannot access the first one", async () => {
    mocks.getCredentialSet.mockResolvedValue({
      id: "credential_1",
      tenantId: "tenant_1",
      kind: "REPORTING_FUSION",
    });
    mocks.listLeadBusinessOptions.mockResolvedValue([
      {
        id: "business_1",
        name: "First business",
        locationId: null,
        encryptedYelpBusinessId: "inaccessible-yelp-id",
      },
      {
        id: "business_2",
        name: "Second business",
        locationId: null,
        encryptedYelpBusinessId: "accessible-yelp-id",
      },
    ]);
    mocks.getBusinessLeadIds
      .mockRejectedValueOnce(
        new YelpMissingAccessError("No access to the first business."),
      )
      .mockResolvedValueOnce({ data: { lead_ids: [], has_more: false } });

    const { testCredentialConnection } =
      await import("@/features/settings/service");
    const result = await testCredentialConnection(
      "tenant_1",
      "actor_1",
      "REPORTING_FUSION",
    );

    expect(result).toEqual({
      status: "SUCCESS",
      message: "Connection successful.",
    });
    expect(mocks.getBusinessLeadIds).toHaveBeenNthCalledWith(
      1,
      "inaccessible-yelp-id",
      { limit: 1, offset: 0 },
    );
    expect(mocks.getBusinessLeadIds).toHaveBeenNthCalledWith(
      2,
      "accessible-yelp-id",
      { limit: 1, offset: 0 },
    );
    expect(mocks.updateCredentialTestResult).toHaveBeenCalledWith(
      "tenant_1",
      "REPORTING_FUSION",
      "SUCCESS",
    );
  });
});
