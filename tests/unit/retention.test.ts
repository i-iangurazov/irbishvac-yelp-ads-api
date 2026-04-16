import { beforeEach, describe, expect, it, vi } from "vitest";

const listWebhookEventsForRetention = vi.fn();
const redactWebhookEvents = vi.fn();
const listSyncRunsForRetention = vi.fn();
const redactSyncRuns = vi.fn();
const listAuditEventsForRetention = vi.fn();
const redactAuditEventRawPayload = vi.fn();
const redactAuditEventDebugSummaries = vi.fn();
const listConversationTurnsForRetention = vi.fn();
const redactConversationTurns = vi.fn();
const listSyncErrorsForRetention = vi.fn();
const redactSyncErrors = vi.fn();
const listTenantIds = vi.fn();
const upsertSystemSetting = vi.fn();

vi.mock("@/lib/db/retention-repository", () => ({
  listWebhookEventsForRetention,
  redactWebhookEvents,
  listSyncRunsForRetention,
  redactSyncRuns,
  listAuditEventsForRetention,
  redactAuditEventRawPayload,
  redactAuditEventDebugSummaries,
  listConversationTurnsForRetention,
  redactConversationTurns,
  listSyncErrorsForRetention,
  redactSyncErrors
}));

vi.mock("@/lib/db/settings-repository", () => ({
  listTenantIds,
  upsertSystemSetting
}));

describe("operational retention service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTenantIds.mockResolvedValue([{ id: "tenant_1" }, { id: "tenant_2" }]);
    listWebhookEventsForRetention.mockResolvedValue([
      {
        id: "webhook_1",
        tenantId: "tenant_1",
        headersJson: { foo: "bar" },
        errorJson: null,
        payloadJson: { hello: "world" }
      }
    ]);
    listSyncRunsForRetention.mockResolvedValue([
      {
        id: "sync_1",
        tenantId: "tenant_1",
        requestJson: { request: true },
        responseJson: null
      }
    ]);
    listAuditEventsForRetention.mockResolvedValue([
      {
        id: "audit_1",
        tenantId: "tenant_1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        requestSummaryJson: { request: true },
        responseSummaryJson: null,
        beforeJson: null,
        afterJson: null,
        rawPayloadSummaryJson: { raw: true }
      }
    ]);
    listConversationTurnsForRetention.mockResolvedValue([
      {
        id: "turn_1",
        tenantId: "tenant_2",
        renderedSubject: null,
        renderedBody: "Hello",
        metadataJson: { prompt: "test" }
      }
    ]);
    listSyncErrorsForRetention.mockResolvedValue([
      {
        id: "sync_error_1",
        tenantId: "tenant_2",
        detailsJson: { code: "bad" }
      }
    ]);
  });

  it("redacts hot-window debug artifacts and records per-tenant counts", async () => {
    const { operationalRetentionPolicy, runOperationalRetention } = await import(
      "@/features/operations/retention-service"
    );

    const result = await runOperationalRetention(25);

    expect(redactWebhookEvents).toHaveBeenCalledWith(
      ["webhook_1"],
      expect.objectContaining({
        retained: false,
        hotRetentionDays: operationalRetentionPolicy.webhookPayloadHotDays
      })
    );
    expect(redactSyncRuns).toHaveBeenCalledWith(["sync_1"]);
    expect(redactAuditEventRawPayload).toHaveBeenCalledWith(["audit_1"]);
    expect(redactAuditEventDebugSummaries).toHaveBeenCalledWith(["audit_1"]);
    expect(redactConversationTurns).toHaveBeenCalledWith(
      ["turn_1"],
      expect.objectContaining({
        retained: false,
        hotRetentionDays: operationalRetentionPolicy.conversationTurnHotDays
      })
    );
    expect(redactSyncErrors).toHaveBeenCalledWith(["sync_error_1"]);
    expect(upsertSystemSetting).toHaveBeenCalledTimes(2);
    expect(result.counts).toMatchObject({
      webhookPayloadsRedacted: 1,
      syncRunDebugRecordsRedacted: 1,
      auditRawPayloadsRedacted: 1,
      auditDebugSummariesRedacted: 1,
      conversationTurnsRedacted: 1,
      syncErrorsRedacted: 1
    });
  });
});
