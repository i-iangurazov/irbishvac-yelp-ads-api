import { describe, expect, it, vi } from "vitest";

const resolveOperatorIssueWorkflow = vi.fn();
const ignoreOperatorIssueWorkflow = vi.fn();
const addOperatorIssueNoteWorkflow = vi.fn();
const retryOperatorIssueWorkflow = vi.fn();
const bulkOperatorIssueActionWorkflow = vi.fn();

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission: vi.fn(async () => ({ id: "user_1", tenantId: "tenant_1", role: { code: "OPERATOR" } })),
  handleRouteError: vi.fn((error) => {
    throw error;
  })
}));

vi.mock("@/features/issues/service", () => ({
  resolveOperatorIssueWorkflow,
  ignoreOperatorIssueWorkflow,
  addOperatorIssueNoteWorkflow,
  retryOperatorIssueWorkflow,
  bulkOperatorIssueActionWorkflow
}));

describe("issue action routes", () => {
  it("posts issue resolution requests through the retry permission flow", async () => {
    resolveOperatorIssueWorkflow.mockResolvedValueOnce({
      id: "issue_1",
      status: "RESOLVED"
    });

    const { POST } = await import("@/app/api/issues/[issueId]/resolve/route");
    const response = await POST(
      new Request("http://localhost/api/issues/issue_1/resolve", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          reason: "Handled",
          note: "Resolved in lead workspace."
        })
      }),
      {
        params: Promise.resolve({ issueId: "issue_1" })
      }
    );

    expect(response.status).toBe(200);
    expect(resolveOperatorIssueWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      "issue_1",
      expect.objectContaining({
        reason: "Handled"
      })
    );
  });

  it("posts ignore and note requests", async () => {
    ignoreOperatorIssueWorkflow.mockResolvedValueOnce({
      id: "issue_1",
      status: "IGNORED"
    });
    addOperatorIssueNoteWorkflow.mockResolvedValueOnce({
      id: "issue_1",
      status: "OPEN"
    });

    const { POST: ignorePost } = await import("@/app/api/issues/[issueId]/ignore/route");
    const ignoreResponse = await ignorePost(
      new Request("http://localhost/api/issues/issue_1/ignore", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          reason: "Known sandbox issue",
          note: "Ignore until vendor credential refresh."
        })
      }),
      {
        params: Promise.resolve({ issueId: "issue_1" })
      }
    );

    const { POST: notePost } = await import("@/app/api/issues/[issueId]/note/route");
    const noteResponse = await notePost(
      new Request("http://localhost/api/issues/issue_1/note", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          note: "Waiting on follow-up."
        })
      }),
      {
        params: Promise.resolve({ issueId: "issue_1" })
      }
    );

    expect(ignoreResponse.status).toBe(200);
    expect(noteResponse.status).toBe(200);
    expect(ignoreOperatorIssueWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      "issue_1",
      expect.objectContaining({
        reason: "Known sandbox issue"
      })
    );
    expect(addOperatorIssueNoteWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      "issue_1",
      expect.objectContaining({
        note: "Waiting on follow-up."
      })
    );
  });

  it("posts retry requests through the issue retry workflow", async () => {
    retryOperatorIssueWorkflow.mockResolvedValueOnce({
      id: "issue_1",
      status: "OPEN"
    });

    const { POST } = await import("@/app/api/issues/[issueId]/retry/route");
    const response = await POST(new Request("http://localhost/api/issues/issue_1/retry", { method: "POST" }), {
      params: Promise.resolve({ issueId: "issue_1" })
    });

    expect(response.status).toBe(200);
    expect(retryOperatorIssueWorkflow).toHaveBeenCalledWith("tenant_1", "user_1", "issue_1");
  });

  it("posts bulk issue actions through the bulk workflow", async () => {
    bulkOperatorIssueActionWorkflow.mockResolvedValueOnce({
      action: "retry",
      selected: 3,
      succeeded: 2,
      failed: 0,
      skipped: 1,
      results: []
    });

    const { POST } = await import("@/app/api/issues/bulk/route");
    const response = await POST(
      new Request("http://localhost/api/issues/bulk", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          action: "retry",
          issueIds: ["issue_1", "issue_2", "issue_3"]
        })
      })
    );

    expect(response.status).toBe(200);
    expect(bulkOperatorIssueActionWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      expect.objectContaining({
        action: "retry",
        issueIds: ["issue_1", "issue_2", "issue_3"]
      })
    );
  });
});
