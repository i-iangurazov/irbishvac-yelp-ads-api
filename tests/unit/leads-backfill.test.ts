import { beforeEach, describe, expect, it, vi } from "vitest";

const getBusinessById = vi.fn();
const countLeadRecords = vi.fn();
const createLeadSyncRun = vi.fn();
const createLeadSyncError = vi.fn();
const createWebhookEventRecord = vi.fn();
const findLeadRecordByExternalLeadId = vi.fn();
const findBusinessesByExternalYelpBusinessId = vi.fn();
const findWebhookEventByKey = vi.fn();
const getLeadRecordById = vi.fn();
const listLeadBackfillRuns = vi.fn();
const listFailedLeadWebhookEvents = vi.fn();
const listLeadBusinessOptions = vi.fn();
const listLeadRecords = vi.fn();
const updateLeadSyncRun = vi.fn();
const updateWebhookEventRecord = vi.fn();
const upsertLeadEventRecords = vi.fn();
const upsertLeadRecord = vi.fn();
const recordAuditEvent = vi.fn();
const ensureYelpLeadsAccess = vi.fn();
const getCapabilityFlags = vi.fn();
const processLeadAutoresponderForNewLead = vi.fn();
const getLeadConversionSummary = vi.fn();
const getDefaultTenant = vi.fn();
const logInfo = vi.fn();
const logError = vi.fn();
const getBusinessLeadIds = vi.fn();
const getLead = vi.fn();
const getLeadEvents = vi.fn();

vi.mock("@/lib/db/businesses-repository", () => ({
  getBusinessById
}));

vi.mock("@/lib/db/leads-repository", () => ({
  countLeadRecords,
  createLeadSyncError,
  createLeadSyncRun,
  createWebhookEventRecord,
  findLeadRecordByExternalLeadId,
  findBusinessesByExternalYelpBusinessId,
  findWebhookEventByKey,
  getLeadRecordById,
  listLeadBackfillRuns,
  listFailedLeadWebhookEvents,
  listLeadBusinessOptions,
  listLeadRecords,
  updateLeadSyncRun,
  updateWebhookEventRecord,
  upsertLeadEventRecords,
  upsertLeadRecord
}));

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent
}));

vi.mock("@/lib/yelp/runtime", () => ({
  ensureYelpLeadsAccess,
  getCapabilityFlags
}));

vi.mock("@/features/autoresponder/service", () => ({
  processLeadAutoresponderForNewLead
}));

vi.mock("@/features/crm-enrichment/service", () => ({
  buildLeadCrmSummary: vi.fn(),
  getLeadConversionSummary
}));

vi.mock("@/lib/db/tenant", () => ({
  getDefaultTenant
}));

vi.mock("@/lib/utils/logging", () => ({
  logInfo,
  logError
}));

vi.mock("@/lib/yelp/leads-client", () => ({
  YelpLeadsClient: vi.fn().mockImplementation(() => ({
    getBusinessLeadIds,
    getLead,
    getLeadEvents
  }))
}));

describe("lead backfill workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBusinessById.mockResolvedValue({
      id: "business_1",
      tenantId: "tenant_1",
      name: "Northwind HVAC",
      encryptedYelpBusinessId: "ys4FVTHxbSepIkvCLHYxCA",
      locationId: "location_1"
    });
    ensureYelpLeadsAccess.mockResolvedValue({
      credential: {
        baseUrl: "https://api.yelp.com",
        secret: "token"
      }
    });
    createLeadSyncRun.mockResolvedValue({
      id: "sync_run_1"
    });
    upsertLeadEventRecords.mockResolvedValue([
      { id: "evt_local_1" }
    ]);
    getLeadConversionSummary.mockResolvedValue({
      bookedLeads: 0,
      scheduledJobs: 0,
      completedJobs: 0,
      closeRate: 0
    });
  });

  it("imports the returned Yelp lead IDs and preserves has_more on the sync run", async () => {
    getBusinessLeadIds.mockResolvedValue({
      data: {
        lead_ids: ["lead_1", "lead_2"],
        has_more: true
      }
    });
    findLeadRecordByExternalLeadId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "local_lead_2",
        internalStatus: "BOOKED",
        firstSeenAt: new Date("2026-04-01T09:00:00.000Z"),
        locationId: "location_1",
        serviceCategoryId: null,
        mappedServiceLabel: "HVAC Repair"
      });
    getLead.mockImplementation(async (leadId: string) => ({
      data: {
        id: leadId,
        business_id: "ys4FVTHxbSepIkvCLHYxCA",
        time_created: "2026-04-01T09:00:00.000Z",
        customer_name: leadId === "lead_1" ? "Jane Doe" : "John Doe"
      }
    }));
    getLeadEvents.mockResolvedValue({
      data: {
        events: [
          {
            event_id: "evt_1",
            event_type: "NEW_EVENT",
            interaction_time: "2026-04-01T09:00:00.000Z"
          }
        ]
      }
    });
    upsertLeadRecord
      .mockResolvedValueOnce({ id: "local_lead_1", externalLeadId: "lead_1" })
      .mockResolvedValueOnce({ id: "local_lead_2", externalLeadId: "lead_2" });

    const { syncBusinessLeadsWorkflow } = await import("@/features/leads/service");
    const result = await syncBusinessLeadsWorkflow("tenant_1", "user_1", {
      businessId: "business_1"
    });

    expect(getBusinessLeadIds).toHaveBeenCalledWith("ys4FVTHxbSepIkvCLHYxCA", { limit: 20 });
    expect(createLeadSyncRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_1",
        businessId: "business_1",
        type: "YELP_LEADS_BACKFILL"
      })
    );
    expect(updateLeadSyncRun).toHaveBeenCalledWith(
      "sync_run_1",
      expect.objectContaining({
        status: "COMPLETED",
        statsJson: expect.objectContaining({
          importedCount: 1,
          updatedCount: 1,
          returnedLeadIds: 2,
          hasMore: true
        })
      })
    );
    expect(result).toMatchObject({
      status: "COMPLETED",
      importedCount: 1,
      updatedCount: 1,
      failedCount: 0,
      returnedLeadIds: 2,
      hasMore: true
    });
  });

  it("records per-lead failures without aborting the entire import", async () => {
    getBusinessLeadIds.mockResolvedValue({
      data: {
        lead_ids: ["lead_1", "lead_2"],
        has_more: false
      }
    });
    findLeadRecordByExternalLeadId.mockResolvedValue(null);
    getLead
      .mockResolvedValueOnce({
        data: {
          id: "lead_1",
          business_id: "ys4FVTHxbSepIkvCLHYxCA",
          time_created: "2026-04-01T09:00:00.000Z"
        }
      })
      .mockRejectedValueOnce(new Error("Rate limited"));
    getLeadEvents.mockResolvedValue({
      data: {
        events: []
      }
    });
    upsertLeadRecord.mockResolvedValueOnce({ id: "local_lead_1", externalLeadId: "lead_1" });

    const { syncBusinessLeadsWorkflow } = await import("@/features/leads/service");
    const result = await syncBusinessLeadsWorkflow("tenant_1", "user_1", {
      businessId: "business_1"
    });

    expect(createLeadSyncError).toHaveBeenCalledWith(
      expect.objectContaining({
        syncRunId: "sync_run_1",
        category: "LEAD_BACKFILL_PROCESSING"
      })
    );
    expect(result).toMatchObject({
      status: "PARTIAL",
      importedCount: 1,
      failedCount: 1
    });
  });
});
