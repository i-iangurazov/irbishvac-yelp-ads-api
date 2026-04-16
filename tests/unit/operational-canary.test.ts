import { beforeEach, describe, expect, it, vi } from "vitest";

const listTenantIds = vi.fn();

vi.mock("@/lib/db/settings-repository", () => ({
  listTenantIds
}));

vi.mock("@/lib/utils/fetch", () => ({
  fetchWithRetry: vi.fn()
}));

describe("operational canaries", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    listTenantIds.mockResolvedValue([{ id: "tenant_1" }]);
  });

  it("reports database, cron, worker, and webhook canary posture without side effects", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.APP_URL = "https://example.test";

    const { runOperationalCanaries } = await import("@/features/operations/canary-service");
    const result = await runOperationalCanaries();

    expect(result.status).toBe("WARN");
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "database.tenants",
          status: "PASS"
        }),
        expect.objectContaining({
          key: "env.cron_secret",
          status: "PASS"
        }),
        expect.objectContaining({
          key: "webhook.verification",
          status: "WARN"
        }),
        expect.objectContaining({
          key: "worker.reconcile",
          detail: "https://example.test/api/internal/reconcile"
        })
      ])
    );
  });
});
