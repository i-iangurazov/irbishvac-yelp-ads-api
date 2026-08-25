import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import { getWebhookReconcileDrilldown } from "@/lib/db/operations-repository";

describe("operations repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps compact webhook and reconcile aggregates without loading raw payloads", async () => {
    const receivedAt = new Date("2026-08-25T11:30:00.000Z");
    const startedAt = new Date("2026-08-25T11:35:00.000Z");

    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          acceptedLast24h: 18n,
          queued: 1n,
          processing: 0n,
          completed: 15n,
          partial: 1n,
          failed: 1n,
          skipped: 0n,
          failedLast24h: 2n,
          oldestPendingId: "webhook-1",
          oldestPendingReceivedAt: receivedAt,
          oldestPendingStatus: "QUEUED",
        },
      ])
      .mockResolvedValueOnce([
        {
          queued: 0n,
          processing: 1n,
          completed: 20n,
          partial: 1n,
          failed: 2n,
          skipped: 0n,
          completedLast24h: 8n,
          failedLast24h: 1n,
          oldestPendingId: "sync-1",
          oldestPendingType: "YELP_LEADS_WEBHOOK",
          oldestPendingStatus: "PROCESSING",
          oldestPendingStartedAt: startedAt,
          oldestPendingCreatedAt: startedAt,
          oldestPendingErrorSummary: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "webhook-2",
          receivedAt,
          eventKey: "lead.updated",
          deliveryId: "delivery-2",
          status: "FAILED",
          errorJson: { category: "AUTH" },
          leadId: "lead-2",
          externalLeadId: "external-lead-2",
          externalBusinessId: "external-business-2",
          customerName: null,
          businessId: "business-2",
          businessName: "Test business",
          encryptedYelpBusinessId: "encrypted",
          syncRunId: "sync-2",
          syncRunType: "YELP_LEADS_WEBHOOK",
          syncRunStatus: "FAILED",
          syncRunStartedAt: startedAt,
          syncRunFinishedAt: null,
          syncRunErrorSummary: "Authentication failed",
          syncErrorCount: 3n,
        },
      ]);

    const result = await getWebhookReconcileDrilldown(
      "tenant-1",
      new Date("2026-08-25T12:00:00.000Z"),
    );

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(3);
    expect(result.counts).toMatchObject({
      acceptedLast24h: 18,
      queued: 1,
      failedLast24h: 2,
    });
    expect(result.reconcileCounts).toMatchObject({
      processing: 1,
      completedLast24h: 8,
      failedLast24h: 1,
    });
    expect(result.oldestPending).toEqual({
      id: "webhook-1",
      receivedAt,
      status: "QUEUED",
    });
    expect(result.attentionEvents).toEqual([
      expect.objectContaining({
        id: "webhook-2",
        status: "FAILED",
        syncRun: expect.objectContaining({
          id: "sync-2",
          _count: { errors: 3 },
        }),
      }),
    ]);
    expect(result.recentEvents).toEqual([]);
  });
});
