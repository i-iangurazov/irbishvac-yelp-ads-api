import { beforeEach, describe, expect, it, vi } from "vitest";

const getWebhookReconcileDrilldown = vi.fn();
const getOperationalPilotOverview = vi.fn();
const listTenantIds = vi.fn();
const fetchWithRetry = vi.fn();

vi.mock("@/lib/db/operations-repository", () => ({
  getWebhookReconcileDrilldown
}));

vi.mock("@/features/operations/observability-service", () => ({
  getOperationalPilotOverview
}));

vi.mock("@/lib/db/settings-repository", () => ({
  listTenantIds
}));

vi.mock("@/lib/utils/fetch", () => ({
  fetchWithRetry
}));

function mockHealthyPilotOverview() {
  getOperationalPilotOverview.mockResolvedValue({
    windows: {
      last24h: {
        automationFailed: 0,
        serviceTitanFailures: 0
      },
      last7d: {
        reportDeliveryFailures: 0
      }
    },
    queue: {
      highSeverity: 0
    }
  });
}

function mockWebhookOverview(overrides?: Partial<Awaited<ReturnType<typeof getWebhookReconcileDrilldown>>>) {
  getWebhookReconcileDrilldown.mockResolvedValue({
    counts: {
      queued: 0,
      processing: 0,
      completed: 10,
      partial: 0,
      failed: 0,
      skipped: 0,
      failedLast24h: 0
    },
    oldestPending: null,
    attentionEvents: [],
    recentEvents: [],
    staleThresholdMs: 600000,
    ...overrides
  });
}

describe("operational alerting", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.OPERATIONS_ALERT_WEBHOOK_URL;
    delete process.env.OPERATIONS_ALERT_WEBHOOK_SECRET;
    listTenantIds.mockResolvedValue([{ id: "tenant_1" }]);
    mockHealthyPilotOverview();
    mockWebhookOverview();
    fetchWithRetry.mockResolvedValue({
      ok: true,
      status: 202
    });
  });

  it("marks stale webhook backlog and repeated webhook failures as critical", async () => {
    const now = new Date("2026-04-16T12:00:00.000Z");
    const receivedAt = new Date(now.getTime() - 31 * 60 * 1000);

    mockWebhookOverview({
      counts: {
        queued: 1,
        processing: 0,
        completed: 10,
        partial: 1,
        failed: 6,
        skipped: 0,
        failedLast24h: 6
      },
      oldestPending: {
        id: "webhook_1",
        receivedAt,
        status: "QUEUED"
      }
    });

    const { evaluateOperationalAlerts } = await import("@/features/operations/alerting-service");
    const result = await evaluateOperationalAlerts("tenant_1", now);

    expect(result.status).toBe("CRITICAL");
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "webhook.oldest_pending_age",
          severity: "CRITICAL"
        }),
        expect.objectContaining({
          key: "webhook.failed_24h",
          severity: "CRITICAL"
        })
      ])
    );
  });

  it("dispatches non-OK alert digests when an alert webhook is configured", async () => {
    process.env.OPERATIONS_ALERT_WEBHOOK_URL = "https://alerts.example.test/ingest";
    process.env.OPERATIONS_ALERT_WEBHOOK_SECRET = "alert-secret";
    mockWebhookOverview({
      counts: {
        queued: 0,
        processing: 0,
        completed: 10,
        partial: 1,
        failed: 1,
        skipped: 0,
        failedLast24h: 1
      }
    });

    const { runOperationalAlertEvaluation } = await import("@/features/operations/alerting-service");
    const result = await runOperationalAlertEvaluation({
      dispatch: true,
      now: new Date("2026-04-16T12:00:00.000Z")
    });

    expect(result.status).toBe("WARN");
    expect(fetchWithRetry).toHaveBeenCalledWith(
      "https://alerts.example.test/ingest",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer alert-secret"
        })
      })
    );
    expect(JSON.parse(fetchWithRetry.mock.calls[0][1].body)).toMatchObject({
      source: "irbishvac-yelp-ads-api",
      kind: "operational-alert-digest",
      tenantId: "tenant_1",
      status: "WARN"
    });
  });
});
