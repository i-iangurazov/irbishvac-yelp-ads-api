import { beforeEach, describe, expect, it, vi } from "vitest";

const getBusinessById = vi.fn();
const countLeadRecordsByBusiness = vi.fn();
const countLeadRecords = vi.fn();
const claimLeadWebhookSyncRunForProcessing = vi.fn();
const createLeadSyncRun = vi.fn();
const createLeadSyncError = vi.fn();
const createWebhookEventRecord = vi.fn();
const findLeadRecordByExternalLeadId = vi.fn();
const findBusinessesByExternalYelpBusinessId = vi.fn();
const findWebhookEventByKey = vi.fn();
const getLeadSyncRunById = vi.fn();
const getLeadRecordById = vi.fn();
const listLeadBackfillRuns = vi.fn();
const listFailedLeadWebhookEvents = vi.fn();
const listLeadBusinessOptions = vi.fn();
const listLeadRecords = vi.fn();
const listLeadWebhookSyncRunsForReconcile = vi.fn();
const updateLeadSyncRun = vi.fn();
const updateLeadWebhookSnapshot = vi.fn();
const updateWebhookEventRecord = vi.fn();
const upsertLeadEventRecords = vi.fn();
const upsertLeadRecord = vi.fn();
const recordAuditEvent = vi.fn();
const ensureYelpLeadsAccess = vi.fn();
const getCapabilityFlags = vi.fn();
const processLeadAutoresponderForNewLead = vi.fn();
const processLeadConversationAutomationForInboundMessage = vi.fn();
const getLeadConversionSummary = vi.fn();
const getDefaultTenant = vi.fn();
const listTenantIds = vi.fn();
const getLeadAutomationScopeConfig = vi.fn();
const logInfo = vi.fn();
const logError = vi.fn();
const getBusinessLeadIds = vi.fn();
const getLead = vi.fn();
const getLeadEvents = vi.fn();
const recordWebhookIntakeMetric = vi.fn();
const recordWebhookReconcileMetric = vi.fn();
let backfillRunState: Record<string, unknown> | null = null;

vi.mock("@/lib/db/businesses-repository", () => ({
  getBusinessById
}));

vi.mock("@/lib/db/leads-repository", () => ({
  countLeadRecordsByBusiness,
  countLeadRecords,
  claimLeadWebhookSyncRunForProcessing,
  createLeadSyncError,
  createLeadSyncRun,
  createWebhookEventRecord,
  findLeadRecordByExternalLeadId,
  findBusinessesByExternalYelpBusinessId,
  findWebhookEventByKey,
  getLeadSyncRunById,
  getLeadRecordById,
  listLeadBackfillRuns,
  listFailedLeadWebhookEvents,
  listLeadBusinessOptions,
  listLeadRecords,
  listLeadWebhookSyncRunsForReconcile,
  updateLeadSyncRun,
  updateLeadWebhookSnapshot,
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

vi.mock("@/features/autoresponder/conversation-service", () => ({
  processLeadConversationAutomationForInboundMessage
}));

vi.mock("@/features/autoresponder/config", () => ({
  getLeadAutomationScopeConfig
}));

vi.mock("@/features/crm-enrichment/service", () => ({
  buildLeadCrmSummary: vi.fn(),
  getLeadConversionSummary
}));

vi.mock("@/lib/db/tenant", () => ({
  getDefaultTenant
}));

vi.mock("@/lib/db/settings-repository", () => ({
  listTenantIds
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

vi.mock("@/features/operations/observability-service", () => ({
  recordWebhookIntakeMetric,
  recordWebhookReconcileMetric
}));

describe("lead backfill workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countLeadRecordsByBusiness.mockResolvedValue([]);
    claimLeadWebhookSyncRunForProcessing.mockResolvedValue(true);
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
    backfillRunState = {
      id: "sync_run_1",
      tenantId: "tenant_1",
      type: "YELP_LEADS_BACKFILL",
      status: "QUEUED",
      startedAt: new Date("2026-04-01T09:00:00.000Z"),
      statsJson: null,
      requestJson: {
        businessId: "business_1"
      },
      businessId: "business_1",
      business: {
        id: "business_1",
        name: "Northwind HVAC",
        locationId: "location_1",
        encryptedYelpBusinessId: "ys4FVTHxbSepIkvCLHYxCA"
      },
      lead: null,
      webhookEvents: [],
      errors: [],
      finishedAt: null,
      errorSummary: null
    };
    getLeadSyncRunById.mockImplementation(async (_tenantId: string, syncRunId: string) => {
      if (backfillRunState && syncRunId === backfillRunState.id) {
        return backfillRunState;
      }

      throw new Error(`Unknown sync run ${syncRunId}`);
    });
    updateLeadSyncRun.mockImplementation(async (syncRunId: string, patch: Record<string, unknown>) => {
      if (backfillRunState && syncRunId === backfillRunState.id) {
        backfillRunState = {
          ...backfillRunState,
          ...patch
        };

        return backfillRunState;
      }

      return {
        id: syncRunId,
        ...patch
      };
    });
    createWebhookEventRecord.mockResolvedValue({
      id: "webhook_1",
      status: "QUEUED",
      leadId: null
    });
    updateWebhookEventRecord.mockResolvedValue({
      id: "webhook_1",
      status: "COMPLETED",
      leadId: "local_lead_1"
    });
    upsertLeadEventRecords.mockResolvedValue([
      { id: "evt_local_1" }
    ]);
    getLead.mockResolvedValue({
      data: {
        id: "lead_default",
        business_id: "ys4FVTHxbSepIkvCLHYxCA",
        time_created: "2026-04-01T09:00:00.000Z"
      }
    });
    getLeadEvents.mockResolvedValue({
      data: {
        events: []
      }
    });
    getLeadConversionSummary.mockResolvedValue({
      bookedLeads: 0,
      scheduledJobs: 0,
      completedJobs: 0,
      closeRate: 0
    });
    processLeadConversationAutomationForInboundMessage.mockResolvedValue({
      processed: false,
      reason: "NO_NEW_INBOUND_EVENT"
    });
    getLeadAutomationScopeConfig.mockResolvedValue({
      effectiveSettings: {
        isEnabled: true,
        conversationAutomationEnabled: true
      }
    });
    getDefaultTenant.mockResolvedValue({
      id: "tenant_1"
    });
    listTenantIds.mockResolvedValue([
      {
        id: "tenant_1"
      }
    ]);
    findBusinessesByExternalYelpBusinessId.mockResolvedValue([
      {
        id: "business_1",
        tenantId: "tenant_1",
        locationId: "location_1"
      }
    ]);
  });

  it("imports the returned Yelp lead IDs and preserves has_more on the sync run", async () => {
    getBusinessLeadIds
      .mockResolvedValueOnce({
        data: {
          lead_ids: ["lead_1", "lead_2"],
          has_more: true
        }
      })
      .mockResolvedValueOnce({
        data: {
          lead_ids: ["lead_3"],
          has_more: false
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
      })
      .mockResolvedValueOnce(null);
    getLead.mockImplementation(async (leadId: string) => ({
      data: {
        id: leadId,
        business_id: "ys4FVTHxbSepIkvCLHYxCA",
        time_created: "2026-04-01T09:00:00.000Z",
        customer_name: leadId === "lead_1" ? "Jane Doe" : leadId === "lead_2" ? "John Doe" : "Alex Doe"
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
      .mockResolvedValueOnce({ id: "local_lead_2", externalLeadId: "lead_2" })
      .mockResolvedValueOnce({ id: "local_lead_3", externalLeadId: "lead_3" });

    const { syncBusinessLeadsWorkflow } = await import("@/features/leads/service");
    const result = await syncBusinessLeadsWorkflow("tenant_1", "user_1", {
      businessId: "business_1"
    });

    expect(getBusinessLeadIds).toHaveBeenNthCalledWith(1, "ys4FVTHxbSepIkvCLHYxCA", { limit: 20, offset: 0 });
    expect(getBusinessLeadIds).toHaveBeenNthCalledWith(2, "ys4FVTHxbSepIkvCLHYxCA", { limit: 20, offset: 2 });
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
          importedCount: 2,
          updatedCount: 1,
          returnedLeadIds: 3,
          hasMore: false,
          pagesFetched: 2,
          pageLimit: 15
        })
      })
    );
    expect(result).toMatchObject({
      status: "COMPLETED",
      importedCount: 2,
      updatedCount: 1,
      failedCount: 0,
      returnedLeadIds: 3,
      hasMore: false,
      pagesFetched: 2,
      pageLimit: 15
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

    expect(getBusinessLeadIds).toHaveBeenCalledWith("ys4FVTHxbSepIkvCLHYxCA", { limit: 20, offset: 0 });
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

  it("queues raw webhook deliveries for async webhook-first processing", async () => {
    findWebhookEventByKey.mockResolvedValue(null);

    const { ingestYelpLeadWebhook } = await import("@/features/leads/service");
    const result = await ingestYelpLeadWebhook(
      {
        time: "2026-04-01T09:00:00.000Z",
        object: "business",
        data: {
          id: "ys4FVTHxbSepIkvCLHYxCA",
          updates: [
            {
              event_type: "NEW_EVENT",
              event_id: "evt_1",
              lead_id: "lead_1",
              interaction_time: "2026-04-01T09:00:00.000Z"
            }
          ]
        }
      },
      {
        "x-yelp-delivery-id": "delivery_1"
      }
    );

    expect(createLeadSyncRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_1",
        type: "YELP_LEADS_WEBHOOK",
        status: "QUEUED"
      })
    );
    expect(createWebhookEventRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_1",
        deliveryId: "delivery_1",
        status: "QUEUED",
        payloadJson: expect.objectContaining({
          delivery: expect.objectContaining({
            data: expect.objectContaining({
              id: "ys4FVTHxbSepIkvCLHYxCA"
            })
          }),
          update: expect.objectContaining({
            lead_id: "lead_1"
          })
        })
      })
    );
    expect(result).toMatchObject({
      tenantId: "tenant_1",
      externalBusinessId: "ys4FVTHxbSepIkvCLHYxCA",
      results: [
        expect.objectContaining({
          leadId: "lead_1",
          deliveryStatus: "QUEUED"
        })
      ]
    });
  });

  it("ignores duplicate webhook deliveries that already completed", async () => {
    findWebhookEventByKey.mockResolvedValue({
      id: "webhook_existing",
      status: "COMPLETED",
      leadId: "local_lead_1"
    });

    const { ingestYelpLeadWebhook } = await import("@/features/leads/service");
    const result = await ingestYelpLeadWebhook(
      {
        time: "2026-04-01T09:00:00.000Z",
        object: "business",
        data: {
          id: "ys4FVTHxbSepIkvCLHYxCA",
          updates: [
            {
              event_type: "NEW_EVENT",
              event_id: "evt_1",
              lead_id: "lead_1",
              interaction_time: "2026-04-01T09:00:00.000Z"
            }
          ]
        }
      },
      {}
    );

    expect(createLeadSyncRun).not.toHaveBeenCalled();
    expect(createWebhookEventRecord).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({
      deliveryStatus: "DUPLICATE",
      leadId: "lead_1",
      localLeadId: "local_lead_1"
    });
  });

  it("reconciles queued webhook deliveries by refreshing the lead snapshot from Yelp", async () => {
    const queuedRun = {
      id: "sync_run_queued",
      tenantId: "tenant_1",
      type: "YELP_LEADS_WEBHOOK",
      status: "QUEUED",
      startedAt: new Date("2026-04-01T09:00:00.000Z"),
      statsJson: null,
      businessId: "business_1",
      webhookEvents: [
        {
          id: "webhook_1",
          eventKey: "leads_event:ys4FVTHxbSepIkvCLHYxCA:lead_1:NEW_EVENT:evt_1",
          payloadJson: {
            delivery: {
              time: "2026-04-01T09:00:00.000Z",
              object: "business",
              data: {
                id: "ys4FVTHxbSepIkvCLHYxCA",
                updates: [
                  {
                    event_type: "NEW_EVENT",
                    event_id: "evt_1",
                    lead_id: "lead_1",
                    interaction_time: "2026-04-01T09:00:00.000Z"
                  }
                ]
              }
            },
            update: {
              event_type: "NEW_EVENT",
              event_id: "evt_1",
              lead_id: "lead_1",
              interaction_time: "2026-04-01T09:00:00.000Z"
            }
          },
          receivedAt: new Date("2026-04-01T09:00:00.000Z"),
          leadId: null,
          status: "QUEUED"
        }
      ],
      errors: []
    };
    listLeadWebhookSyncRunsForReconcile.mockResolvedValue([queuedRun]);
    getLeadSyncRunById.mockResolvedValue(queuedRun);
    findLeadRecordByExternalLeadId.mockResolvedValue(null);
    getLead.mockResolvedValue({
      data: {
        id: "lead_1",
        business_id: "ys4FVTHxbSepIkvCLHYxCA",
        time_created: "2026-04-01T09:00:00.000Z",
        customer_name: "Jane Doe"
      }
    });
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
    upsertLeadRecord.mockResolvedValue({
      id: "local_lead_1",
      externalLeadId: "lead_1",
      businessId: "business_1"
    });

    const { reconcilePendingLeadWebhooks } = await import("@/features/leads/service");
    const result = await reconcilePendingLeadWebhooks(10);

    expect(getLead).toHaveBeenCalledWith("lead_1");
    expect(getLeadEvents).toHaveBeenCalledWith("lead_1");
    expect(processLeadAutoresponderForNewLead).toHaveBeenCalledWith("tenant_1", "local_lead_1");
    expect(result).toEqual([
      expect.objectContaining({
        syncRunId: "sync_run_queued",
        leadId: "lead_1",
        localLeadId: "local_lead_1",
        status: "COMPLETED"
      })
    ]);
  });

  it("evaluates the initial autoresponder for webhook deliveries on already-known leads", async () => {
    const queuedRun = {
      id: "sync_run_existing",
      tenantId: "tenant_1",
      type: "YELP_LEADS_WEBHOOK",
      status: "QUEUED",
      startedAt: new Date("2026-04-01T09:00:00.000Z"),
      statsJson: null,
      businessId: "business_1",
      webhookEvents: [
        {
          id: "webhook_existing",
          eventKey: "leads_event:ys4FVTHxbSepIkvCLHYxCA:lead_existing:NEW_EVENT:evt_existing",
          payloadJson: {
            delivery: {
              time: "2026-04-01T09:00:00.000Z",
              object: "business",
              data: {
                id: "ys4FVTHxbSepIkvCLHYxCA",
                updates: [
                  {
                    event_type: "NEW_EVENT",
                    event_id: "evt_existing",
                    lead_id: "lead_existing",
                    interaction_time: "2026-04-01T09:00:00.000Z"
                  }
                ]
              }
            },
            update: {
              event_type: "NEW_EVENT",
              event_id: "evt_existing",
              lead_id: "lead_existing",
              interaction_time: "2026-04-01T09:00:00.000Z"
            }
          },
          receivedAt: new Date("2026-04-01T09:00:00.000Z"),
          leadId: "local_lead_existing",
          status: "QUEUED"
        }
      ],
      errors: []
    };

    listLeadWebhookSyncRunsForReconcile.mockResolvedValue([queuedRun]);
    getLeadSyncRunById.mockResolvedValue(queuedRun);
    findLeadRecordByExternalLeadId.mockResolvedValue({
      id: "local_lead_existing",
      externalLeadId: "lead_existing",
      businessId: "business_1",
      locationId: "location_1",
      serviceCategoryId: null,
      internalStatus: "UNMAPPED",
      mappedServiceLabel: null,
      firstSeenAt: new Date("2026-04-01T08:00:00.000Z")
    });
    getLead.mockResolvedValue({
      data: {
        id: "lead_existing",
        business_id: "ys4FVTHxbSepIkvCLHYxCA",
        time_created: "2026-04-01T08:00:00.000Z",
        customer_name: "Jane Doe"
      }
    });
    getLeadEvents.mockResolvedValue({
      data: {
        events: [
          {
            event_id: "evt_existing",
            event_type: "NEW_EVENT",
            interaction_time: "2026-04-01T09:00:00.000Z"
          }
        ]
      }
    });
    upsertLeadRecord.mockResolvedValue({
      id: "local_lead_existing",
      externalLeadId: "lead_existing",
      businessId: "business_1"
    });

    const { reconcilePendingLeadWebhooks } = await import("@/features/leads/service");
    const result = await reconcilePendingLeadWebhooks(10);

    expect(getLead).toHaveBeenCalledWith("lead_existing");
    expect(getLeadEvents).toHaveBeenCalledWith("lead_existing");
    expect(processLeadAutoresponderForNewLead).toHaveBeenCalledWith("tenant_1", "local_lead_existing");
    expect(result).toEqual([
      expect.objectContaining({
        syncRunId: "sync_run_existing",
        leadId: "lead_existing",
        localLeadId: "local_lead_existing",
        status: "COMPLETED"
      })
    ]);
  });

  it("retries temporary webhook failures but skips non-retryable ones", async () => {
    const retryRun = {
      id: "sync_run_retry",
      tenantId: "tenant_1",
      type: "YELP_LEADS_WEBHOOK",
      status: "FAILED",
      startedAt: new Date("2026-04-01T09:00:00.000Z"),
      statsJson: {
        retryCount: 1
      },
      businessId: "business_1",
      webhookEvents: [
        {
          id: "webhook_1",
          eventKey: "leads_event:ys4FVTHxbSepIkvCLHYxCA:lead_1:NEW_EVENT:evt_1",
          payloadJson: {
            delivery: {
              time: "2026-04-01T09:00:00.000Z",
              object: "business",
              data: {
                id: "ys4FVTHxbSepIkvCLHYxCA",
                updates: [
                  {
                    event_type: "NEW_EVENT",
                    event_id: "evt_1",
                    lead_id: "lead_1",
                    interaction_time: "2026-04-01T09:00:00.000Z"
                  }
                ]
              }
            },
            update: {
              event_type: "NEW_EVENT",
              event_id: "evt_1",
              lead_id: "lead_1",
              interaction_time: "2026-04-01T09:00:00.000Z"
            }
          },
          receivedAt: new Date("2026-04-01T09:00:00.000Z"),
          leadId: null,
          status: "FAILED"
        }
      ],
      errors: [
        {
          isRetryable: true
        }
      ]
    };
    const skippedRun = {
      id: "sync_run_skip",
      tenantId: "tenant_1",
      type: "YELP_LEADS_WEBHOOK",
      status: "FAILED",
      startedAt: new Date("2026-04-01T08:00:00.000Z"),
      statsJson: {
        retryCount: 0
      },
      businessId: "business_1",
      webhookEvents: [
        {
          id: "webhook_skip",
          eventKey: "leads_event:ys4FVTHxbSepIkvCLHYxCA:lead_2:NEW_EVENT:evt_2",
          payloadJson: {
            delivery: {
              time: "2026-04-01T08:00:00.000Z",
              object: "business",
              data: {
                id: "ys4FVTHxbSepIkvCLHYxCA",
                updates: [
                  {
                    event_type: "NEW_EVENT",
                    event_id: "evt_2",
                    lead_id: "lead_2",
                    interaction_time: "2026-04-01T08:00:00.000Z"
                  }
                ]
              }
            },
            update: {
              event_type: "NEW_EVENT",
              event_id: "evt_2",
              lead_id: "lead_2",
              interaction_time: "2026-04-01T08:00:00.000Z"
            }
          },
          receivedAt: new Date("2026-04-01T08:00:00.000Z"),
          leadId: null,
          status: "FAILED"
        }
      ],
      errors: [
        {
          isRetryable: false
        }
      ]
    };
    listLeadWebhookSyncRunsForReconcile.mockResolvedValue([retryRun, skippedRun]);
    getLeadSyncRunById.mockImplementation(async (_tenantId: string, syncRunId: string) => {
      if (syncRunId === "sync_run_retry") {
        return retryRun;
      }

      if (syncRunId === "sync_run_skip") {
        return skippedRun;
      }

      throw new Error(`Unknown sync run ${syncRunId}`);
    });
    findLeadRecordByExternalLeadId.mockResolvedValue(null);
    getLead.mockResolvedValue({
      data: {
        id: "lead_1",
        business_id: "ys4FVTHxbSepIkvCLHYxCA",
        time_created: "2026-04-01T09:00:00.000Z"
      }
    });
    getLeadEvents.mockResolvedValue({
      data: {
        events: []
      }
    });
    upsertLeadRecord.mockResolvedValue({
      id: "local_lead_1",
      externalLeadId: "lead_1",
      businessId: "business_1"
    });

    const { reconcilePendingLeadWebhooks } = await import("@/features/leads/service");
    const result = await reconcilePendingLeadWebhooks(10);

    expect(updateLeadSyncRun).toHaveBeenCalledWith(
      "sync_run_retry",
      expect.objectContaining({
        status: "QUEUED",
        statsJson: expect.objectContaining({
          retryCount: 2
        })
      })
    );
    expect(result).toEqual([
      expect.objectContaining({
        syncRunId: "sync_run_retry",
        status: "COMPLETED"
      })
    ]);
  });

  it("polls recent leads for autoresponder-enabled businesses and processes conversation automation", async () => {
    listLeadBusinessOptions.mockResolvedValue([
      {
        id: "business_enabled",
        name: "Plumbing Business Tester - Test",
        encryptedYelpBusinessId: "SNa1ugk6DNIuvIPu8-AiGA",
        locationId: "location_1"
      },
      {
        id: "business_disabled",
        name: "IRBIS Air Plumbing Electrical",
        encryptedYelpBusinessId: "ys4FVTHxbSepIkvCLHYxCA",
        locationId: "location_2"
      }
    ]);
    getLeadAutomationScopeConfig.mockImplementation(async (_tenantId: string, businessId: string) => ({
      effectiveSettings: {
        isEnabled: businessId === "business_enabled",
        conversationAutomationEnabled: businessId === "business_enabled"
      }
    }));
    getBusinessLeadIds.mockResolvedValue({
      data: {
        lead_ids: ["lead_existing"],
        has_more: false
      }
    });
    findLeadRecordByExternalLeadId.mockResolvedValue({
      id: "local_lead_existing",
      internalStatus: "UNMAPPED",
      firstSeenAt: new Date("2026-04-01T09:00:00.000Z"),
      locationId: "location_1",
      serviceCategoryId: null,
      mappedServiceLabel: null
    });
    getLead.mockResolvedValue({
      data: {
        id: "lead_existing",
        business_id: "SNa1ugk6DNIuvIPu8-AiGA",
        conversation_id: "conversation_1",
        time_created: "2026-04-01T09:00:00.000Z",
        customer_name: "Jane Doe"
      }
    });
    getLeadEvents.mockResolvedValue({
      data: {
        events: [
          {
            event_id: "evt_customer_update",
            event_type: "MESSAGE",
            interaction_time: "2026-04-01T09:05:00.000Z",
            message: "The address is 123 Main St and the pipe is leaking."
          }
        ]
      }
    });
    upsertLeadRecord.mockResolvedValue({
      id: "local_lead_existing",
      externalLeadId: "lead_existing",
      businessId: "business_enabled"
    });
    processLeadAutoresponderForNewLead.mockResolvedValue({
      status: "DUPLICATE"
    });
    processLeadConversationAutomationForInboundMessage.mockResolvedValue({
      processed: true,
      decision: "AUTO_REPLY",
      stopReason: null
    });

    const { reconcileRecentYelpLeadsForAutomation } = await import("@/features/leads/service");
    const result = await reconcileRecentYelpLeadsForAutomation(20);

    expect(getBusinessLeadIds).toHaveBeenCalledTimes(1);
    expect(getBusinessLeadIds).toHaveBeenCalledWith("SNa1ugk6DNIuvIPu8-AiGA", {
      limit: 20,
      offset: 0
    });
    expect(processLeadAutoresponderForNewLead).toHaveBeenCalledWith("tenant_1", "local_lead_existing");
    expect(processLeadConversationAutomationForInboundMessage).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      leadId: "local_lead_existing",
      sourceEventId: null
    });
    expect(result).toMatchObject({
      businessCount: 1,
      processedLeadCount: 1,
      updatedCount: 1,
      conversationAutomationProcessedCount: 1
    });
  });
});
