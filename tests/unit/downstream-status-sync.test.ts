import { beforeEach, describe, expect, it, vi } from "vitest";

const createCrmStatusEventRecord = vi.fn();
const createCrmSyncError = vi.fn();
const createCrmSyncRun = vi.fn();
const findCrmLeadMappingByExternalLeadId = vi.fn();
const findLeadForCrmEnrichment = vi.fn();
const getLeadForCrmEnrichment = vi.fn();
const listLeadOutcomeRows = vi.fn();
const updateCrmLeadMappingRecord = vi.fn();
const updateCrmSyncRun = vi.fn();
const updateLeadCrmFields = vi.fn();
const upsertCrmLeadMappingRecord = vi.fn();
const recordAuditEvent = vi.fn();
const getDefaultTenant = vi.fn();
const logError = vi.fn();
const logInfo = vi.fn();
const retryServiceTitanLifecycleSyncRunWorkflow = vi.fn();

vi.mock("@/lib/db/crm-enrichment-repository", () => ({
  createCrmStatusEventRecord,
  createCrmSyncError,
  createCrmSyncRun,
  findCrmLeadMappingByExternalLeadId,
  findLeadForCrmEnrichment,
  getLeadForCrmEnrichment,
  listLeadOutcomeRows,
  updateCrmLeadMappingRecord,
  updateCrmSyncRun,
  updateLeadCrmFields,
  upsertCrmLeadMappingRecord
}));

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent
}));

vi.mock("@/lib/db/tenant", () => ({
  getDefaultTenant
}));

vi.mock("@/lib/utils/logging", () => ({
  logError,
  logInfo
}));

vi.mock("@/features/crm-connector/lifecycle-service", () => ({
  retryServiceTitanLifecycleSyncRunWorkflow
}));

describe("downstream status sync workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createCrmSyncRun.mockResolvedValue({
      id: "sync_run_1",
      correlationId: "corr_1"
    });
    updateCrmSyncRun.mockResolvedValue({});
    updateLeadCrmFields.mockResolvedValue({});
    updateCrmLeadMappingRecord.mockResolvedValue({});
    recordAuditEvent.mockResolvedValue({});
    getDefaultTenant.mockResolvedValue({
      id: "tenant_1"
    });
    findCrmLeadMappingByExternalLeadId.mockResolvedValue(null);
    logError.mockImplementation(() => {});
    logInfo.mockImplementation(() => {});
  });

  it("does not regress the current lead status when an older CRM event is replayed", async () => {
    getLeadForCrmEnrichment.mockResolvedValue({
      id: "lead_1",
      businessId: "business_1",
      locationId: "location_1",
      internalStatus: "SCHEDULED",
      crmLeadMappings: [
        {
          id: "mapping_1",
          state: "MATCHED",
          locationId: "location_1"
        }
      ],
      crmStatusEvents: [
        {
          id: "crm_status_newer",
          status: "SCHEDULED",
          occurredAt: new Date("2026-04-03T10:00:00.000Z"),
          createdAt: new Date("2026-04-03T10:00:00.000Z")
        }
      ]
    });
    createCrmStatusEventRecord.mockResolvedValue({
      id: "crm_status_older",
      status: "BOOKED",
      occurredAt: new Date("2026-04-02T10:00:00.000Z"),
      createdAt: new Date("2026-04-02T10:00:00.000Z")
    });

    const { appendLeadInternalStatusWorkflow } = await import("@/features/crm-enrichment/service");
    const result = await appendLeadInternalStatusWorkflow(
      "tenant_1",
      null,
      "lead_1",
      {
        status: "BOOKED",
        occurredAt: "2026-04-02T10:00:00.000Z"
      },
      {
        sourceSystem: "CRM",
        externalStatusEventId: "crm_evt_1"
      }
    );

    expect(updateLeadCrmFields).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead_1",
        internalStatus: "SCHEDULED"
      })
    );
    expect(result).toMatchObject({
      crmStatusEventId: "crm_status_older",
      status: "BOOKED",
      currentLeadStatus: "SCHEDULED"
    });
  });

  it("syncs downstream mapping and partner lifecycle events through the machine-write workflow", async () => {
    findLeadForCrmEnrichment.mockResolvedValue({
      id: "lead_1",
      externalLeadId: "lead_ext_1"
    });
    getLeadForCrmEnrichment.mockResolvedValue({
      id: "lead_1",
      businessId: "business_1",
      locationId: null,
      internalStatus: "UNMAPPED",
      crmLeadMappings: [],
      crmStatusEvents: []
    });
    upsertCrmLeadMappingRecord.mockResolvedValue({
      id: "mapping_1",
      state: "MATCHED",
      sourceSystem: "CRM",
      locationId: null,
      externalCrmLeadId: "crm_123",
      externalOpportunityId: null,
      externalJobId: null,
      issueSummary: null,
      matchMethod: null,
      confidenceScore: null,
      matchedAt: new Date("2026-04-03T09:00:00.000Z"),
      lastSyncedAt: new Date("2026-04-03T09:00:00.000Z"),
      location: null
    });
    createCrmStatusEventRecord.mockResolvedValue({
      id: "crm_status_1",
      status: "ACTIVE",
      occurredAt: new Date("2026-04-03T09:15:00.000Z"),
      createdAt: new Date("2026-04-03T09:15:00.000Z")
    });

    const { syncLeadDownstreamStatusWorkflow } = await import("@/features/crm-enrichment/service");
    const result = await syncLeadDownstreamStatusWorkflow({
      updates: [
        {
          externalLeadId: "lead_ext_1",
          mapping: {
            externalCrmLeadId: "crm_123"
          },
          statusEvent: {
            externalStatusEventId: "crm_evt_1",
            status: "ACTIVE",
            occurredAt: "2026-04-03T09:15:00.000Z"
          }
        }
      ]
    });

    expect(upsertCrmLeadMappingRecord).toHaveBeenCalledWith(
      "tenant_1",
      "lead_1",
      expect.objectContaining({
        externalCrmLeadId: "crm_123",
        state: "MATCHED",
        sourceSystem: "CRM"
      })
    );
    expect(createCrmStatusEventRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead_1",
        externalStatusEventId: "crm_evt_1",
        status: "ACTIVE",
        sourceSystem: "CRM"
      })
    );
    expect(result).toMatchObject({
      tenantId: "tenant_1",
      totalUpdates: 1,
      completedCount: 1,
      partialCount: 0,
      failedCount: 0
    });
  });
});
