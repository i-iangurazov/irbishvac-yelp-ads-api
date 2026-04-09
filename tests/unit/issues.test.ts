import { beforeEach, describe, expect, it, vi } from "vitest";

const createOperatorIssue = vi.fn();
const getOperatorIssueById = vi.fn();
const listAutoresponderFailureCandidates = vi.fn();
const listCrmSyncFailureCandidates = vi.fn();
const listExistingOperatorIssues = vi.fn();
const listIssueAuditContext = vi.fn();
const listLeadSyncFailureCandidates = vi.fn();
const listMappingConflictCandidates = vi.fn();
const listOperatorIssueFilterOptions = vi.fn();
const listOperatorIssues = vi.fn();
const listOperatorIssuesByIds = vi.fn();
const listReportDeliveryFailureCandidates = vi.fn();
const listStaleLifecycleSyncCandidates = vi.fn();
const listStaleLeadCandidates = vi.fn();
const listUnmappedLeadCandidates = vi.fn();
const updateOperatorIssue = vi.fn();
const recordAuditEvent = vi.fn();
const resendReportScheduleRunWorkflow = vi.fn();
const retryLeadAutomationAttemptWorkflow = vi.fn();
const retryLeadSyncRunWorkflow = vi.fn();
const retryCrmSyncRunWorkflow = vi.fn();

vi.mock("@/lib/db/issues-repository", () => ({
  createOperatorIssue,
  getOperatorIssueById,
  listAutoresponderFailureCandidates,
  listCrmSyncFailureCandidates,
  listExistingOperatorIssues,
  listIssueAuditContext,
  listLeadSyncFailureCandidates,
  listMappingConflictCandidates,
  listOperatorIssueFilterOptions,
  listOperatorIssues,
  listOperatorIssuesByIds,
  listReportDeliveryFailureCandidates,
  listStaleLifecycleSyncCandidates,
  listStaleLeadCandidates,
  listUnmappedLeadCandidates,
  updateOperatorIssue
}));

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent
}));

vi.mock("@/features/report-delivery/service", () => ({
  resendReportScheduleRunWorkflow
}));

vi.mock("@/features/autoresponder/service", () => ({
  retryLeadAutomationAttemptWorkflow
}));

vi.mock("@/features/leads/service", () => ({
  retryLeadSyncRunWorkflow
}));

vi.mock("@/features/crm-enrichment/service", () => ({
  retryCrmSyncRunWorkflow
}));

describe("operator issue service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    listLeadSyncFailureCandidates.mockResolvedValue([]);
    listUnmappedLeadCandidates.mockResolvedValue([]);
    listCrmSyncFailureCandidates.mockResolvedValue([]);
    listMappingConflictCandidates.mockResolvedValue([]);
    listAutoresponderFailureCandidates.mockResolvedValue([]);
    listReportDeliveryFailureCandidates.mockResolvedValue([]);
    listStaleLifecycleSyncCandidates.mockResolvedValue([]);
    listStaleLeadCandidates.mockResolvedValue([]);
    listExistingOperatorIssues.mockResolvedValue([]);
    listIssueAuditContext.mockResolvedValue([]);
    listOperatorIssueFilterOptions.mockResolvedValue({
      businesses: [],
      locations: []
    });
    listOperatorIssuesByIds.mockResolvedValue([]);
  });

  it("refreshes detected issues and auto-resolves cleared open issues", async () => {
    listExistingOperatorIssues.mockResolvedValueOnce([
      {
        id: "issue_open_old",
        dedupeKey: "stale-lead:lead_2",
        status: "OPEN",
        detectedCount: 1
      },
      {
        id: "issue_resolved_unmapped",
        dedupeKey: "unmapped-lead:lead_1",
        status: "RESOLVED",
        detectedCount: 2
      }
    ]);
    listUnmappedLeadCandidates.mockResolvedValueOnce([
      {
        id: "lead_1",
        businessId: "business_1",
        locationId: "location_1",
        createdAtYelp: new Date("2026-04-01T09:00:00.000Z"),
        externalLeadId: "lead_1",
        externalBusinessId: "biz_1",
        customerName: "Jane Doe",
        business: { id: "business_1", name: "Northwind", locationId: "location_1" },
        location: { id: "location_1", name: "Downtown" },
        serviceCategory: null
      }
    ]);

    const { refreshOperatorIssues } = await import("@/features/issues/service");
    await refreshOperatorIssues("tenant_1");

    expect(updateOperatorIssue).toHaveBeenCalledWith(
      "issue_resolved_unmapped",
      expect.objectContaining({
        status: "OPEN",
        detectedCount: 3
      })
    );
    expect(updateOperatorIssue).toHaveBeenCalledWith(
      "issue_open_old",
      expect.objectContaining({
        status: "RESOLVED",
        resolutionReason: "AUTO_CLEARED"
      })
    );
  });

  it("builds queue summary and row hints from filtered issues", async () => {
    listOperatorIssues
      .mockResolvedValueOnce([
        {
          id: "issue_1",
          status: "OPEN",
          severity: "HIGH",
          issueType: "UNMAPPED_LEAD"
        },
        {
          id: "issue_2",
          status: "OPEN",
          severity: "MEDIUM",
          issueType: "REPORT_DELIVERY_FAILURE"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "issue_1",
          status: "OPEN",
          severity: "HIGH",
          issueType: "UNMAPPED_LEAD",
          summary: "Needs mapping",
          firstDetectedAt: new Date("2026-04-01T09:00:00.000Z"),
          lastDetectedAt: new Date("2026-04-03T09:00:00.000Z"),
          business: { id: "business_1", name: "Northwind" },
          location: null,
          lead: { id: "lead_1", customerName: "Jane Doe", externalLeadId: "lead_1" },
          reportScheduleRun: null,
          syncRun: null,
          leadId: "lead_1"
        }
      ]);

    const { getOperatorQueue } = await import("@/features/issues/service");
    const queue = await getOperatorQueue("tenant_1", { issueType: "UNMAPPED_LEAD", status: "OPEN", age: "" });

    expect(queue.summary).toEqual({
      total: 2,
      open: 2,
      highSeverity: 1,
      retryableOpen: 1,
      deliveryFailures: 1,
      unmappedLeads: 1,
      staleLeads: 0
    });
    expect(queue.issues[0]).toMatchObject({
      typeLabel: "Unmapped lead",
      targetLabel: "Jane Doe",
      remapHref: "/leads/lead_1"
    });
  });

  it("marks issues resolved and records an audit event", async () => {
    getOperatorIssueById
      .mockResolvedValueOnce({
        id: "issue_1",
        businessId: "business_1",
        reportRequestId: null,
        dedupeKey: "unmapped-lead:lead_1"
      })
      .mockResolvedValueOnce({
        id: "issue_1",
        status: "RESOLVED"
      });

    const { resolveOperatorIssueWorkflow } = await import("@/features/issues/service");
    const result = await resolveOperatorIssueWorkflow("tenant_1", "user_1", "issue_1", {
      reason: "Handled in CRM",
      note: "Mapped manually."
    });

    expect(updateOperatorIssue).toHaveBeenCalledWith(
      "issue_1",
      expect.objectContaining({
        status: "RESOLVED",
        resolvedById: "user_1",
        resolutionReason: "Handled in CRM"
      })
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "issue.resolve",
        correlationId: "issue_1"
      })
    );
    expect(result).toEqual({
      id: "issue_1",
      status: "RESOLVED"
    });
  });

  it("dispatches retry handling to the underlying workflow for supported issue types", async () => {
    const issuesById = {
      issue_lead: {
        id: "issue_lead",
        issueType: "LEAD_SYNC_FAILURE",
        businessId: "business_1",
        reportRequestId: null,
        dedupeKey: "lead-sync:run_0",
        syncRunId: "sync_run_0",
        status: "OPEN"
      },
      issue_crm: {
        id: "issue_crm",
        issueType: "CRM_SYNC_FAILURE",
        businessId: "business_1",
        reportRequestId: null,
        dedupeKey: "crm-sync:lead:lead_2",
        syncRunId: "sync_run_2",
        status: "OPEN"
      },
      issue_report: {
        id: "issue_report",
        issueType: "REPORT_DELIVERY_FAILURE",
        businessId: null,
        reportRequestId: "report_1",
        dedupeKey: "report-delivery:run_1",
        reportScheduleRunId: "run_1",
        status: "OPEN"
      },
      issue_auto: {
        id: "issue_auto",
        issueType: "AUTORESPONDER_FAILURE",
        businessId: null,
        reportRequestId: null,
        dedupeKey: "autoresponder:lead_1",
        leadId: "lead_1",
        status: "OPEN"
      }
    } as const;

    getOperatorIssueById.mockImplementation(async (_tenantId: string, issueId: keyof typeof issuesById) => issuesById[issueId]);

    const { retryOperatorIssueWorkflow } = await import("@/features/issues/service");
    await retryOperatorIssueWorkflow("tenant_1", "user_1", "issue_lead");
    await retryOperatorIssueWorkflow("tenant_1", "user_1", "issue_crm");
    await retryOperatorIssueWorkflow("tenant_1", "user_1", "issue_report");
    await retryOperatorIssueWorkflow("tenant_1", "user_1", "issue_auto");

    expect(retryLeadSyncRunWorkflow).toHaveBeenCalledWith("tenant_1", "user_1", "sync_run_0");
    expect(retryCrmSyncRunWorkflow).toHaveBeenCalledWith("tenant_1", "user_1", "sync_run_2");
    expect(resendReportScheduleRunWorkflow).toHaveBeenCalledWith("tenant_1", "user_1", "run_1");
    expect(retryLeadAutomationAttemptWorkflow).toHaveBeenCalledWith("tenant_1", "user_1", "lead_1", null);
  });

  it("records manual notes in the issue audit trail", async () => {
    getOperatorIssueById.mockImplementation(async () => ({
      id: "issue_1",
      businessId: "business_1",
      reportRequestId: null,
      dedupeKey: "crm-sync:lead:lead_1",
      status: "OPEN"
    }));

    const { addOperatorIssueNoteWorkflow } = await import("@/features/issues/service");
    await addOperatorIssueNoteWorkflow("tenant_1", "user_1", "issue_1", {
      note: "Waiting on branch manager confirmation."
    });

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "issue.note",
        correlationId: "issue_1",
        requestSummary: {
          note: "Waiting on branch manager confirmation."
        }
      })
    );
  });

  it("applies bulk retry with partial success and records a bulk audit event", async () => {
    listOperatorIssuesByIds.mockResolvedValueOnce([
      {
        id: "issue_retry_ok",
        issueType: "LEAD_SYNC_FAILURE",
        businessId: "business_1",
        reportRequestId: null,
        dedupeKey: "lead-sync:run_1",
        syncRunId: "sync_run_1",
        status: "OPEN",
        retryable: true,
        actionable: true
      },
      {
        id: "issue_not_retryable",
        issueType: "UNMAPPED_LEAD",
        businessId: "business_1",
        reportRequestId: null,
        dedupeKey: "unmapped-lead:lead_1",
        syncRunId: null,
        status: "OPEN",
        retryable: false,
        actionable: true
      }
    ]);
    getOperatorIssueById
      .mockResolvedValueOnce({
        id: "issue_retry_ok",
        issueType: "LEAD_SYNC_FAILURE",
        businessId: "business_1",
        reportRequestId: null,
        dedupeKey: "lead-sync:run_1",
        syncRunId: "sync_run_1",
        status: "OPEN"
      })
      .mockResolvedValueOnce({
        id: "issue_retry_ok",
        status: "OPEN"
      });

    const { bulkOperatorIssueActionWorkflow } = await import("@/features/issues/service");
    const result = await bulkOperatorIssueActionWorkflow("tenant_1", "user_1", {
      action: "retry",
      issueIds: ["issue_retry_ok", "issue_not_retryable", "issue_missing"]
    });

    expect(result).toMatchObject({
      action: "retry",
      selected: 3,
      succeeded: 1,
      failed: 1,
      skipped: 1
    });
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issueId: "issue_retry_ok",
          status: "SUCCEEDED"
        }),
        expect.objectContaining({
          issueId: "issue_not_retryable",
          status: "SKIPPED"
        }),
        expect.objectContaining({
          issueId: "issue_missing",
          status: "FAILED"
        })
      ])
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "issue.bulk.retry",
        status: "FAILED",
        responseSummary: expect.objectContaining({
          succeeded: 1,
          failed: 1,
          skipped: 1
        })
      })
    );
  });

  it("formats bulk action availability and summaries", async () => {
    const { getBulkActionAvailability, formatBulkActionSummary } = await import("@/features/issues/bulk");

    expect(
      getBulkActionAvailability([
        {
          id: "issue_1",
          status: "OPEN",
          retryable: true,
          actionable: true
        },
        {
          id: "issue_2",
          status: "RESOLVED",
          retryable: false,
          actionable: false
        }
      ])
    ).toEqual({
      selectedCount: 2,
      retryableCount: 1,
      actionableCount: 1,
      canRetry: true,
      canResolve: true,
      canIgnore: true,
      canNote: true
    });

    expect(
      formatBulkActionSummary({
        action: "retry",
        succeeded: 2,
        failed: 1,
        skipped: 3
      })
    ).toBe("2 retried, 3 skipped, 1 failed");
  });

  it("bulk resolves only actionable open issues", async () => {
    listOperatorIssuesByIds.mockResolvedValueOnce([
      {
        id: "issue_open",
        issueType: "UNMAPPED_LEAD",
        businessId: "business_1",
        reportRequestId: null,
        dedupeKey: "unmapped-lead:lead_1",
        status: "OPEN",
        retryable: false,
        actionable: true
      },
      {
        id: "issue_resolved",
        issueType: "UNMAPPED_LEAD",
        businessId: "business_1",
        reportRequestId: null,
        dedupeKey: "unmapped-lead:lead_2",
        status: "RESOLVED",
        retryable: false,
        actionable: false
      }
    ]);
    getOperatorIssueById
      .mockResolvedValueOnce({
        id: "issue_open",
        businessId: "business_1",
        reportRequestId: null,
        dedupeKey: "unmapped-lead:lead_1"
      })
      .mockResolvedValueOnce({
        id: "issue_open",
        status: "RESOLVED"
      });

    const { bulkOperatorIssueActionWorkflow } = await import("@/features/issues/service");
    const result = await bulkOperatorIssueActionWorkflow("tenant_1", "user_1", {
      action: "resolve",
      issueIds: ["issue_open", "issue_resolved"],
      reason: "Handled in CRM",
      note: "Bulk review."
    });

    expect(result).toMatchObject({
      action: "resolve",
      selected: 2,
      succeeded: 1,
      failed: 0,
      skipped: 1
    });
    expect(updateOperatorIssue).toHaveBeenCalledWith(
      "issue_open",
      expect.objectContaining({
        status: "RESOLVED",
        resolutionReason: "Handled in CRM"
      })
    );
  });
});
