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
const listReportDeliveryFailureCandidates = vi.fn();
const listStaleLeadCandidates = vi.fn();
const listUnmappedLeadCandidates = vi.fn();
const updateOperatorIssue = vi.fn();
const recordAuditEvent = vi.fn();
const resendReportScheduleRunWorkflow = vi.fn();
const retryLeadAutomationAttemptWorkflow = vi.fn();

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
  listReportDeliveryFailureCandidates,
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
    listStaleLeadCandidates.mockResolvedValue([]);
    listExistingOperatorIssues.mockResolvedValue([]);
    listIssueAuditContext.mockResolvedValue([]);
    listOperatorIssueFilterOptions.mockResolvedValue({
      businesses: [],
      locations: []
    });
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
      deliveryFailures: 1,
      unmappedLeads: 1
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
    await retryOperatorIssueWorkflow("tenant_1", "user_1", "issue_report");
    await retryOperatorIssueWorkflow("tenant_1", "user_1", "issue_auto");

    expect(resendReportScheduleRunWorkflow).toHaveBeenCalledWith("tenant_1", "user_1", "run_1");
    expect(retryLeadAutomationAttemptWorkflow).toHaveBeenCalledWith("tenant_1", "user_1", "lead_1");
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
});
