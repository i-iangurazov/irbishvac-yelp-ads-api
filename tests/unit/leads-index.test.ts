import { beforeEach, describe, expect, it, vi } from "vitest";

const getBusinessById = vi.fn();
const countLeadRecordsByBusiness = vi.fn();
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
const listLeadWebhookSyncRunsForReconcile = vi.fn();
const updateLeadSyncRun = vi.fn();
const updateLeadWebhookSnapshot = vi.fn();
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
const listOpenOperatorIssuesForLead = vi.fn();
const listOpenOperatorIssuesForLeadIds = vi.fn();
const getAiReplyAssistantState = vi.fn();
const getLeadReplyComposerState = vi.fn();
const getLeadAutomationScopeConfig = vi.fn();
const recordWebhookIntakeMetric = vi.fn();
const recordWebhookReconcileMetric = vi.fn();

vi.mock("@/lib/db/businesses-repository", () => ({
  getBusinessById
}));

vi.mock("@/lib/db/leads-repository", () => ({
  countLeadRecordsByBusiness,
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
  listLeadWebhookSyncRunsForReconcile,
  updateLeadSyncRun,
  updateLeadWebhookSnapshot,
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

vi.mock("@/features/autoresponder/config", () => ({
  getLeadAutomationScopeConfig
}));

vi.mock("@/features/operations/observability-service", () => ({
  recordWebhookIntakeMetric,
  recordWebhookReconcileMetric
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

vi.mock("@/lib/db/issues-repository", () => ({
  listOpenOperatorIssuesForLead,
  listOpenOperatorIssuesForLeadIds
}));

vi.mock("@/features/leads/ai-reply-service", () => ({
  getAiReplyAssistantState
}));

vi.mock("@/features/leads/messaging-service", () => ({
  getLeadReplyComposerState
}));

describe("getLeadsIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countLeadRecords.mockResolvedValue(146);
    countLeadRecordsByBusiness.mockResolvedValue([
      {
        businessId: "business_1",
        _count: {
          _all: 146
        }
      }
    ]);
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
    listOpenOperatorIssuesForLeadIds.mockResolvedValue([]);
    listOpenOperatorIssuesForLead.mockResolvedValue([]);
    getAiReplyAssistantState.mockResolvedValue({
      envConfigured: true,
      enabled: true,
      reviewRequired: true,
      model: "gpt-5-nano",
      modelLabel: "gpt-5-nano • Cheapest / test",
      guardrails: []
    });
    getLeadReplyComposerState.mockResolvedValue({
      canUseYelpThread: true,
      canUseEmail: false,
      canGenerateAiDrafts: true,
      defaultChannel: "YELP_THREAD",
      latestOutboundChannel: null,
      maskedEmail: null,
      canMarkAsRead: false,
      canMarkAsReplied: true
    });
    getLeadAutomationScopeConfig.mockResolvedValue({
      defaults: {
        isEnabled: true,
        scopeMode: "ALL_BUSINESSES",
        scopedBusinessIds: [],
        defaultChannel: "YELP_THREAD",
        emailFallbackEnabled: false,
        followUp24hEnabled: true,
        followUp24hDelayHours: 24,
        followUp7dEnabled: true,
        followUp7dDelayDays: 7,
        aiAssistEnabled: true,
        aiModel: "gpt-5-nano"
      },
      override: null,
      effectiveSettings: {
        isEnabled: true,
        scopeMode: "ALL_BUSINESSES",
        scopedBusinessIds: [],
        defaultChannel: "YELP_THREAD",
        emailFallbackEnabled: false,
        followUp24hEnabled: true,
        followUp24hDelayHours: 24,
        followUp7dEnabled: true,
        followUp7dDelayDays: 7,
        aiAssistEnabled: true,
        aiModel: "gpt-5-nano"
      }
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
    countLeadRecords.mockReset();
    countLeadRecords.mockResolvedValueOnce(146).mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    countLeadRecordsByBusiness.mockResolvedValueOnce([
      {
        businessId: "business_1",
        _count: {
          _all: 1
        }
      }
    ]);
    listLeadRecords.mockResolvedValueOnce([
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
        latestWebhookStatus: "COMPLETED",
        crmLeadMappings: [],
        crmStatusEvents: [],
        automationAttempts: [],
        syncRuns: [],
        internalStatus: "UNMAPPED",
        _count: { events: 1, webhookEvents: 1, crmStatusEvents: 0, automationAttempts: 0 }
      }
    ]);

    const { getLeadsIndex } = await import("@/features/leads/service");

    const result = await getLeadsIndex("tenant_1", {
      status: "COMPLETED"
    });

    expect(result.summary.totalSyncedLeads).toBe(146);
    expect(result.summary.filteredLeads).toBe(1);
    expect(result.summary.visibleRows).toBe(1);
    expect(result.summary.needsAttention).toBe(1);
    expect(result.summary.failedDeliveries).toBe(2);
    expect(result.pagination).toMatchObject({
      currentPage: 1,
      pageSize: 25,
      totalPages: 1,
      visibleRows: 1,
      hasPreviousPage: false,
      hasNextPage: false,
      pageRowStart: 1,
      pageRowEnd: 1
    });
    expect(result.backfill.latestRun).toMatchObject({
      returnedLeadIds: 20,
      hasMore: true,
      pageSize: 20
    });
    expect(result.businessSplit).toEqual([
      expect.objectContaining({
        id: "business_1",
        count: 1
      })
    ]);
  });

  it("paginates locally stored leads with explicit page and page-size inputs", async () => {
    const { getLeadsIndex } = await import("@/features/leads/service");

    await getLeadsIndex("tenant_1", {
      page: 2,
      pageSize: 25
    });

    expect(countLeadRecords).toHaveBeenNthCalledWith(1, "tenant_1");
    expect(countLeadRecords).toHaveBeenNthCalledWith(2, "tenant_1", {
      businessId: undefined,
      status: undefined,
      attention: "NEEDS_ATTENTION",
      mappingState: undefined,
      internalStatus: undefined,
      from: undefined,
      to: undefined
    });
    expect(countLeadRecords).toHaveBeenNthCalledWith(3, "tenant_1", {
      businessId: undefined,
      status: undefined,
      attention: undefined,
      mappingState: undefined,
      internalStatus: undefined,
      from: undefined,
      to: undefined
    });
    expect(listLeadRecords).toHaveBeenCalledWith("tenant_1", {
      businessId: undefined,
      status: undefined,
      attention: undefined,
      mappingState: undefined,
      internalStatus: undefined,
      from: undefined,
      to: undefined,
      skip: 25,
      take: 25
    });
  });

  it("passes the needs-attention filter into DB-backed count, split, and list queries", async () => {
    const { getLeadsIndex } = await import("@/features/leads/service");

    await getLeadsIndex("tenant_1", {
      attention: "NEEDS_ATTENTION",
      businessId: "business_1"
    });

    expect(countLeadRecordsByBusiness).toHaveBeenCalledWith(
      "tenant_1",
      expect.objectContaining({
        attention: "NEEDS_ATTENTION"
      })
    );
    expect(countLeadRecords).toHaveBeenCalledWith(
      "tenant_1",
      expect.objectContaining({
        businessId: "business_1",
        attention: "NEEDS_ATTENTION"
      })
    );
    expect(listLeadRecords).toHaveBeenCalledWith(
      "tenant_1",
      expect.objectContaining({
        businessId: "business_1",
        attention: "NEEDS_ATTENTION"
      })
    );
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

describe("getLeadDetail", () => {
  it("keeps Yelp-native, partner lifecycle, and local processing boundaries explicit", async () => {
    buildLeadCrmSummary.mockReturnValue({
      mapping: null,
      mappingResolved: false,
      currentInternalStatus: "UNMAPPED",
      mappingIssues: [],
      timeline: []
    });
    getLeadRecordById.mockResolvedValue({
      id: "lead_1",
      externalLeadId: "lead_ext_1",
      externalBusinessId: "ys4FVTHxbSepIkvCLHYxCA",
      externalConversationId: "conversation_1",
      createdAtYelp: new Date("2026-04-01T09:00:00.000Z"),
      latestInteractionAt: new Date("2026-04-03T09:30:00.000Z"),
      customerName: "Jane Doe",
      customerEmail: null,
      businessId: "business_1",
      locationId: null,
      internalStatus: "UNMAPPED",
      business: {
        id: "business_1",
        name: "IRBIS Air Plumbing Electrical",
        locationId: null,
        encryptedYelpBusinessId: "ys4FVTHxbSepIkvCLHYxCA"
      },
      events: [],
      webhookEvents: [],
      syncRuns: [],
      crmLeadMappings: [],
      crmStatusEvents: [],
      automationAttempts: [],
      conversationActions: [],
      replyState: "UNREAD"
    });

    const { getLeadDetail } = await import("@/features/leads/service");
    const result = await getLeadDetail("tenant_1", "lead_1");

    expect(result.sourceBoundaries.yelp).toContain("Yelp");
    expect(result.sourceBoundaries.crm).toContain("partner lifecycle statuses");
    expect(result.sourceBoundaries.local).toContain("outside-Yelp reply markers");
    expect(result.sourceBoundaries.automation).toContain("Autoresponder rules");
  });
});
