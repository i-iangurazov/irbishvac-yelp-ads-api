import { describe, expect, it, vi } from "vitest";

const saveLeadAutoresponderSettings = vi.fn();
const createLeadAutomationTemplateWorkflow = vi.fn();
const updateLeadAutomationTemplateWorkflow = vi.fn();
const createLeadAutomationRuleWorkflow = vi.fn();
const updateLeadAutomationRuleWorkflow = vi.fn();

vi.mock("@/lib/utils/http", () => ({
  requireApiPermission: vi.fn(async () => ({ id: "user_1", tenantId: "tenant_1", role: { code: "ADMIN" } })),
  handleRouteError: vi.fn((error) => {
    throw error;
  })
}));

vi.mock("@/features/autoresponder/service", () => ({
  saveLeadAutoresponderSettings,
  createLeadAutomationTemplateWorkflow,
  updateLeadAutomationTemplateWorkflow,
  createLeadAutomationRuleWorkflow,
  updateLeadAutomationRuleWorkflow
}));

describe("autoresponder settings routes", () => {
  it("saves tenant-level autoresponder settings through the settings write route", async () => {
    saveLeadAutoresponderSettings.mockResolvedValueOnce({
      isEnabled: true,
      defaultChannel: "EMAIL"
    });

    const { POST } = await import("@/app/api/settings/autoresponder/route");
    const response = await POST(
      new Request("http://localhost/api/settings/autoresponder", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          isEnabled: true,
          defaultChannel: "EMAIL"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(saveLeadAutoresponderSettings).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      expect.objectContaining({
        isEnabled: true,
        defaultChannel: "EMAIL"
      })
    );
  });

  it("creates automation templates through the template route", async () => {
    createLeadAutomationTemplateWorkflow.mockResolvedValueOnce({
      id: "template_1",
      name: "Default template"
    });

    const { POST } = await import("@/app/api/settings/autoresponder/templates/route");
    const response = await POST(
      new Request("http://localhost/api/settings/autoresponder/templates", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: "Default template",
          channel: "EMAIL",
          isEnabled: true,
          bodyTemplate: "Hello"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(createLeadAutomationTemplateWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      expect.objectContaining({
        name: "Default template",
        channel: "EMAIL"
      })
    );
  });

  it("updates automation rules through the rule route", async () => {
    updateLeadAutomationRuleWorkflow.mockResolvedValueOnce({
      id: "rule_1",
      name: "Weekday default"
    });

    const { PATCH } = await import("@/app/api/settings/autoresponder/rules/[ruleId]/route");
    const response = await PATCH(
      new Request("http://localhost/api/settings/autoresponder/rules/rule_1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: "Weekday default",
          templateId: "template_1",
          channel: "EMAIL",
          isEnabled: true,
          priority: 100,
          onlyDuringWorkingHours: false,
          workingDays: [1, 2, 3, 4, 5]
        })
      }),
      {
        params: Promise.resolve({ ruleId: "rule_1" })
      }
    );

    expect(response.status).toBe(200);
    expect(updateLeadAutomationRuleWorkflow).toHaveBeenCalledWith(
      "tenant_1",
      "user_1",
      "rule_1",
      expect.objectContaining({
        name: "Weekday default"
      })
    );
  });
});
