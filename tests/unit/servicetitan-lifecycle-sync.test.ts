import { beforeEach, describe, expect, it, vi } from "vitest";

const recordAuditEvent = vi.fn();
const listTenantIdsWithEnabledCredential = vi.fn();
const countServiceTitanLifecycleCoverage = vi.fn();
const findLocationByConnectorReference = vi.fn();
const listRecentConnectorSyncRuns = vi.fn();
const listServiceTitanLifecycleCandidates = vi.fn();
const createCrmStatusEventRecord = vi.fn();
const createCrmSyncRun = vi.fn();
const createCrmSyncError = vi.fn();
const getCrmSyncRunById = vi.fn();
const getLeadForCrmEnrichment = vi.fn();
const updateCrmLeadMappingRecord = vi.fn();
const updateCrmSyncRun = vi.fn();
const updateLeadCrmFields = vi.fn();
const logError = vi.fn();
const logInfo = vi.fn();
const getServiceTitanCredentialConfig = vi.fn();
const getLeadById = vi.fn();
const getJobById = vi.fn();
const listAppointmentsForJob = vi.fn();
const recordServiceTitanMetric = vi.fn();

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent
}));

vi.mock("@/lib/db/credentials-repository", () => ({
  listTenantIdsWithEnabledCredential
}));

vi.mock("@/lib/db/crm-connector-repository", () => ({
  countServiceTitanLifecycleCoverage,
  findLocationByConnectorReference,
  listRecentConnectorSyncRuns,
  listServiceTitanLifecycleCandidates
}));

vi.mock("@/lib/db/crm-enrichment-repository", () => ({
  createCrmStatusEventRecord,
  createCrmSyncRun,
  createCrmSyncError,
  getCrmSyncRunById,
  getLeadForCrmEnrichment,
  updateCrmLeadMappingRecord,
  updateCrmSyncRun,
  updateLeadCrmFields
}));

vi.mock("@/lib/utils/logging", () => ({
  logError,
  logInfo
}));

vi.mock("@/lib/servicetitan/runtime", () => ({
  getServiceTitanCredentialConfig
}));

vi.mock("@/lib/servicetitan/client", () => ({
  ServiceTitanClient: vi.fn(() => ({
    getLeadById,
    getJobById,
    listAppointmentsForJob
  }))
}));

vi.mock("@/features/operations/observability-service", () => ({
  recordServiceTitanMetric
}));

describe("ServiceTitan lifecycle sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    countServiceTitanLifecycleCoverage.mockResolvedValue({
      pollableLeadCount: 5,
      manualOnlyMappedLeadCount: 1,
      dueLeadCount: 2,
      staleLeadCount: 1
    });
    listRecentConnectorSyncRuns.mockResolvedValue([]);
    createCrmSyncRun.mockResolvedValue({
      id: "sync_1",
      correlationId: "corr_1"
    });
    updateCrmSyncRun.mockResolvedValue({});
    updateCrmLeadMappingRecord.mockResolvedValue({});
    updateLeadCrmFields.mockResolvedValue({});
    createCrmSyncError.mockResolvedValue({});
    recordAuditEvent.mockResolvedValue({});
    findLocationByConnectorReference.mockResolvedValue({
      id: "loc_1",
      name: "North Branch",
      externalCrmLocationId: "bu_1"
    });
    getServiceTitanCredentialConfig.mockResolvedValue({
      label: "ServiceTitan Connector",
      isEnabled: true,
      environment: "INTEGRATION",
      apiBaseUrl: "https://api-integration.servicetitan.io",
      authBaseUrl: "https://auth-integration.servicetitan.io",
      tenantId: "st-tenant-1",
      appKey: "app-key",
      clientId: "client-id",
      clientSecret: "client-secret"
    });
    logError.mockImplementation(() => {});
    logInfo.mockImplementation(() => {});
  });

  it("labels lifecycle runs separately from reference syncs", async () => {
    listRecentConnectorSyncRuns.mockResolvedValueOnce([
      {
        id: "sync_1",
        type: "CRM_LEAD_ENRICHMENT",
        status: "COMPLETED",
        requestJson: {
          action: "servicetitan_lifecycle_sync",
          mode: "DUE"
        },
        startedAt: new Date("2026-04-07T08:00:00.000Z"),
        finishedAt: new Date("2026-04-07T08:05:00.000Z")
      },
      {
        id: "sync_2",
        type: "LOCATION_MAPPING",
        status: "COMPLETED",
        requestJson: {
          action: "servicetitan.business_units.sync"
        },
        startedAt: new Date("2026-04-07T07:00:00.000Z"),
        finishedAt: new Date("2026-04-07T07:01:00.000Z")
      }
    ]);

    const { getServiceTitanLifecycleSyncOverview } = await import("@/features/crm-connector/lifecycle-service");
    const overview = await getServiceTitanLifecycleSyncOverview("tenant_1");

    expect(overview.coverage).toMatchObject({
      pollableLeadCount: 5,
      staleLeadCount: 1
    });
    expect(overview.recentRuns).toHaveLength(1);
    expect(overview.recentRuns[0]).toMatchObject({
      id: "sync_1",
      typeLabel: "ServiceTitan lifecycle sync",
      mode: "DUE"
    });
  });

  it("reconciles ServiceTitan lead and job state into partner lifecycle history", async () => {
    listServiceTitanLifecycleCandidates.mockResolvedValueOnce([
      {
        id: "mapping_1",
        lead: {
          id: "lead_1"
        }
      }
    ]);
    getLeadForCrmEnrichment.mockResolvedValueOnce({
      id: "lead_1",
      externalLeadId: "yelp_lead_1",
      businessId: "business_1",
      locationId: null,
      internalStatus: "UNMAPPED",
      location: null,
      crmStatusEvents: [],
      crmLeadMappings: [
        {
          id: "mapping_1",
          state: "MATCHED",
          locationId: null,
          location: null,
          externalCrmLeadId: "st_lead_1",
          externalOpportunityId: null,
          externalJobId: null,
          metadataJson: null
        }
      ]
    });
    getLeadById.mockResolvedValueOnce({
      id: "st_lead_1",
      status: "Won",
      modifiedOn: "2026-04-07T09:15:00.000Z",
      businessUnitId: "bu_1",
      jobId: "job_123"
    });
    getJobById.mockResolvedValueOnce({
      id: "job_123",
      status: "Scheduled",
      modifiedOn: "2026-04-07T10:00:00.000Z",
      businessUnitId: "bu_1"
    });
    listAppointmentsForJob.mockResolvedValueOnce({
      rows: [
        {
          id: "appt_1",
          status: "Scheduled",
          startsOn: "2026-04-08T09:00:00.000Z"
        }
      ]
    });
    createCrmStatusEventRecord.mockImplementation(
      async (input: { status: string; externalStatusEventId: string; occurredAt: Date }) => ({
      id: input.externalStatusEventId,
      status: input.status,
      occurredAt: input.occurredAt,
      createdAt: input.occurredAt
    })
    );

    const { syncServiceTitanLifecycleWorkflow } = await import("@/features/crm-connector/lifecycle-service");
    const result = await syncServiceTitanLifecycleWorkflow("tenant_1", "user_1", {
      mode: "DUE",
      limit: 10
    });

    expect(updateCrmLeadMappingRecord).toHaveBeenCalledWith(
      "mapping_1",
      expect.objectContaining({
        externalJobId: "job_123",
        locationId: "loc_1"
      })
    );
    expect(updateLeadCrmFields).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead_1",
        internalStatus: "SCHEDULED",
        locationId: "loc_1"
      })
    );
    expect(result).toMatchObject({
      selectedCount: 1,
      completedCount: 1,
      partialCount: 0,
      failedCount: 0
    });
  });

  it("records failed lifecycle syncs when ServiceTitan data is missing", async () => {
    listServiceTitanLifecycleCandidates.mockResolvedValueOnce([
      {
        id: "mapping_1",
        lead: {
          id: "lead_1"
        }
      }
    ]);
    getLeadForCrmEnrichment.mockResolvedValueOnce({
      id: "lead_1",
      externalLeadId: "yelp_lead_1",
      businessId: "business_1",
      locationId: null,
      internalStatus: "ACTIVE",
      location: null,
      crmStatusEvents: [],
      crmLeadMappings: [
        {
          id: "mapping_1",
          state: "MATCHED",
          locationId: null,
          location: null,
          externalCrmLeadId: "st_lead_1",
          externalOpportunityId: null,
          externalJobId: null,
          metadataJson: null
        }
      ]
    });
    getLeadById.mockRejectedValueOnce(
      Object.assign(new Error("The requested ServiceTitan record was not found."), {
        code: "UPSTREAM_NOT_FOUND"
      })
    );

    const { syncServiceTitanLifecycleWorkflow } = await import("@/features/crm-connector/lifecycle-service");
    const result = await syncServiceTitanLifecycleWorkflow("tenant_1", "user_1", {
      mode: "DUE",
      limit: 10
    });

    expect(createCrmSyncError).toHaveBeenCalled();
    expect(result).toMatchObject({
      selectedCount: 1,
      completedCount: 0,
      failedCount: 1
    });
  });
});
