import { describe, expect, it, vi } from "vitest";

const saveServiceTitanConnectorWorkflow = vi.fn();
const syncServiceTitanLifecycleWorkflow = vi.fn();
const syncServiceTitanReferenceDataWorkflow = vi.fn();
const testServiceTitanConnectorWorkflow = vi.fn();

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission: vi.fn(() => ({
    id: "user_1",
    tenantId: "tenant_1"
  })),
  handleRouteError: vi.fn((error) => {
    throw error;
  })
}));

vi.mock("@/features/crm-connector/service", () => ({
  saveServiceTitanConnectorWorkflow,
  syncServiceTitanReferenceDataWorkflow,
  testServiceTitanConnectorWorkflow
}));

vi.mock("@/features/crm-connector/lifecycle-service", () => ({
  syncServiceTitanLifecycleWorkflow
}));

describe("ServiceTitan connector routes", () => {
  it("saves connector config through the dedicated route", async () => {
    saveServiceTitanConnectorWorkflow.mockResolvedValueOnce({
      id: "cred_1",
      kind: "CRM_SERVICETITAN"
    });

    const { POST } = await import("@/app/api/integrations/servicetitan/config/route");
    const response = await POST(
      new Request("http://localhost/api/integrations/servicetitan/config", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          label: "ServiceTitan Connector",
          environment: "INTEGRATION",
          tenantId: "tenant-123",
          appKey: "app-key-123",
          clientId: "client-id-123",
          clientSecret: "client-secret-123",
          apiBaseUrl: "https://api-integration.servicetitan.io",
          authBaseUrl: "https://auth-integration.servicetitan.io",
          isEnabled: true
        })
      })
    );

    expect(response.status).toBe(200);
    expect(saveServiceTitanConnectorWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      expect.objectContaining({
        label: "ServiceTitan Connector",
        environment: "INTEGRATION"
      })
    );
  });

  it("runs connector reference sync through the sync route", async () => {
    syncServiceTitanReferenceDataWorkflow.mockResolvedValueOnce({
      scope: "ALL",
      results: [
        { type: "LOCATION_MAPPING", status: "COMPLETED" },
        { type: "SERVICE_MAPPING", status: "COMPLETED" }
      ]
    });

    const { POST } = await import("@/app/api/integrations/servicetitan/sync/route");
    const response = await POST(
      new Request("http://localhost/api/integrations/servicetitan/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          scope: "ALL"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(syncServiceTitanReferenceDataWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      expect.objectContaining({
        scope: "ALL"
      })
    );
  });

  it("runs ServiceTitan lifecycle sync through the dedicated route", async () => {
    syncServiceTitanLifecycleWorkflow.mockResolvedValueOnce({
      mode: "DUE",
      selectedCount: 2,
      completedCount: 2,
      partialCount: 0,
      failedCount: 0
    });

    const { POST } = await import("@/app/api/integrations/servicetitan/lifecycle-sync/route");
    const response = await POST(
      new Request("http://localhost/api/integrations/servicetitan/lifecycle-sync", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          mode: "DUE",
          limit: 10
        })
      })
    );

    expect(response.status).toBe(200);
    expect(syncServiceTitanLifecycleWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      expect.objectContaining({
        mode: "DUE",
        limit: 10
      })
    );
  });

  it("runs the ServiceTitan test route", async () => {
    testServiceTitanConnectorWorkflow.mockResolvedValueOnce({
      status: "SUCCESS",
      message: "Connected"
    });

    const { POST } = await import("@/app/api/integrations/servicetitan/test/route");
    const response = await POST();

    expect(response.status).toBe(200);
    expect(testServiceTitanConnectorWorkflow).toHaveBeenCalledWith("tenant_1", "user_1");
  });
});
