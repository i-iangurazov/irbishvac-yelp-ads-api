import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshOperatorIssues = vi.fn();
const refreshOperatorIssuesIfStale = vi.fn();
const recordAuditEvent = vi.fn();
const getCredentialSet = vi.fn();
const updateCredentialTestResult = vi.fn();
const upsertCredentialSet = vi.fn();
const getConnectorInventoryCounts = vi.fn();
const listConnectorBusinesses = vi.fn();
const listConnectorLocations = vi.fn();
const listConnectorServiceCategories = vi.fn();
const listOpenConnectorIssues = vi.fn();
const listRecentConnectorSyncRuns = vi.fn();
const updateBusinessLocationAssignment = vi.fn();
const updateLocationConnectorReference = vi.fn();
const updateServiceCategoryConnectorCodes = vi.fn();
const createConnectorSyncRun = vi.fn();
const updateConnectorSyncRun = vi.fn();
const createConnectorSyncError = vi.fn();
const getSystemSetting = vi.fn();
const upsertSystemSetting = vi.fn();
const getCapabilityFlags = vi.fn();
const getServiceTitanCredentialConfig = vi.fn();
const getDefaultServiceTitanUrls = vi.fn();
const getServiceTitanLifecycleSyncOverview = vi.fn();
const encryptSecret = vi.fn();
const logError = vi.fn();
const testConnection = vi.fn();
const listBusinessUnits = vi.fn();
const listCategories = vi.fn();
const ServiceTitanClient = vi.fn();
const recordServiceTitanMetric = vi.fn();

vi.mock("@/features/issues/service", () => ({
  refreshOperatorIssues,
  refreshOperatorIssuesIfStale
}));

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent
}));

vi.mock("@/lib/db/credentials-repository", () => ({
  getCredentialSet,
  updateCredentialTestResult,
  upsertCredentialSet
}));

vi.mock("@/lib/db/crm-connector-repository", () => ({
  getConnectorInventoryCounts,
  listConnectorBusinesses,
  listConnectorLocations,
  listConnectorServiceCategories,
  listOpenConnectorIssues,
  listRecentConnectorSyncRuns,
  updateBusinessLocationAssignment,
  updateLocationConnectorReference,
  updateServiceCategoryConnectorCodes,
  createConnectorSyncRun,
  updateConnectorSyncRun,
  createConnectorSyncError
}));

vi.mock("@/lib/db/settings-repository", () => ({
  getSystemSetting,
  upsertSystemSetting
}));

vi.mock("@/lib/yelp/runtime", () => ({
  getCapabilityFlags
}));

vi.mock("@/lib/servicetitan/runtime", () => ({
  getServiceTitanCredentialConfig,
  getDefaultServiceTitanUrls
}));

vi.mock("@/features/crm-connector/lifecycle-service", () => ({
  getServiceTitanLifecycleSyncOverview
}));

vi.mock("@/lib/utils/crypto", () => ({
  encryptSecret
}));

vi.mock("@/lib/utils/logging", () => ({
  logError
}));

vi.mock("@/lib/servicetitan/client", () => ({
  ServiceTitanClient,
  normalizeServiceTitanError: (error: Error) => error
}));

vi.mock("@/features/operations/observability-service", () => ({
  recordServiceTitanMetric
}));

describe("ServiceTitan connector workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getDefaultServiceTitanUrls.mockReturnValue({
      apiBaseUrl: "https://api-integration.servicetitan.io",
      authBaseUrl: "https://auth-integration.servicetitan.io"
    });
    getServiceTitanLifecycleSyncOverview.mockResolvedValue({
      coverage: {
        pollableLeadCount: 3,
        manualOnlyMappedLeadCount: 1,
        dueLeadCount: 1,
        staleLeadCount: 1
      },
      latestSuccessfulRun: {
        id: "sync_lifecycle_1",
        status: "COMPLETED",
        startedAt: new Date("2026-04-07T08:00:00.000Z"),
        finishedAt: new Date("2026-04-07T08:05:00.000Z")
      },
      latestProblemRun: null,
      recentRuns: []
    });
    getCapabilityFlags.mockResolvedValue({
      hasCrmIntegration: true
    });
    refreshOperatorIssuesIfStale.mockResolvedValue(undefined);
    getConnectorInventoryCounts.mockResolvedValue({
      totalBusinesses: 2,
      businessesWithLocation: 1,
      businessesWithoutLocation: 1,
      totalLocations: 2,
      locationsWithExternalReference: 1,
      locationsWithoutExternalReference: 1,
      totalServiceCategories: 2,
      serviceCategoriesWithCodes: 1,
      serviceCategoriesWithoutCodes: 1,
      mappedLeads: 3,
      unresolvedLeadMappings: 2,
      openConnectorIssues: 1
    });
    listConnectorBusinesses.mockResolvedValue([
      {
        id: "biz_1",
        name: "IRBIS North",
        encryptedYelpBusinessId: "yelp_biz_1",
        locationId: "loc_1",
        location: {
          id: "loc_1",
          name: "North Branch",
          externalCrmLocationId: "bu_1"
        },
        _count: {
          yelpLeads: 8
        }
      },
      {
        id: "biz_2",
        name: "IRBIS South",
        encryptedYelpBusinessId: "yelp_biz_2",
        locationId: null,
        location: null,
        _count: {
          yelpLeads: 3
        }
      }
    ]);
    listConnectorLocations.mockResolvedValue([
      {
        id: "loc_1",
        name: "North Branch",
        code: "NORTH",
        externalCrmLocationId: "bu_1",
        _count: {
          businesses: 1,
          yelpLeads: 8,
          crmLeadMappings: 3
        }
      },
      {
        id: "loc_2",
        name: "South Branch",
        code: "SOUTH",
        externalCrmLocationId: null,
        _count: {
          businesses: 0,
          yelpLeads: 0,
          crmLeadMappings: 0
        }
      }
    ]);
    listConnectorServiceCategories.mockResolvedValue([
      {
        id: "svc_1",
        name: "Plumbing",
        slug: "plumbing",
        crmCodesJson: ["cat_1"],
        _count: {
          yelpLeads: 5,
          yelpReportingSnapshots: 2
        }
      },
      {
        id: "svc_2",
        name: "Water Heater",
        slug: "water-heater",
        crmCodesJson: [],
        _count: {
          yelpLeads: 4,
          yelpReportingSnapshots: 1
        }
      }
    ]);
    listRecentConnectorSyncRuns.mockResolvedValue([
      {
        id: "sync_1",
        type: "LOCATION_MAPPING",
        status: "COMPLETED",
        startedAt: new Date("2026-04-07T08:00:00.000Z"),
        finishedAt: new Date("2026-04-07T08:01:00.000Z"),
        _count: { errors: 0 }
      },
      {
        id: "sync_2",
        type: "SERVICE_MAPPING",
        status: "FAILED",
        startedAt: new Date("2026-04-07T09:00:00.000Z"),
        finishedAt: new Date("2026-04-07T09:01:00.000Z"),
        _count: { errors: 1 }
      }
    ]);
    listOpenConnectorIssues.mockResolvedValue([
      {
        id: "issue_1",
        issueType: "CRM_SYNC_FAILURE",
        severity: "HIGH",
        summary: "ServiceTitan category sync failed.",
        lastDetectedAt: new Date("2026-04-07T09:02:00.000Z"),
        location: null,
        business: null,
        lead: null,
        syncRun: {
          id: "sync_2",
          type: "SERVICE_MAPPING",
          status: "FAILED"
        }
      }
    ]);
    getSystemSetting.mockResolvedValue({
      environment: "INTEGRATION",
      syncedAt: "2026-04-07T08:01:00.000Z",
      businessUnits: {
        syncedAt: "2026-04-07T08:01:00.000Z",
        totalCount: 2,
        hasMore: false,
        rows: [
          { id: "bu_1", name: "North BU", active: true },
          { id: "bu_2", name: "South BU", active: true }
        ]
      },
      categories: {
        syncedAt: "2026-04-07T08:02:00.000Z",
        totalCount: 2,
        hasMore: false,
        rows: [
          { id: "cat_1", name: "Plumbing", active: true },
          { id: "cat_2", name: "Drain Cleaning", active: true }
        ]
      }
    });
    getCredentialSet.mockResolvedValue({
      kind: "CRM_SERVICETITAN",
      label: "ServiceTitan Connector",
      isEnabled: true,
      lastTestStatus: "SUCCESS",
      lastErrorMessage: null,
      lastTestedAt: new Date("2026-04-07T07:55:00.000Z"),
      secretEncrypted: "configured",
      usernameEncrypted: "configured",
      baseUrl: "https://api-integration.servicetitan.io",
      metadataJson: {
        environment: "INTEGRATION",
        authBaseUrl: "https://auth-integration.servicetitan.io",
        tenantId: "tenant-123",
        appKey: "app-key-123"
      }
    });
    getServiceTitanCredentialConfig.mockResolvedValue({
      label: "ServiceTitan Connector",
      isEnabled: true,
      environment: "INTEGRATION",
      apiBaseUrl: "https://api-integration.servicetitan.io",
      authBaseUrl: "https://auth-integration.servicetitan.io",
      tenantId: "tenant-123",
      appKey: "app-key-123",
      clientId: "client-id-123",
      clientSecret: "client-secret-123"
    });
    ServiceTitanClient.mockImplementation(() => ({
      testConnection,
      listBusinessUnits,
      listCategories
    }));
    testConnection.mockResolvedValue({
      totalCount: 1,
      employeeSampleCount: 1
    });
    listBusinessUnits.mockResolvedValue({
      totalCount: 2,
      hasMore: false,
      rows: [
        { id: "bu_1", name: "North BU", active: true, code: null },
        { id: "bu_2", name: "South BU", active: true, code: null }
      ]
    });
    listCategories.mockResolvedValue({
      totalCount: 2,
      hasMore: false,
      rows: [
        { id: "cat_1", name: "Plumbing", active: true },
        { id: "cat_2", name: "Drain Cleaning", active: true }
      ]
    });
    createConnectorSyncRun
      .mockResolvedValueOnce({ id: "sync_locations" })
      .mockResolvedValueOnce({ id: "sync_services" });
    updateConnectorSyncRun.mockResolvedValue({});
    upsertSystemSetting.mockResolvedValue({});
    upsertCredentialSet.mockResolvedValue({
      id: "cred_1",
      kind: "CRM_SERVICETITAN",
      label: "ServiceTitan Connector",
      usernameEncrypted: "configured",
      secretEncrypted: "configured",
      isEnabled: true
    });
    recordAuditEvent.mockResolvedValue({});
    encryptSecret.mockImplementation((value: string) => `encrypted:${value}`);
  });

  it("shapes the connector overview with mapping health and open issues", async () => {
    const { getServiceTitanConnectorOverview } = await import("@/features/crm-connector/service");
    const result = await getServiceTitanConnectorOverview("tenant_1");

    expect(refreshOperatorIssuesIfStale).toHaveBeenCalledWith("tenant_1");
    expect(result.counts.businessesWithoutLocation).toBe(1);
    expect(result.businesses[0]).toMatchObject({
      name: "IRBIS North",
      locationName: "North Branch",
      locationConnectorReferenceName: "North BU"
    });
    expect(result.serviceCategories[0].connectorMatches[0]).toMatchObject({
      id: "cat_1",
      name: "Plumbing"
    });
    expect(result.openIssues[0]).toMatchObject({
      typeLabel: "CRM sync failure",
      targetLabel: "Connector"
    });
  });

  it("preserves the existing client secret when config changes omit it", async () => {
    const { saveServiceTitanConnectorWorkflow } = await import("@/features/crm-connector/service");

    await saveServiceTitanConnectorWorkflow("tenant_1", "user_1", {
      label: "ServiceTitan Connector",
      environment: "INTEGRATION",
      tenantId: "tenant-123",
      appKey: "app-key-123",
      clientId: "client-id-123",
      clientSecret: "",
      apiBaseUrl: "https://api-integration.servicetitan.io",
      authBaseUrl: "https://auth-integration.servicetitan.io",
      isEnabled: true
    });

    expect(upsertCredentialSet).toHaveBeenCalledWith(
      "tenant_1",
      "CRM_SERVICETITAN",
      expect.objectContaining({
        secretEncrypted: "configured",
        usernameEncrypted: "encrypted:client-id-123"
      })
    );
    expect(upsertSystemSetting).toHaveBeenCalledWith(
      "tenant_1",
      "yelpCapabilities",
      expect.objectContaining({
        hasCrmIntegration: true
      })
    );
  });

  it("runs ServiceTitan reference syncs and stores catalog results", async () => {
    const { syncServiceTitanReferenceDataWorkflow } = await import("@/features/crm-connector/service");

    const result = await syncServiceTitanReferenceDataWorkflow("tenant_1", "user_1", {
      scope: "ALL"
    });

    expect(ServiceTitanClient).toHaveBeenCalled();
    expect(createConnectorSyncRun).toHaveBeenCalledTimes(2);
    expect(updateConnectorSyncRun).toHaveBeenCalledWith(
      "sync_locations",
      expect.objectContaining({
        status: "COMPLETED"
      })
    );
    expect(updateConnectorSyncRun).toHaveBeenCalledWith(
      "sync_services",
      expect.objectContaining({
        status: "COMPLETED"
      })
    );
    expect(upsertSystemSetting).toHaveBeenCalledWith(
      "tenant_1",
      "crmConnector.serviceTitan.catalog",
      expect.objectContaining({
        businessUnits: expect.objectContaining({
          totalCount: 2
        })
      })
    );
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "LOCATION_MAPPING",
          status: "COMPLETED"
        }),
        expect.objectContaining({
          type: "SERVICE_MAPPING",
          status: "COMPLETED"
        })
      ])
    );
  });
});
