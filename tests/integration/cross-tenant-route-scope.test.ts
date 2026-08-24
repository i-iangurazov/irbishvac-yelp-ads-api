import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  exportAiUsageToCsv,
  requireApiPermission,
  saveCredentialSet,
  sendLeadReplyWorkflow,
  updateProgramBudgetWorkflow,
} = vi.hoisted(() => ({
  exportAiUsageToCsv: vi.fn(),
  requireApiPermission: vi.fn(),
  saveCredentialSet: vi.fn(),
  sendLeadReplyWorkflow: vi.fn(),
  updateProgramBudgetWorkflow: vi.fn(),
}));

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission,
  handleRouteError: vi.fn((error) => {
    throw error;
  }),
}));

vi.mock("@/features/ads-programs/service", () => ({
  updateProgramBudgetWorkflow,
}));

vi.mock("@/features/settings/service", () => ({
  saveCredentialSet,
}));

vi.mock("@/features/leads/messaging-service", () => ({
  sendLeadReplyWorkflow,
}));

vi.mock("@/features/autoresponder/usage-export", () => ({
  exportAiUsageToCsv,
}));

describe("cross-tenant route scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiPermission.mockResolvedValue({
      id: "user_a",
      tenantId: "tenant_a",
      role: { code: "PLATFORM_ADMIN" },
    });
    updateProgramBudgetWorkflow.mockResolvedValue({ id: "program_b" });
    saveCredentialSet.mockResolvedValue({ id: "credential_a" });
    sendLeadReplyWorkflow.mockResolvedValue({ status: "SENT" });
    exportAiUsageToCsv.mockResolvedValue("month,total\n2026-08,0\n");
  });

  it("uses the authenticated tenant for campaign writes", async () => {
    const { POST } =
      await import("@/app/api/programs/[programId]/budget/route");
    const body = { tenantId: "tenant_b", monthlyBudget: 500 };

    await POST(
      new Request("http://localhost/api/programs/program_b/budget", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ programId: "program_b" }) },
    );

    expect(updateProgramBudgetWorkflow).toHaveBeenCalledWith(
      "tenant_a",
      "user_a",
      "program_b",
      body,
    );
  });

  it("uses the authenticated tenant for credential writes", async () => {
    const { POST } = await import("@/app/api/settings/credentials/route");
    const body = {
      tenantId: "tenant_b",
      kind: "REPORTING_FUSION",
      accessToken: "not-a-real-secret",
    };

    await POST(
      new Request("http://localhost/api/settings/credentials", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );

    expect(saveCredentialSet).toHaveBeenCalledWith("tenant_a", "user_a", body);
  });

  it("uses the authenticated tenant for lead sends", async () => {
    const { POST } = await import("@/app/api/leads/[leadId]/reply/route");
    const body = {
      tenantId: "tenant_b",
      channel: "YELP_THREAD",
      body: "Controlled reply",
    };

    await POST(
      new Request("http://localhost/api/leads/lead_b/reply", {
        method: "POST",
        headers: { "idempotency-key": "reply-once" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ leadId: "lead_b" }) },
    );

    expect(sendLeadReplyWorkflow).toHaveBeenCalledWith(
      "tenant_a",
      "user_a",
      "lead_b",
      body,
      { idempotencyKey: "reply-once" },
    );
  });

  it("uses the authenticated tenant for billing exports", async () => {
    const { GET } = await import("@/app/api/usage/ai/export/route");

    await GET(
      new Request(
        "http://localhost/api/usage/ai/export?month=2026-08&tenantId=tenant_b",
      ),
    );

    expect(exportAiUsageToCsv).toHaveBeenCalledWith("tenant_a", "2026-08");
  });
});
