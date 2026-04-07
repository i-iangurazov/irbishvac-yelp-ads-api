import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildLeadAutomationVariables,
  evaluateLeadAutomationEligibility,
  isWithinWorkingHours,
  renderLeadAutomationTemplate
} from "@/features/autoresponder/logic";
import {
  buildLeadAutomationHistory,
  buildLeadAutomationSummary
} from "@/features/autoresponder/normalize";

const getSystemSetting = vi.fn();
const listLeadAutomationTemplates = vi.fn();
const listLeadAutomationRules = vi.fn();
const listLeadAutomationOptions = vi.fn();
const createLeadAutomationTemplate = vi.fn();
const updateLeadAutomationTemplate = vi.fn();
const createLeadAutomationRule = vi.fn();
const updateLeadAutomationRule = vi.fn();
const getLeadAutomationTemplateById = vi.fn();
const getLeadAutomationRuleById = vi.fn();
const getLeadAutomationCandidate = vi.fn();
const listEnabledLeadAutomationRules = vi.fn();
const createLeadAutomationAttempt = vi.fn();
const updateLeadAutomationAttempt = vi.fn();
const deliverLeadAutomationMessage = vi.fn();
const recordAuditEvent = vi.fn();
const logInfo = vi.fn();
const logError = vi.fn();
const isSmtpConfigured = vi.fn();

vi.mock("@/lib/db/settings-repository", () => ({
  getSystemSetting,
  upsertSystemSetting: vi.fn()
}));

vi.mock("@/lib/db/autoresponder-repository", () => ({
  listLeadAutomationTemplates,
  listLeadAutomationRules,
  listLeadAutomationOptions,
  createLeadAutomationTemplate,
  updateLeadAutomationTemplate,
  createLeadAutomationRule,
  updateLeadAutomationRule,
  getLeadAutomationTemplateById,
  getLeadAutomationRuleById,
  getLeadAutomationCandidate,
  listEnabledLeadAutomationRules,
  createLeadAutomationAttempt,
  updateLeadAutomationAttempt
}));

vi.mock("@/features/leads/messaging-service", () => ({
  deliverLeadAutomationMessage
}));

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent
}));

vi.mock("@/lib/utils/logging", () => ({
  logInfo,
  logError
}));

vi.mock("@/features/report-delivery/email", () => ({
  isSmtpConfigured
}));

const baseLead = {
  id: "lead_local_1",
  externalLeadId: "lead_1",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  businessId: "business_1",
  locationId: "location_1",
  serviceCategoryId: "service_1",
  business: {
    id: "business_1",
    name: "Northwind HVAC",
    location: {
      id: "location_1",
      name: "Downtown"
    }
  },
  location: {
    id: "location_1",
    name: "Downtown"
  },
  serviceCategory: {
    id: "service_1",
    name: "HVAC Repair"
  },
  mappedServiceLabel: "HVAC Repair",
  automationAttempts: []
};

const baseRule = {
  id: "rule_1",
  name: "Default rule",
  channel: "EMAIL" as const,
  priority: 100,
  onlyDuringWorkingHours: false,
  timezone: null,
  workingDaysJson: [],
  startMinute: null,
  endMinute: null,
  locationId: null,
  serviceCategoryId: null,
  template: {
    id: "template_1",
    name: "Default template",
    isEnabled: true,
    subjectTemplate: "Hi {{customer_name}}",
    bodyTemplate: "Thanks for contacting {{business_name}} about {{service_type}}.",
    sourceSystem: "INTERNAL" as const
  }
};

describe("autoresponder helpers", () => {
  it("renders template variables from lead data", () => {
    const variables = buildLeadAutomationVariables(baseLead);
    const text = renderLeadAutomationTemplate(
      "Hi {{customer_name}}, {{business_name}} received your {{service_type}} request ({{lead_reference}}).",
      variables
    );

    expect(text).toBe("Hi Jane Doe, Northwind HVAC received your HVAC Repair request (lead_1).");
  });

  it("enforces working-hours rules in the rule timezone", () => {
    expect(
      isWithinWorkingHours(
        {
          onlyDuringWorkingHours: true,
          timezone: "UTC",
          workingDaysJson: [1, 2, 3, 4, 5],
          startMinute: 9 * 60,
          endMinute: 17 * 60
        },
        new Date("2026-04-06T10:00:00.000Z")
      )
    ).toBe(true);

    expect(
      isWithinWorkingHours(
        {
          onlyDuringWorkingHours: true,
          timezone: "UTC",
          workingDaysJson: [1, 2, 3, 4, 5],
          startMinute: 9 * 60,
          endMinute: 17 * 60
        },
        new Date("2026-04-05T10:00:00.000Z")
      )
    ).toBe(false);
  });

  it("marks duplicate sends as ineligible before any provider call", () => {
    const result = evaluateLeadAutomationEligibility({
      settings: {
        isEnabled: true,
        defaultChannel: "EMAIL"
      },
      smtpConfigured: true,
      lead: {
        ...baseLead,
        automationAttempts: [{ id: "attempt_1" }]
      },
      rules: [baseRule]
    });

    expect(result).toMatchObject({
      eligible: false,
      skipReason: "DUPLICATE"
    });
  });

  it("allows Yelp-thread first responses without masked email or SMTP", () => {
    const result = evaluateLeadAutomationEligibility({
      settings: {
        isEnabled: true,
        defaultChannel: "YELP_THREAD"
      },
      smtpConfigured: false,
      lead: {
        ...baseLead,
        customerEmail: null
      },
      rules: [
        {
          ...baseRule,
          channel: "YELP_THREAD" as const
        }
      ]
    });

    expect(result).toMatchObject({
      eligible: true,
      recipient: null
    });
  });

  it("orders automation history chronologically and preserves message state", () => {
    const history = buildLeadAutomationHistory([
      {
        id: "attempt_2",
        status: "SENT",
        skipReason: null,
        channel: "EMAIL",
        recipient: "jane@example.com",
        renderedSubject: "Subject",
        renderedBody: "Body",
        providerMessageId: "msg_1",
        providerStatus: "sent",
        providerMetadataJson: {},
        errorSummary: null,
        triggeredAt: new Date("2026-04-03T09:10:00.000Z"),
        startedAt: new Date("2026-04-03T09:10:10.000Z"),
        completedAt: new Date("2026-04-03T09:10:20.000Z"),
        template: { id: "tpl_1", name: "Template A" },
        rule: { id: "rule_1", name: "Rule A", location: null, serviceCategory: null }
      },
      {
        id: "attempt_1",
        status: "SKIPPED",
        skipReason: "OUTSIDE_WORKING_HOURS",
        channel: "EMAIL",
        recipient: null,
        renderedSubject: null,
        renderedBody: null,
        providerMessageId: null,
        providerStatus: null,
        providerMetadataJson: null,
        errorSummary: null,
        triggeredAt: new Date("2026-04-03T09:00:00.000Z"),
        startedAt: null,
        completedAt: new Date("2026-04-03T09:00:05.000Z"),
        template: { id: "tpl_1", name: "Template A" },
        rule: { id: "rule_1", name: "Rule A", location: null, serviceCategory: null }
      }
    ]);

    expect(history.map((item) => item.id)).toEqual(["attempt_1", "attempt_2"]);
    expect(buildLeadAutomationSummary({
      status: "SKIPPED",
      skipReason: "OUTSIDE_WORKING_HOURS",
      recipient: null,
      errorSummary: null,
      template: { name: "Template A" }
    })).toEqual({
      status: "SKIPPED",
      message: "Outside working hours"
    });
  });
});

describe("autoresponder service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSystemSetting.mockResolvedValue({
      isEnabled: true,
      defaultChannel: "EMAIL"
    });
    getLeadAutomationCandidate.mockResolvedValue(baseLead);
    listEnabledLeadAutomationRules.mockResolvedValue([baseRule]);
    isSmtpConfigured.mockReturnValue(true);
  });

  it("prevents duplicate first responses when an attempt already exists", async () => {
    getLeadAutomationCandidate.mockResolvedValue({
      ...baseLead,
      automationAttempts: [{ id: "attempt_1" }]
    });

    const { processLeadAutoresponderForNewLead } = await import("@/features/autoresponder/service");
    const result = await processLeadAutoresponderForNewLead("tenant_1", "lead_local_1");

    expect(result).toEqual({ status: "DUPLICATE" });
    expect(createLeadAutomationAttempt).not.toHaveBeenCalled();
    expect(deliverLeadAutomationMessage).not.toHaveBeenCalled();
  });

  it("records a skipped attempt when the lead has no deliverable contact", async () => {
    getLeadAutomationCandidate.mockResolvedValue({
      ...baseLead,
      customerEmail: null
    });
    createLeadAutomationAttempt.mockResolvedValue({
      id: "attempt_1",
      status: "SKIPPED",
      skipReason: "MISSING_CONTACT"
    });

    const { processLeadAutoresponderForNewLead } = await import("@/features/autoresponder/service");
    const result = await processLeadAutoresponderForNewLead("tenant_1", "lead_local_1");

    expect(createLeadAutomationAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "SKIPPED",
        skipReason: "MISSING_CONTACT"
      })
    );
    expect(deliverLeadAutomationMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "SKIPPED",
      skipReason: "MISSING_CONTACT"
    });
  });

  it("sends email and marks the attempt sent on the happy path", async () => {
    createLeadAutomationAttempt.mockResolvedValue({
      id: "attempt_1",
      ruleId: "rule_1",
      templateId: "template_1",
      channel: "EMAIL",
      recipient: "jane@example.com"
    });
    deliverLeadAutomationMessage.mockResolvedValue({
      status: "SENT",
      deliveryChannel: "EMAIL",
      warning: null,
      error: null
    });
    updateLeadAutomationAttempt.mockResolvedValue({
      id: "attempt_1",
      status: "SENT",
      channel: "EMAIL",
      recipient: "jane@example.com",
      ruleId: "rule_1",
      templateId: "template_1",
      providerStatus: "sent",
      providerMetadataJson: {
        deliveryChannel: "EMAIL"
      }
    });

    const { processLeadAutoresponderForNewLead } = await import("@/features/autoresponder/service");
    const result = await processLeadAutoresponderForNewLead("tenant_1", "lead_local_1");

    expect(createLeadAutomationAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "PENDING",
        renderedSubject: "Hi Jane Doe",
        renderedBody: "Thanks for contacting Northwind HVAC about HVAC Repair."
      })
    );
    expect(deliverLeadAutomationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_1",
        leadId: "lead_local_1",
        automationAttemptId: "attempt_1",
        channel: "EMAIL"
      })
    );
    expect(updateLeadAutomationAttempt).toHaveBeenCalledWith(
      "attempt_1",
      expect.objectContaining({
        status: "SENT",
        providerMetadataJson: expect.objectContaining({
          deliveryChannel: "EMAIL"
        })
      })
    );
    expect(result).toMatchObject({
      status: "SENT"
    });
  });

  it("marks the attempt failed when delivery throws", async () => {
    createLeadAutomationAttempt.mockResolvedValue({
      id: "attempt_1",
      ruleId: "rule_1",
      templateId: "template_1",
      channel: "EMAIL",
      recipient: "jane@example.com"
    });
    deliverLeadAutomationMessage.mockResolvedValue({
      status: "FAILED",
      deliveryChannel: "EMAIL",
      warning: null,
      error: new Error("SMTP outage")
    });
    updateLeadAutomationAttempt.mockResolvedValue({
      id: "attempt_1",
      status: "FAILED",
      errorSummary: "SMTP outage"
    });

    const { processLeadAutoresponderForNewLead } = await import("@/features/autoresponder/service");
    const result = await processLeadAutoresponderForNewLead("tenant_1", "lead_local_1");

    expect(updateLeadAutomationAttempt).toHaveBeenCalledWith(
      "attempt_1",
      expect.objectContaining({
        status: "FAILED",
        errorSummary: "SMTP outage"
      })
    );
    expect(result).toMatchObject({
      status: "FAILED",
      errorSummary: "SMTP outage"
    });
  });
});
