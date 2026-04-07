import { beforeEach, describe, expect, it, vi } from "vitest";

const getBusinessById = vi.fn();
const countLeadRecords = vi.fn();
const createLeadSyncError = vi.fn();
const createLeadSyncRun = vi.fn();
const createWebhookEventRecord = vi.fn();
const findBusinessesByExternalYelpBusinessId = vi.fn();
const findLeadRecordByExternalLeadId = vi.fn();
const findWebhookEventByKey = vi.fn();
const getLeadRecordById = vi.fn();
const listFailedLeadWebhookEvents = vi.fn();
const listLeadBackfillRuns = vi.fn();
const listLeadBusinessOptions = vi.fn();
const listLeadRecords = vi.fn();
const updateLeadSyncRun = vi.fn();
const updateWebhookEventRecord = vi.fn();
const upsertLeadEventRecords = vi.fn();
const upsertLeadRecord = vi.fn();
const getDefaultTenant = vi.fn();
const recordAuditEvent = vi.fn();
const processLeadAutoresponderForNewLead = vi.fn();
const getCapabilityFlags = vi.fn();
const ensureYelpLeadsAccess = vi.fn();
const getLeadConversionSummary = vi.fn();
const buildLeadCrmSummary = vi.fn();
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
  findBusinessesByExternalYelpBusinessId,
  findLeadRecordByExternalLeadId,
  findWebhookEventByKey,
  getLeadRecordById,
  listFailedLeadWebhookEvents,
  listLeadBackfillRuns,
  listLeadBusinessOptions,
  listLeadRecords,
  updateLeadSyncRun,
  updateWebhookEventRecord,
  upsertLeadEventRecords,
  upsertLeadRecord
}));

vi.mock("@/lib/db/tenant", () => ({
  getDefaultTenant
}));

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent
}));

vi.mock("@/features/autoresponder/service", () => ({
  processLeadAutoresponderForNewLead
}));

vi.mock("@/features/crm-enrichment/service", () => ({
  buildLeadCrmSummary,
  getLeadConversionSummary
}));

vi.mock("@/lib/yelp/runtime", () => ({
  ensureYelpLeadsAccess,
  getCapabilityFlags
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

describe("getLeadsIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countLeadRecords.mockResolvedValue(146);
    listLeadBusinessOptions.mockResolvedValue([
      {
        id: "business_1",
        name: "IRBIS Air Plumbing Electrical",
        encryptedYelpBusinessId: "ys4FVTHxbSepIkvCLHYxCA"
      }
    ]);
    getCapabilityFlags.mockResolvedValue({
      hasLeadsApi: true
    });
    getLeadConversionSummary.mockResolvedValue({
      bookedLeads: 4,
      scheduledJobs: 3,
      completedJobs: 2,
      closeRate: 10
    });
    listFailedLeadWebhookEvents.mockResolvedValue([
      { id: "webhook_1", status: "FAILED", receivedAt: new Date("2026-04-03T10:00:00.000Z"), syncRun: { errors: [] } },
      { id: "webhook_2", status: "PARTIAL", receivedAt: new Date("2026-04-03T09:00:00.000Z"), syncRun: { errors: [] } }
    ]);
    listLeadBackfillRuns.mockResolvedValue([
      {
        id: "sync_run_1",
        status: "COMPLETED",
        businessId: "business_1",
        business: { name: "IRBIS Air Plumbing Electrical" },
        startedAt: new Date("2026-04-03T07:00:00.000Z"),
        finishedAt: new Date("2026-04-03T07:02:00.000Z"),
        statsJson: {
          importedCount: 20,
          updatedCount: 0,
          failedCount: 0,
          returnedLeadIds: 20,
          hasMore: true
        },
        errors: [],
        errorSummary: null
      }
    ]);
    listLeadRecords.mockResolvedValue([
      {
        id: "lead_1",
        externalLeadId: "lead_ext_1",
        externalBusinessId: "ys4FVTHxbSepIkvCLHYxCA",
        customerName: "Jane Doe",
        createdAtYelp: new Date("2026-04-01T09:00:00.000Z"),
        latestInteractionAt: new Date("2026-04-03T09:30:00.000Z"),
        lastSyncedAt: new Date("2026-04-03T09:31:00.000Z"),
        replyState: "UNREAD",
        business: { id: "business_1", name: "IRBIS Air Plumbing Electrical" },
        webhookEvents: [{ status: "COMPLETED", errorJson: null }],
        crmLeadMappings: [],
        crmStatusEvents: [],
        automationAttempts: [],
        syncRuns: [],
        internalStatus: "UNMAPPED",
        _count: { events: 1, webhookEvents: 1, crmStatusEvents: 0, automationAttempts: 0 }
      },
      {
        id: "lead_2",
        externalLeadId: "lead_ext_2",
        externalBusinessId: "ys4FVTHxbSepIkvCLHYxCA",
        customerName: "John Doe",
        createdAtYelp: new Date("2026-04-02T09:00:00.000Z"),
        latestInteractionAt: new Date("2026-04-03T10:30:00.000Z"),
        lastSyncedAt: new Date("2026-04-03T10:31:00.000Z"),
        replyState: "REPLIED",
        business: { id: "business_1", name: "IRBIS Air Plumbing Electrical" },
        webhookEvents: [{ status: "FAILED", errorJson: { message: "Webhook processing failed" } }],
        crmLeadMappings: [
          {
            state: "MATCHED",
            sourceSystem: "CRM",
            externalCrmLeadId: "crm_2",
            externalOpportunityId: null,
            externalJobId: null,
            issueSummary: null,
            matchedAt: new Date("2026-04-03T10:40:00.000Z"),
            lastSyncedAt: new Date("2026-04-03T10:40:00.000Z"),
            updatedAt: new Date("2026-04-03T10:40:00.000Z")
          }
        ],
        crmStatusEvents: [{ status: "BOOKED", sourceSystem: "CRM" }],
        automationAttempts: [],
        syncRuns: [],
        internalStatus: "BOOKED",
        _count: { events: 2, webhookEvents: 1, crmStatusEvents: 1, automationAttempts: 0 }
      }
    ]);
  });

  it("separates total synced leads from filtered leads and latest Yelp import page stats", async () => {
    const { getLeadsIndex } = await import("@/features/leads/service");

    const result = await getLeadsIndex("tenant_1", {
      status: "COMPLETED"
    });

    expect(result.summary.totalSyncedLeads).toBe(146);
    expect(result.summary.filteredLeads).toBe(1);
    expect(result.summary.visibleRows).toBe(1);
    expect(result.summary.needsAttention).toBe(1);
    expect(result.summary.failedDeliveries).toBe(2);
    expect(result.backfill.latestRun).toMatchObject({
      returnedLeadIds: 20,
      hasMore: true,
      pageSize: 20
    });
  });
});

describe("buildLeadListEntry", () => {
  it("groups row attention around mapping and intake problems", async () => {
    const { buildLeadListEntry } = await import("@/features/leads/normalize");

    const row = buildLeadListEntry({
      id: "lead_1",
      externalLeadId: "lead_ext_1",
      externalBusinessId: "ys4FVTHxbSepIkvCLHYxCA",
      customerName: "Jane Doe",
      createdAtYelp: new Date("2026-04-01T09:00:00.000Z"),
      latestInteractionAt: new Date("2026-04-03T09:30:00.000Z"),
      lastSyncedAt: new Date("2026-04-03T09:31:00.000Z"),
      replyState: "UNREAD",
      business: { id: "business_1", name: "IRBIS Air Plumbing Electrical" },
      webhookEvents: [{ status: "FAILED", errorJson: { message: "Webhook processing failed" } }],
      crmLeadMappings: [],
      crmStatusEvents: [],
      automationAttempts: [],
      syncRuns: [],
      internalStatus: "UNMAPPED"
    });

    expect(row.requiresAttention).toBe(true);
    expect(row.attentionReasons).toContain("Webhook processing failed");
    expect(row.attentionReasons).toContain("Needs CRM mapping");
  });
});
