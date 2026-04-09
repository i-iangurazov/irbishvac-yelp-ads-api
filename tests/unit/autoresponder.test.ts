import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyLeadAutomationDisclosure,
  buildLeadAutomationVariables,
  evaluateLeadAutomationEligibility,
  evaluateLeadAutomationFollowUpEligibility,
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
const listLeadAutomationBusinessOverrides = vi.fn();
const createLeadAutomationTemplate = vi.fn();
const updateLeadAutomationTemplate = vi.fn();
const createLeadAutomationRule = vi.fn();
const updateLeadAutomationRule = vi.fn();
const upsertLeadAutomationBusinessOverride = vi.fn();
const deleteLeadAutomationBusinessOverride = vi.fn();
const getLeadAutomationBusinessOverrideByBusinessId = vi.fn();
const getLeadAutomationTemplateById = vi.fn();
const getLeadAutomationRuleById = vi.fn();
const getLeadAutomationCandidate = vi.fn();
const listEnabledLeadAutomationRules = vi.fn();
const createLeadAutomationAttempt = vi.fn();
const upsertLeadAutomationAttemptByLeadCadence = vi.fn();
const updateLeadAutomationAttempt = vi.fn();
const getLeadAutomationAttemptSummary = vi.fn();
const getLeadAutomationBusinessAttemptHealth = vi.fn();
const listDueLeadAutomationAttempts = vi.fn();
const listRecentLeadAutomationAttempts = vi.fn();
const claimLeadAutomationAttemptForProcessing = vi.fn();
const deliverLeadAutomationMessage = vi.fn();
const recordAuditEvent = vi.fn();
const getAuditLog = vi.fn();
const getAiReplyAssistantState = vi.fn();
const listOperatorIssues = vi.fn();
const logInfo = vi.fn();
const logError = vi.fn();
const isSmtpConfigured = vi.fn();
const ensureYelpLeadsAccess = vi.fn();

vi.mock("@/lib/db/settings-repository", () => ({
  getSystemSetting,
  upsertSystemSetting: vi.fn()
}));

vi.mock("@/lib/db/autoresponder-repository", () => ({
  listLeadAutomationTemplates,
  listLeadAutomationRules,
  listLeadAutomationOptions,
  listLeadAutomationBusinessOverrides,
  createLeadAutomationTemplate,
  updateLeadAutomationTemplate,
  createLeadAutomationRule,
  updateLeadAutomationRule,
  upsertLeadAutomationBusinessOverride,
  deleteLeadAutomationBusinessOverride,
  getLeadAutomationBusinessOverrideByBusinessId,
  getLeadAutomationTemplateById,
  getLeadAutomationRuleById,
  getLeadAutomationCandidate,
  listEnabledLeadAutomationRules,
  createLeadAutomationAttempt,
  upsertLeadAutomationAttemptByLeadCadence,
  updateLeadAutomationAttempt,
  getLeadAutomationAttemptSummary,
  getLeadAutomationBusinessAttemptHealth,
  listDueLeadAutomationAttempts,
  listRecentLeadAutomationAttempts,
  claimLeadAutomationAttemptForProcessing
}));

vi.mock("@/features/leads/messaging-service", () => ({
  deliverLeadAutomationMessage
}));

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent,
  getAuditLog
}));

vi.mock("@/features/leads/ai-reply-service", () => ({
  getAiReplyAssistantState
}));

vi.mock("@/lib/db/issues-repository", () => ({
  listOperatorIssues
}));

vi.mock("@/lib/utils/logging", () => ({
  logInfo,
  logError
}));

vi.mock("@/features/report-delivery/email", () => ({
  isSmtpConfigured
}));

vi.mock("@/lib/yelp/runtime", () => ({
  ensureYelpLeadsAccess
}));

const baseLead = {
  id: "lead_local_1",
  externalLeadId: "lead_1",
  externalConversationId: "conv_1",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  businessId: "business_1",
  locationId: "location_1",
  serviceCategoryId: "service_1",
  internalStatus: "UNMAPPED" as const,
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
  automationAttempts: [],
  events: [],
  conversationActions: []
};

const baseRule = {
  id: "rule_1",
  name: "Default rule",
  channel: "EMAIL" as const,
  cadence: "INITIAL" as const,
  priority: 100,
  businessId: null,
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
    businessId: null,
    subjectTemplate: "Hi {{customer_name}}",
    bodyTemplate: "Thanks for contacting {{business_name}} about {{service_type}}.",
    sourceSystem: "INTERNAL" as const
  }
};

const baseSettings = {
  isEnabled: true,
  scopeMode: "ALL_BUSINESSES" as const,
  scopedBusinessIds: [],
  defaultChannel: "EMAIL" as const,
  emailFallbackEnabled: true,
  followUp24hEnabled: false,
  followUp24hDelayHours: 24,
  followUp7dEnabled: false,
  followUp7dDelayDays: 7,
  aiAssistEnabled: true,
  aiModel: "gpt-5-nano" as const
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

  it("adds an automated disclosure without duplicating it", () => {
    expect(
      applyLeadAutomationDisclosure({
        channel: "EMAIL",
        subject: "Hi Jane Doe",
        body: "Thanks for contacting Northwind HVAC.",
        businessName: "Northwind HVAC"
      })
    ).toEqual({
      subject: "[Automated message] Hi Jane Doe",
      body:
        "Automated message from Northwind HVAC via Yelp - a team member may follow up with more details.\n\nThanks for contacting Northwind HVAC."
    });

    expect(
      applyLeadAutomationDisclosure({
        channel: "YELP_THREAD",
        subject: "Ignored",
        body:
          "Automated message from Northwind HVAC via Yelp - a team member may follow up with more details.\n\nThanks for contacting Northwind HVAC.",
        businessName: "Northwind HVAC"
      })
    ).toEqual({
      subject: "Ignored",
      body:
        "Automated message from Northwind HVAC via Yelp - a team member may follow up with more details.\n\nThanks for contacting Northwind HVAC."
    });
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
      settings: baseSettings,
      smtpConfigured: true,
      lead: {
        ...baseLead,
        automationAttempts: [{ id: "attempt_1", cadence: "INITIAL" }]
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
        ...baseSettings,
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

  it("blocks follow-up when the customer already replied after the last automated message", () => {
    const result = evaluateLeadAutomationFollowUpEligibility({
      settings: {
        ...baseSettings,
        defaultChannel: "YELP_THREAD",
        followUp24hEnabled: true
      },
      cadence: "FOLLOW_UP_24H",
      lead: {
        ...baseLead,
        automationAttempts: [
          {
            id: "attempt_initial",
            cadence: "INITIAL",
            status: "SENT",
            completedAt: new Date("2026-04-03T09:00:00.000Z")
          }
        ],
        events: [
          {
            eventType: "MESSAGE",
            actorType: "CONSUMER",
            occurredAt: new Date("2026-04-03T12:00:00.000Z"),
            isReply: true
          }
        ]
      },
      rules: [
        {
          ...baseRule,
          channel: "YELP_THREAD",
          cadence: "FOLLOW_UP_24H"
        }
      ]
    });

    expect(result).toMatchObject({
      eligible: false,
      skipReason: "CUSTOMER_REPLIED"
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
    getSystemSetting.mockResolvedValue(baseSettings);
    listLeadAutomationTemplates.mockResolvedValue([]);
    listLeadAutomationRules.mockResolvedValue([]);
    listLeadAutomationOptions.mockResolvedValue({
      businesses: [],
      locations: [],
      serviceCategories: []
    });
    listLeadAutomationBusinessOverrides.mockResolvedValue([]);
    getLeadAutomationBusinessOverrideByBusinessId.mockResolvedValue(null);
    getLeadAutomationCandidate.mockResolvedValue(baseLead);
    listEnabledLeadAutomationRules.mockResolvedValue([baseRule]);
    getLeadAutomationAttemptSummary.mockResolvedValue({
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      pendingCount: 0,
      pendingDueCount: 0,
      scheduledCount: 0,
      lastSuccessfulAt: null
    });
    getLeadAutomationBusinessAttemptHealth.mockResolvedValue({
      sentCounts: [],
      failedCounts: [],
      pendingDueCounts: [],
      lastSuccessfulAttempts: []
    });
    listDueLeadAutomationAttempts.mockResolvedValue([]);
    listRecentLeadAutomationAttempts.mockResolvedValue([]);
    claimLeadAutomationAttemptForProcessing.mockResolvedValue(true);
    getAiReplyAssistantState.mockResolvedValue({
      envConfigured: true,
      enabled: true,
      reviewRequired: true,
      model: "gpt-5-nano",
      modelLabel: "gpt-5-nano • Cheapest / test",
      guardrails: ["No prices"]
    });
    getAuditLog.mockResolvedValue([]);
    listOperatorIssues.mockResolvedValue([]);
    isSmtpConfigured.mockReturnValue(true);
    ensureYelpLeadsAccess.mockResolvedValue({
      credential: {
        label: "Yelp Leads bearer token"
      }
    });
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

  it("records a skipped initial attempt when a team member already took over the thread", async () => {
    getLeadAutomationCandidate.mockResolvedValue({
      ...baseLead,
      conversationActions: [
        {
          id: "action_1",
          actionType: "SEND_MESSAGE",
          initiator: "OPERATOR",
          status: "SENT",
          createdAt: new Date("2026-04-09T09:00:00.000Z"),
          completedAt: new Date("2026-04-09T09:01:00.000Z")
        }
      ]
    });
    createLeadAutomationAttempt.mockResolvedValue({
      id: "attempt_1",
      status: "SKIPPED",
      skipReason: "HUMAN_TAKEOVER"
    });

    const { processLeadAutoresponderForNewLead } = await import("@/features/autoresponder/service");
    const result = await processLeadAutoresponderForNewLead("tenant_1", "lead_local_1");

    expect(createLeadAutomationAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "SKIPPED",
        skipReason: "HUMAN_TAKEOVER"
      })
    );
    expect(deliverLeadAutomationMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "SKIPPED",
      skipReason: "HUMAN_TAKEOVER"
    });
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
        renderedSubject: "[Automated message] Hi Jane Doe",
        renderedBody:
          "Automated message from Northwind HVAC via Yelp - a team member may follow up with more details.\n\nThanks for contacting Northwind HVAC about HVAC Repair."
      })
    );
    expect(deliverLeadAutomationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_1",
        leadId: "lead_local_1",
        automationAttemptId: "attempt_1",
        channel: "EMAIL",
        renderedSubject: "[Automated message] Hi Jane Doe",
        renderedBody:
          "Automated message from Northwind HVAC via Yelp - a team member may follow up with more details.\n\nThanks for contacting Northwind HVAC about HVAC Repair."
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

  it("uses the business-specific override when a Yelp business needs different autoresponder policy", async () => {
    getSystemSetting.mockResolvedValueOnce({
      ...baseSettings,
      isEnabled: false,
      defaultChannel: "YELP_THREAD",
      emailFallbackEnabled: false,
      aiAssistEnabled: false
    });
    getLeadAutomationBusinessOverrideByBusinessId.mockResolvedValueOnce({
      businessId: "business_1",
      isEnabled: true,
      defaultChannel: "EMAIL",
      emailFallbackEnabled: true,
      followUp24hEnabled: true,
      followUp24hDelayHours: 24,
      followUp7dEnabled: false,
      followUp7dDelayDays: 7,
      aiAssistEnabled: true,
      aiModel: "gpt-5-mini"
    });
    createLeadAutomationAttempt.mockResolvedValueOnce({
      id: "attempt_override_1",
      ruleId: "rule_1",
      templateId: "template_1",
      channel: "EMAIL",
      recipient: "jane@example.com"
    });
    deliverLeadAutomationMessage.mockResolvedValueOnce({
      status: "SENT",
      deliveryChannel: "EMAIL",
      warning: null,
      error: null
    });
    updateLeadAutomationAttempt.mockResolvedValueOnce({
      id: "attempt_override_1",
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
        channel: "EMAIL"
      })
    );
    expect(result).toMatchObject({
      status: "SENT"
    });
  });

  it("schedules 24-hour and following-week follow-ups after a successful initial thread reply", async () => {
    getSystemSetting.mockResolvedValueOnce({
      ...baseSettings,
      defaultChannel: "YELP_THREAD",
      emailFallbackEnabled: false,
      followUp24hEnabled: true,
      followUp7dEnabled: true
    });
    listEnabledLeadAutomationRules.mockResolvedValueOnce([
      {
        ...baseRule,
        channel: "YELP_THREAD",
        cadence: "INITIAL"
      }
    ]);
    createLeadAutomationAttempt.mockResolvedValueOnce({
      id: "attempt_initial_1",
      ruleId: "rule_1",
      templateId: "template_1",
      channel: "YELP_THREAD",
      recipient: null
    });
    deliverLeadAutomationMessage.mockResolvedValueOnce({
      status: "SENT",
      deliveryChannel: "YELP_THREAD",
      warning: null,
      error: null
    });
    updateLeadAutomationAttempt.mockResolvedValueOnce({
      id: "attempt_initial_1",
      status: "SENT",
      channel: "YELP_THREAD",
      recipient: null,
      ruleId: "rule_1",
      templateId: "template_1",
      providerStatus: "sent",
      providerMetadataJson: {
        deliveryChannel: "YELP_THREAD"
      },
      completedAt: new Date("2026-04-03T09:15:00.000Z")
    });
    upsertLeadAutomationAttemptByLeadCadence
      .mockResolvedValueOnce({
        id: "attempt_follow_up_24h",
        cadence: "FOLLOW_UP_24H"
      })
      .mockResolvedValueOnce({
        id: "attempt_follow_up_7d",
        cadence: "FOLLOW_UP_7D"
      });

    const { processLeadAutoresponderForNewLead } = await import("@/features/autoresponder/service");
    await processLeadAutoresponderForNewLead("tenant_1", "lead_local_1");

    expect(upsertLeadAutomationAttemptByLeadCadence).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tenantId: "tenant_1",
        leadId: "lead_local_1",
        cadence: "FOLLOW_UP_24H",
        dueAt: new Date("2026-04-04T09:15:00.000Z")
      })
    );
    expect(upsertLeadAutomationAttemptByLeadCadence).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tenantId: "tenant_1",
        leadId: "lead_local_1",
        cadence: "FOLLOW_UP_7D",
        dueAt: new Date("2026-04-10T09:15:00.000Z")
      })
    );
  });

  it("sends due follow-ups in the Yelp thread without masked-email fallback", async () => {
    getSystemSetting.mockResolvedValueOnce({
      ...baseSettings,
      defaultChannel: "YELP_THREAD",
      emailFallbackEnabled: true,
      followUp24hEnabled: true
    });
    listDueLeadAutomationAttempts.mockResolvedValueOnce([
      {
        id: "attempt_follow_up_24h",
        tenantId: "tenant_1",
        leadId: "lead_local_1",
        cadence: "FOLLOW_UP_24H"
      }
    ]);
    getLeadAutomationCandidate.mockResolvedValueOnce({
      ...baseLead,
      automationAttempts: [
        {
          id: "attempt_initial",
          cadence: "INITIAL",
          status: "SENT",
          completedAt: new Date("2026-04-03T09:00:00.000Z")
        },
        {
          id: "attempt_follow_up_24h",
          cadence: "FOLLOW_UP_24H",
          status: "PENDING",
          dueAt: new Date("2026-04-04T09:00:00.000Z")
        }
      ]
    });
    listEnabledLeadAutomationRules.mockResolvedValueOnce([
      {
        ...baseRule,
        id: "rule_follow_up_24h",
        channel: "YELP_THREAD",
        cadence: "FOLLOW_UP_24H",
        template: {
          ...baseRule.template,
          bodyTemplate: "Checking back in on your request."
        }
      }
    ]);
    updateLeadAutomationAttempt
      .mockResolvedValueOnce({
        id: "attempt_follow_up_24h",
        status: "PENDING",
        cadence: "FOLLOW_UP_24H"
      })
      .mockResolvedValueOnce({
        id: "attempt_follow_up_24h",
        status: "SENT",
        cadence: "FOLLOW_UP_24H",
        completedAt: new Date("2026-04-04T09:05:00.000Z")
      });
    deliverLeadAutomationMessage.mockResolvedValueOnce({
      status: "SENT",
      deliveryChannel: "YELP_THREAD",
      warning: null,
      error: null
    });

    const { reconcileDueLeadAutomationFollowUps } = await import("@/features/autoresponder/service");
    const result = await reconcileDueLeadAutomationFollowUps(20);

    expect(claimLeadAutomationAttemptForProcessing).toHaveBeenCalledWith(
      "attempt_follow_up_24h",
      expect.any(Date)
    );
    expect(deliverLeadAutomationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        automationAttemptId: "attempt_follow_up_24h",
        channel: "YELP_THREAD",
        allowEmailFallback: false
      })
    );
    expect(result).toEqual([
      expect.objectContaining({
        attemptId: "attempt_follow_up_24h",
        cadence: "FOLLOW_UP_24H",
        status: "SENT"
      })
    ]);
  });

  it("re-queues a due follow-up to the next working window instead of skipping it outright", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T08:00:00.000Z"));

    getSystemSetting.mockResolvedValueOnce({
      ...baseSettings,
      defaultChannel: "YELP_THREAD",
      emailFallbackEnabled: false,
      followUp24hEnabled: true
    });
    listDueLeadAutomationAttempts.mockResolvedValueOnce([
      {
        id: "attempt_follow_up_24h",
        tenantId: "tenant_1",
        leadId: "lead_local_1",
        cadence: "FOLLOW_UP_24H",
        dueAt: new Date("2026-04-05T08:00:00.000Z")
      }
    ]);
    getLeadAutomationCandidate.mockResolvedValueOnce({
      ...baseLead,
      externalConversationId: "conv_1",
      automationAttempts: [
        {
          id: "attempt_initial",
          cadence: "INITIAL",
          status: "SENT",
          completedAt: new Date("2026-04-03T09:00:00.000Z")
        },
        {
          id: "attempt_follow_up_24h",
          leadId: "lead_local_1",
          cadence: "FOLLOW_UP_24H",
          status: "PENDING",
          dueAt: new Date("2026-04-05T08:00:00.000Z")
        }
      ]
    });
    listEnabledLeadAutomationRules.mockResolvedValueOnce([
      {
        ...baseRule,
        id: "rule_follow_up_24h",
        channel: "YELP_THREAD",
        cadence: "FOLLOW_UP_24H",
        onlyDuringWorkingHours: true,
        timezone: "UTC",
        workingDaysJson: [1, 2, 3, 4, 5],
        startMinute: 9 * 60,
        endMinute: 17 * 60
      }
    ]);
    updateLeadAutomationAttempt.mockResolvedValueOnce({
      id: "attempt_follow_up_24h",
      leadId: "lead_local_1",
      cadence: "FOLLOW_UP_24H",
      status: "PENDING",
      dueAt: new Date("2026-04-06T09:00:00.000Z")
    });

    const { reconcileDueLeadAutomationFollowUps } = await import("@/features/autoresponder/service");
    const result = await reconcileDueLeadAutomationFollowUps(20);

    expect(updateLeadAutomationAttempt).toHaveBeenCalledWith(
      "attempt_follow_up_24h",
      expect.objectContaining({
        status: "PENDING",
        dueAt: new Date("2026-04-06T09:00:00.000Z"),
        startedAt: null,
        completedAt: null
      })
    );
    expect(deliverLeadAutomationMessage).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        attemptId: "attempt_follow_up_24h",
        cadence: "FOLLOW_UP_24H",
        status: "PENDING"
      })
    ]);

    vi.useRealTimers();
  });

  it("saves business-specific override settings", async () => {
    upsertLeadAutomationBusinessOverride.mockResolvedValueOnce({
      id: "override_1",
      businessId: "business_1",
      isEnabled: true,
      defaultChannel: "YELP_THREAD",
      emailFallbackEnabled: false,
      followUp24hEnabled: true,
      followUp24hDelayHours: 24,
      followUp7dEnabled: false,
      followUp7dDelayDays: 7,
      aiAssistEnabled: true,
      aiModel: "gpt-5-mini"
    });

    const { saveLeadAutomationBusinessOverrideWorkflow } = await import("@/features/autoresponder/service");
    const result = await saveLeadAutomationBusinessOverrideWorkflow("tenant_1", "user_1", {
      businessId: "business_1",
      isEnabled: true,
      defaultChannel: "YELP_THREAD",
      emailFallbackEnabled: false,
      followUp24hEnabled: true,
      followUp24hDelayHours: 24,
      followUp7dEnabled: false,
      followUp7dDelayDays: 7,
      aiAssistEnabled: true,
      aiModel: "gpt-5-mini"
    });

    expect(upsertLeadAutomationBusinessOverride).toHaveBeenCalledWith(
      "tenant_1",
      "business_1",
      expect.objectContaining({
        defaultChannel: "YELP_THREAD",
        emailFallbackEnabled: false,
        aiModel: "gpt-5-mini"
      })
    );
    expect(result).toMatchObject({
      businessId: "business_1",
      aiModel: "gpt-5-mini"
    });
  });

  it("stores template business scope and template kind metadata", async () => {
    createLeadAutomationTemplate.mockResolvedValueOnce({
      id: "template_business_1",
      businessId: "business_1",
      name: "Cannot estimate yet",
      channel: "YELP_THREAD",
      isEnabled: true
    });

    const { createLeadAutomationTemplateWorkflow } = await import("@/features/autoresponder/service");
    await createLeadAutomationTemplateWorkflow("tenant_1", "user_1", {
      name: "Cannot estimate yet",
      businessId: "business_1",
      channel: "YELP_THREAD",
      templateKind: "CANNOT_ESTIMATE",
      isEnabled: true,
      bodyTemplate: "We cannot give an exact quote yet."
    });

    expect(createLeadAutomationTemplate).toHaveBeenCalledWith(
      "tenant_1",
      expect.objectContaining({
        businessId: "business_1",
        metadataJson: expect.objectContaining({
          templateKind: "CANNOT_ESTIMATE"
        })
      })
    );
  });

  it("rejects business-scoped rules when the selected template belongs to a different Yelp business", async () => {
    getLeadAutomationTemplateById.mockResolvedValueOnce({
      id: "template_1",
      businessId: "business_2",
      business: {
        name: "Other business"
      }
    });

    const { createLeadAutomationRuleWorkflow } = await import("@/features/autoresponder/service");

    await expect(
      createLeadAutomationRuleWorkflow("tenant_1", "user_1", {
        name: "Business-specific rule",
        templateId: "template_1",
        businessId: "business_1",
        channel: "YELP_THREAD",
        isEnabled: true,
        priority: 100,
        onlyDuringWorkingHours: false,
        workingDays: [1, 2, 3, 4, 5]
      })
    ).rejects.toThrow("Template scope does not match the selected Yelp business.");
  });

  it("builds module state for the dedicated autoresponder page", async () => {
    getSystemSetting.mockResolvedValueOnce({
      ...baseSettings,
      defaultChannel: "YELP_THREAD"
    });
    listLeadAutomationOptions.mockResolvedValueOnce({
      businesses: [
        {
          id: "business_1",
          name: "Northwind HVAC",
          encryptedYelpBusinessId: "ys4FVTHxbSepIkvCLHYxCA",
          locationId: "location_1"
        },
        {
          id: "business_2",
          name: "Southwind Plumbing",
          encryptedYelpBusinessId: "ys4FVTHxbSepIkvCLHYxCB",
          locationId: "location_2"
        }
      ],
      locations: [],
      serviceCategories: []
    });
    listLeadAutomationTemplates.mockResolvedValueOnce([
      {
        id: "template_1",
        name: "Default thread reply",
        businessId: null,
        channel: "YELP_THREAD",
        isEnabled: true,
        subjectTemplate: null,
        bodyTemplate: "Thanks for contacting {{business_name}}.",
        metadataJson: {
          templateKind: "ACKNOWLEDGMENT"
        },
        _count: {
          rules: 1,
          attempts: 4
        }
      }
    ]);
    listLeadAutomationRules.mockResolvedValueOnce([
      {
        id: "rule_1",
        name: "Weekday default",
        templateId: "template_1",
        locationId: null,
        serviceCategoryId: null,
        channel: "YELP_THREAD",
        cadence: "INITIAL",
        isEnabled: true,
        priority: 100,
        onlyDuringWorkingHours: false,
        timezone: null,
        workingDaysJson: [],
        startMinute: null,
        endMinute: null,
        template: { id: "template_1", name: "Default thread reply" },
        location: null,
        serviceCategory: null
      }
    ]);
    getLeadAutomationAttemptSummary.mockResolvedValueOnce({
      sentCount: 4,
      failedCount: 1,
      skippedCount: 2,
      pendingCount: 1,
      pendingDueCount: 0,
      scheduledCount: 1,
      lastSuccessfulAt: new Date("2026-04-07T09:30:00.000Z")
    });
    getLeadAutomationBusinessAttemptHealth.mockResolvedValueOnce({
      sentCounts: [
        {
          businessId: "business_1",
          _count: {
            _all: 4
          }
        }
      ],
      failedCounts: [],
      pendingDueCounts: [],
      lastSuccessfulAttempts: [
        {
          businessId: "business_1",
          completedAt: new Date("2026-04-07T09:30:00.000Z"),
          triggeredAt: new Date("2026-04-07T09:00:00.000Z")
        }
      ]
    });
    listRecentLeadAutomationAttempts.mockResolvedValueOnce([
      {
        id: "attempt_1",
        cadence: "INITIAL",
        status: "SENT",
        skipReason: null,
        channel: "YELP_THREAD",
        recipient: null,
        renderedSubject: null,
        renderedBody:
          "Automated message from Northwind HVAC via Yelp - a team member may follow up with more details.\n\nThanks for contacting Northwind HVAC.",
        providerMessageId: "provider_1",
        providerStatus: "sent",
        providerMetadataJson: {
          deliveryChannel: "YELP_THREAD"
        },
        errorSummary: null,
        triggeredAt: new Date("2026-04-07T09:00:00.000Z"),
        startedAt: new Date("2026-04-07T09:00:01.000Z"),
        completedAt: new Date("2026-04-07T09:00:05.000Z"),
        template: { id: "template_1", name: "Default thread reply" },
        rule: { id: "rule_1", name: "Weekday default", location: null, serviceCategory: null },
        business: { name: "Northwind HVAC" },
        lead: { externalLeadId: "lead_1", customerName: "Jane Doe" },
        location: null,
        serviceCategory: null
      }
    ]);
    listLeadAutomationBusinessOverrides.mockResolvedValueOnce([
      {
        id: "override_1",
        businessId: "business_1",
        isEnabled: true,
        defaultChannel: "YELP_THREAD",
        emailFallbackEnabled: true,
        followUp24hEnabled: true,
        followUp24hDelayHours: 24,
        followUp7dEnabled: true,
        followUp7dDelayDays: 7,
        aiAssistEnabled: true,
        aiModel: "gpt-5-mini",
        updatedAt: new Date("2026-04-07T11:00:00.000Z"),
        business: {
          id: "business_1",
          name: "Northwind HVAC",
          encryptedYelpBusinessId: "ys4FVTHxbSepIkvCLHYxCA"
        }
      }
    ]);
    getAiReplyAssistantState.mockResolvedValueOnce({
      envConfigured: true,
      enabled: true,
      reviewRequired: true,
      model: "gpt-5-nano",
      modelLabel: "gpt-5-nano • Cheapest / test",
      guardrails: ["No prices", "Operator review is required"]
    });
    getAuditLog.mockResolvedValueOnce([
      {
        id: "audit_1",
        createdAt: new Date("2026-04-07T10:00:00.000Z"),
        actionType: "lead.reply.ai-draft.generate",
        status: "SUCCESS",
        business: { name: "Northwind HVAC" },
        actor: { name: "Alex Operator" },
        requestSummaryJson: { channel: "YELP_THREAD" },
        responseSummaryJson: { summary: { warningCodes: ["INSUFFICIENT_CONTEXT"] } }
      }
    ]);
    listOperatorIssues.mockResolvedValueOnce([
      {
        id: "issue_1",
        issueType: "AUTORESPONDER_FAILURE",
        severity: "HIGH",
        summary: "Masked email fallback failed",
        lastDetectedAt: new Date("2026-04-07T10:30:00.000Z"),
        lead: { customerName: "Jane Doe", externalLeadId: "lead_1" },
        business: { id: "business_1", name: "Northwind HVAC" }
      }
    ]);

    const { getLeadAutomationModuleState } = await import("@/features/autoresponder/service");
    const result = await getLeadAutomationModuleState("tenant_1");

    expect(result.moduleSummary).toMatchObject({
      isEnabled: true,
      defaultChannel: "YELP_THREAD",
      enabledTemplateCount: 1,
      enabledRuleCount: 1,
      businessOverrideCount: 1,
      deliveryAccessStatus: "READY",
      sentCount: 4,
      failedCount: 1,
      scheduledCount: 1,
      openIssueCount: 1,
      businessReadyCount: 2,
      businessLiveCount: 0,
      businessNeedsSetupCount: 0,
      businessIssueCount: 1
    });
    expect(result.operatingMode).toMatchObject({
      primaryChannel: "Yelp thread",
      liveTemplateMode: "Thread-safe templates are live."
    });
    expect(result.aiAssist).toMatchObject({
      enabled: true,
      reviewRequired: true,
      modelLabel: "gpt-5-nano • Cheapest / test"
    });
    expect(result.recentActivity.map((item) => item.actionLabel)).toEqual(
      expect.arrayContaining(["Initial response sent", "AI draft generated"])
    );
    expect(result.openIssues).toEqual([
      expect.objectContaining({
        id: "issue_1",
        summary: "Masked email fallback failed",
        targetLabel: "Jane Doe"
      })
    ]);
    expect(result.businessHealth).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          businessId: "business_1",
          healthStatus: "PARTIAL",
          sentCount: 4,
          hasOverride: true
        }),
        expect.objectContaining({
          businessId: "business_2",
          healthStatus: "READY",
          hasOverride: false
        })
      ])
    );
  });
});
