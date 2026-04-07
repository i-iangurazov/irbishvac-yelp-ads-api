import "server-only";

import { Prisma } from "@prisma/client";

import {
  buildLeadAutomationVariables,
  evaluateLeadAutomationEligibility,
  formatWorkingDayLabels,
  formatMinuteOfDay,
  renderLeadAutomationTemplate
} from "@/features/autoresponder/logic";
import { buildLeadAutomationHistory } from "@/features/autoresponder/normalize";
import {
  leadAutomationRuleFormSchema,
  leadAutomationTemplateFormSchema,
  leadAutoresponderSettingsSchema
} from "@/features/autoresponder/schemas";
import { recordAuditEvent } from "@/features/audit/service";
import { isSmtpConfigured } from "@/features/report-delivery/email";
import { deliverLeadAutomationMessage } from "@/features/leads/messaging-service";
import {
  createLeadAutomationAttempt,
  createLeadAutomationRule,
  createLeadAutomationTemplate,
  getLeadAutomationCandidate,
  getLeadAutomationRuleById,
  getLeadAutomationTemplateById,
  listEnabledLeadAutomationRules,
  listLeadAutomationOptions,
  listLeadAutomationRules,
  listLeadAutomationTemplates,
  updateLeadAutomationAttempt,
  updateLeadAutomationRule,
  updateLeadAutomationTemplate
} from "@/lib/db/autoresponder-repository";
import { getSystemSetting, upsertSystemSetting } from "@/lib/db/settings-repository";
import { toJsonValue } from "@/lib/db/json";
import { logError, logInfo } from "@/lib/utils/logging";
import { normalizeUnknownError, YelpValidationError } from "@/lib/yelp/errors";

const LEAD_AUTORESPONDER_SETTING_KEY = "leadAutoresponder";

function readLeadAutoresponderSettings(value: unknown) {
  return leadAutoresponderSettingsSchema.parse(value ?? {});
}

function getFallbackSubject(params: {
  businessName: string | null;
  customerName: string | null;
  leadReference: string;
}) {
  if (params.businessName) {
    return `${params.businessName} received your Yelp request`;
  }

  if (params.customerName) {
    return `We received your request, ${params.customerName}`;
  }

  return `We received your request (${params.leadReference})`;
}

function parseWorkingDaysJson(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is number => Number.isInteger(item) && item >= 0 && item <= 6);
}

async function deliverLeadAutomationAttempt(params: {
  tenantId: string;
  actorId: string | null;
  lead: Awaited<ReturnType<typeof getLeadAutomationCandidate>>;
  attemptId: string;
  actionType: "lead.autoresponder.first-response" | "lead.autoresponder.retry";
  channel: "YELP_THREAD" | "EMAIL";
  renderedSubject: string;
  renderedBody: string;
  recipient: string | null;
}) {
  const result = await deliverLeadAutomationMessage({
    tenantId: params.tenantId,
    actorId: params.actorId ?? null,
    leadId: params.lead.id,
    automationAttemptId: params.attemptId,
    channel: params.channel,
    renderedSubject: params.renderedSubject,
    renderedBody: params.renderedBody,
    recipient: params.recipient
  });

  if (result.status === "SENT" || result.status === "PARTIAL") {
    const completedAt = new Date();
    const saved = await updateLeadAutomationAttempt(params.attemptId, {
      status: "SENT",
      providerStatus: result.status === "PARTIAL" ? "sent_with_warning" : "sent",
      providerMetadataJson: {
        deliveryChannel: result.deliveryChannel,
        ...(result.warning ? { warning: result.warning } : {})
      },
      completedAt
    });

    await recordAuditEvent({
      tenantId: params.tenantId,
      actorId: params.actorId ?? undefined,
      businessId: params.lead.business?.id ?? undefined,
      actionType: params.actionType,
      status: "SUCCESS",
      correlationId: saved.id,
      upstreamReference: params.lead.externalLeadId,
      requestSummary: {
        channel: saved.channel,
        recipient: saved.recipient,
        ruleId: saved.ruleId,
        templateId: saved.templateId
      },
      responseSummary: {
        attemptStatus: saved.status,
        providerStatus: saved.providerStatus,
        deliveryChannel: result.deliveryChannel,
        warning: result.warning
      }
    });

    return saved;
  }

  const normalized = normalizeUnknownError(result.error);
  const completedAt = new Date();
  const failedAttempt = await updateLeadAutomationAttempt(params.attemptId, {
    status: "FAILED",
    providerStatus: "failed",
    errorSummary: normalized.message,
    providerMetadataJson: normalized.details ?? null,
    completedAt
  });

  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId ?? undefined,
    businessId: params.lead.business?.id ?? undefined,
    actionType: params.actionType,
    status: "FAILED",
    correlationId: failedAttempt.id,
    upstreamReference: params.lead.externalLeadId,
    requestSummary: {
      channel: failedAttempt.channel,
      recipient: failedAttempt.recipient,
      ruleId: failedAttempt.ruleId,
      templateId: failedAttempt.templateId
    },
    responseSummary: {
      attemptStatus: failedAttempt.status,
      message: normalized.message
    }
  });

  return failedAttempt;
}

export async function getLeadAutomationAdminState(tenantId: string) {
  const [settingsValue, templates, rules, options] = await Promise.all([
    getSystemSetting(tenantId, LEAD_AUTORESPONDER_SETTING_KEY),
    listLeadAutomationTemplates(tenantId),
    listLeadAutomationRules(tenantId),
    listLeadAutomationOptions(tenantId)
  ]);

  return {
    settings: readLeadAutoresponderSettings(settingsValue),
    smtpConfigured: isSmtpConfigured(),
    templates,
    rules: rules.map((rule) => ({
      ...rule,
      workingDays: parseWorkingDaysJson(rule.workingDaysJson),
      workingHoursLabel: rule.onlyDuringWorkingHours
        ? `${rule.timezone ?? "Timezone missing"} • ${formatWorkingDayLabels(parseWorkingDaysJson(rule.workingDaysJson))} • ${formatMinuteOfDay(rule.startMinute)}-${formatMinuteOfDay(rule.endMinute)}`
        : "Any time"
    })),
    options
  };
}

export async function saveLeadAutoresponderSettings(tenantId: string, actorId: string, input: unknown) {
  const values = leadAutoresponderSettingsSchema.parse(input);
  const existing = await getSystemSetting(tenantId, LEAD_AUTORESPONDER_SETTING_KEY);
  const saved = await upsertSystemSetting(tenantId, LEAD_AUTORESPONDER_SETTING_KEY, values);

  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: "settings.lead-autoresponder.save",
    status: "SUCCESS",
    before: toJsonValue(existing ?? {}),
    after: toJsonValue(values)
  });

  return saved;
}

export async function createLeadAutomationTemplateWorkflow(
  tenantId: string,
  actorId: string,
  input: unknown
) {
  const values = leadAutomationTemplateFormSchema.parse(input);
  const saved = await createLeadAutomationTemplate(tenantId, {
    name: values.name,
    channel: values.channel,
    isEnabled: values.isEnabled,
    subjectTemplate: values.subjectTemplate || null,
    bodyTemplate: values.bodyTemplate,
    sourceSystem: "INTERNAL",
    metadataJson: toJsonValue({
      updatedBy: actorId
    })
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: "settings.lead-automation-template.create",
    status: "SUCCESS",
    after: toJsonValue({
      id: saved.id,
      name: saved.name,
      channel: saved.channel,
      isEnabled: saved.isEnabled
    })
  });

  return saved;
}

export async function updateLeadAutomationTemplateWorkflow(
  tenantId: string,
  actorId: string,
  templateId: string,
  input: unknown
) {
  const values = leadAutomationTemplateFormSchema.parse(input);
  const existing = await getLeadAutomationTemplateById(tenantId, templateId);

  if (!existing) {
    throw new YelpValidationError("Lead automation template not found.");
  }

  const saved = await updateLeadAutomationTemplate(templateId, {
    name: values.name,
    channel: values.channel,
    isEnabled: values.isEnabled,
    subjectTemplate: values.subjectTemplate || null,
    bodyTemplate: values.bodyTemplate,
    metadataJson: toJsonValue({
      updatedBy: actorId
    })
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: "settings.lead-automation-template.update",
    status: "SUCCESS",
    before: toJsonValue(existing),
    after: toJsonValue(saved)
  });

  return saved;
}

export async function createLeadAutomationRuleWorkflow(
  tenantId: string,
  actorId: string,
  input: unknown
) {
  const values = leadAutomationRuleFormSchema.parse(input);
  const template = await getLeadAutomationTemplateById(tenantId, values.templateId);

  if (!template) {
    throw new YelpValidationError("Select a valid automation template before saving the rule.");
  }

  const saved = await createLeadAutomationRule(tenantId, {
    templateId: values.templateId,
    locationId: values.locationId || null,
    serviceCategoryId: values.serviceCategoryId || null,
    name: values.name,
    channel: template.channel,
    isEnabled: values.isEnabled,
    priority: values.priority,
    onlyDuringWorkingHours: values.onlyDuringWorkingHours,
    timezone: values.onlyDuringWorkingHours ? values.timezone || null : null,
    workingDaysJson: toJsonValue(values.onlyDuringWorkingHours ? values.workingDays : []),
    startMinute: values.onlyDuringWorkingHours ? values.startMinute ?? null : null,
    endMinute: values.onlyDuringWorkingHours ? values.endMinute ?? null : null,
    sourceSystem: "INTERNAL",
    metadataJson: toJsonValue({
      updatedBy: actorId
    })
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: "settings.lead-automation-rule.create",
    status: "SUCCESS",
    after: toJsonValue(saved)
  });

  return saved;
}

export async function updateLeadAutomationRuleWorkflow(
  tenantId: string,
  actorId: string,
  ruleId: string,
  input: unknown
) {
  const values = leadAutomationRuleFormSchema.parse(input);
  const [existing, template] = await Promise.all([
    getLeadAutomationRuleById(tenantId, ruleId),
    getLeadAutomationTemplateById(tenantId, values.templateId)
  ]);

  if (!existing) {
    throw new YelpValidationError("Lead automation rule not found.");
  }

  if (!template) {
    throw new YelpValidationError("Select a valid automation template before saving the rule.");
  }

  const saved = await updateLeadAutomationRule(ruleId, {
    templateId: values.templateId,
    locationId: values.locationId || null,
    serviceCategoryId: values.serviceCategoryId || null,
    name: values.name,
    channel: template.channel,
    isEnabled: values.isEnabled,
    priority: values.priority,
    onlyDuringWorkingHours: values.onlyDuringWorkingHours,
    timezone: values.onlyDuringWorkingHours ? values.timezone || null : null,
    workingDaysJson: toJsonValue(values.onlyDuringWorkingHours ? values.workingDays : []),
    startMinute: values.onlyDuringWorkingHours ? values.startMinute ?? null : null,
    endMinute: values.onlyDuringWorkingHours ? values.endMinute ?? null : null,
    metadataJson: toJsonValue({
      updatedBy: actorId
    })
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: "settings.lead-automation-rule.update",
    status: "SUCCESS",
    before: toJsonValue(existing),
    after: toJsonValue(saved)
  });

  return saved;
}

export async function processLeadAutoresponderForNewLead(tenantId: string, leadId: string) {
  const [settingsValue, lead, rules] = await Promise.all([
    getSystemSetting(tenantId, LEAD_AUTORESPONDER_SETTING_KEY),
    getLeadAutomationCandidate(tenantId, leadId),
    listEnabledLeadAutomationRules(tenantId)
  ]);
  const settings = readLeadAutoresponderSettings(settingsValue);
  const smtpConfigured = isSmtpConfigured();
  const eligibility = evaluateLeadAutomationEligibility({
    settings,
    smtpConfigured,
    lead,
    rules
  });

  if (!eligibility.eligible && eligibility.skipReason === "DUPLICATE") {
    logInfo("lead.autoresponder.duplicate", {
      tenantId,
      leadId
    });

    return {
      status: "DUPLICATE" as const
    };
  }

  if (!eligibility.eligible) {
    const attempt = await createLeadAutomationAttempt({
      tenantId,
      leadId: lead.id,
      businessId: lead.businessId ?? lead.business?.id ?? null,
      locationId: lead.locationId ?? lead.location?.id ?? lead.business?.location?.id ?? null,
      serviceCategoryId: lead.serviceCategoryId ?? lead.serviceCategory?.id ?? null,
      ruleId: eligibility.rule?.id ?? null,
      templateId: eligibility.rule?.template.id ?? null,
      channel: eligibility.rule?.channel ?? settings.defaultChannel,
      status: "SKIPPED",
      skipReason: eligibility.skipReason,
      sourceSystem: "INTERNAL",
      recipient: lead.customerEmail ?? null,
      errorSummary: eligibility.message,
      completedAt: new Date()
    });

    await recordAuditEvent({
      tenantId,
      businessId: lead.business?.id ?? undefined,
      actionType: "lead.autoresponder.first-response",
      status: "SUCCESS",
      correlationId: attempt.id,
      upstreamReference: lead.externalLeadId,
      requestSummary: {
        channel: attempt.channel,
        ruleId: attempt.ruleId,
        templateId: attempt.templateId
      },
      responseSummary: {
        attemptStatus: attempt.status,
        skipReason: attempt.skipReason,
        message: eligibility.message
      }
    });

    logInfo("lead.autoresponder.skipped", {
      tenantId,
      leadId,
      skipReason: eligibility.skipReason
    });

    return attempt;
  }

  const variables = buildLeadAutomationVariables(lead);
  const renderedSubject =
    renderLeadAutomationTemplate(eligibility.rule.template.subjectTemplate, variables) ||
    getFallbackSubject({
      businessName: lead.business?.name ?? null,
      customerName: lead.customerName ?? null,
      leadReference: lead.externalLeadId
    });
  const renderedBody = renderLeadAutomationTemplate(eligibility.rule.template.bodyTemplate, variables);

  let attempt;

  try {
    attempt = await createLeadAutomationAttempt({
      tenantId,
      leadId: lead.id,
      businessId: lead.business?.id ?? null,
      locationId: lead.location?.id ?? lead.business?.location?.id ?? null,
      serviceCategoryId: lead.serviceCategory?.id ?? null,
      ruleId: eligibility.rule.id,
      templateId: eligibility.rule.template.id,
      channel: eligibility.rule.channel,
      status: "PENDING",
      sourceSystem: "INTERNAL",
      recipient: eligibility.recipient,
      renderedSubject,
      renderedBody,
      startedAt: new Date()
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      logInfo("lead.autoresponder.duplicate", {
        tenantId,
        leadId
      });

      return {
        status: "DUPLICATE" as const
      };
    }

    throw error;
  }

  const result = await deliverLeadAutomationAttempt({
    tenantId,
    actorId: null,
    lead,
    attemptId: attempt.id,
    actionType: "lead.autoresponder.first-response",
    channel: eligibility.rule.channel,
    renderedSubject,
    renderedBody,
    recipient: eligibility.recipient
  });

  if (result.status === "SENT") {
    logInfo("lead.autoresponder.sent", {
      tenantId,
      leadId,
      attemptId: result.id,
      recipient: eligibility.recipient
    });
  } else {
    logError("lead.autoresponder.failed", {
      tenantId,
      leadId,
      attemptId: result.id,
      message: result.errorSummary
    });
  }

  return result;
}

export async function getLeadAutomationHistoryForLead(tenantId: string, leadId: string) {
  const lead = await getLeadAutomationCandidate(tenantId, leadId);
  return buildLeadAutomationHistory(lead.automationAttempts);
}

export async function retryLeadAutomationAttemptWorkflow(tenantId: string, actorId: string, leadId: string) {
  const lead = await getLeadAutomationCandidate(tenantId, leadId);
  const attempt = lead.automationAttempts[0] ?? null;

  if (!attempt) {
    throw new YelpValidationError("No first-response attempt exists for this lead.");
  }

  if (attempt.status === "SENT") {
    throw new YelpValidationError("The first response already sent successfully.");
  }

  if (!attempt.recipient && attempt.channel === "EMAIL") {
    throw new YelpValidationError("This attempt does not have a recipient to retry.");
  }

  const variables = buildLeadAutomationVariables(lead);
  const renderedSubject =
    attempt.renderedSubject ||
    renderLeadAutomationTemplate(attempt.template?.subjectTemplate ?? null, variables) ||
    getFallbackSubject({
      businessName: lead.business?.name ?? null,
      customerName: lead.customerName ?? null,
      leadReference: lead.externalLeadId
    });
  const renderedBody =
    attempt.renderedBody ||
    renderLeadAutomationTemplate(attempt.template?.bodyTemplate ?? "", variables);

  if (!renderedBody.trim()) {
    throw new YelpValidationError("This attempt does not have a rendered message body to retry.");
  }

  await updateLeadAutomationAttempt(attempt.id, {
    status: "PENDING",
    startedAt: new Date(),
    completedAt: null,
    errorSummary: null,
    providerMessageId: null,
    providerStatus: null,
    providerMetadataJson: null,
    renderedSubject,
    renderedBody
  });

  const result = await deliverLeadAutomationAttempt({
    tenantId,
    actorId,
    lead,
    attemptId: attempt.id,
    actionType: "lead.autoresponder.retry",
    channel: attempt.channel ?? "EMAIL",
    renderedSubject,
    renderedBody,
    recipient: attempt.recipient
  });

  if (result.status === "SENT") {
    logInfo("lead.autoresponder.retry_sent", {
      tenantId,
      leadId,
      attemptId: result.id,
      recipient: attempt.recipient
    });
  } else {
    logError("lead.autoresponder.retry_failed", {
      tenantId,
      leadId,
      attemptId: result.id,
      message: result.errorSummary
    });
  }

  return result;
}
