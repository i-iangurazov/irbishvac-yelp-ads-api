import "server-only";

import { Prisma } from "@prisma/client";

import { approvedLeadAiModelOptions, LEAD_AUTORESPONDER_SETTING_KEY } from "@/features/autoresponder/constants";
import { generateLeadAutomationAiMessage } from "@/features/autoresponder/ai-service";
import {
  getLeadConversationRolloutState,
  humanizeLeadConversationDecision,
  humanizeLeadConversationIntent,
  humanizeLeadConversationMode,
  humanizeLeadConversationStopReason
} from "@/features/autoresponder/conversation";
import { buildConversationAnalytics, buildConversationReviewQueue } from "@/features/autoresponder/conversation-operations";
import { formatConversationIntentLabels } from "@/features/autoresponder/conversation-service";
import {
  getLeadAiModelLabel,
  getLeadAutomationScopeConfig,
  resolveLeadAiModel,
  readLeadAutoresponderSettings
} from "@/features/autoresponder/config";
import {
  applyLeadAutomationDisclosure,
  buildLeadAutomationVariables,
  evaluateLeadAutomationEligibility,
  evaluateLeadAutomationFollowUpEligibility,
  formatWorkingDayLabels,
  formatMinuteOfDay,
  getLeadAutomationCadenceDelayMs,
  getNextWorkingWindowStart,
  humanizeLeadAutomationCadence,
  type LeadAutomationRuleCandidate,
  renderLeadAutomationTemplate
} from "@/features/autoresponder/logic";
import { buildLeadAutomationHistory } from "@/features/autoresponder/normalize";
import { readLeadAutomationTemplateMetadata } from "@/features/autoresponder/template-metadata";
import {
  leadConversationAllowedIntentsSchema,
  leadAutomationRuleFormSchema,
  leadAutomationTemplateFormSchema,
  leadAutoresponderBusinessOverrideSchema,
  leadAutoresponderSettingsSchema,
  type LeadAutomationTemplateFormValues
} from "@/features/autoresponder/schemas";
import { recordAuditEvent, getAuditLog } from "@/features/audit/service";
import { recordAutoresponderMetric } from "@/features/operations/observability-service";
import { isSmtpConfigured } from "@/features/report-delivery/email";
import { getAiReplyAssistantState } from "@/features/leads/ai-reply-service";
import { deliverLeadAutomationMessage } from "@/features/leads/messaging-service";
import {
  createLeadAutomationAttempt,
  countLeadConversationOperatorTakeovers,
  claimLeadAutomationAttemptForProcessing,
  deleteLeadAutomationRule,
  deleteLeadAutomationTemplate,
  deleteLeadAutomationBusinessOverride,
  createLeadAutomationRule,
  getLeadAutomationBusinessAttemptHealth,
  getLeadAutomationBusinessConnectionHealth,
  createLeadAutomationTemplate,
  getLeadAutomationBusinessOverrideByBusinessId,
  getLeadAutomationCandidate,
  getLeadAutomationAttemptSummary,
  getLeadAutomationRuleById,
  getLeadAutomationTemplateById,
  listDueLeadAutomationAttempts,
  listLeadConversationAutomationTurnMetrics,
  listLeadConversationReviewTurns,
  listEnabledLeadAutomationRules,
  listLeadAutomationBusinessOverrides,
  listLeadAutomationOptions,
  listRecentLeadAutomationAttempts,
  listLeadAutomationRules,
  listLeadAutomationTemplates,
  upsertLeadAutomationAttemptByLeadCadence,
  upsertLeadAutomationBusinessOverride,
  updateLeadAutomationAttempt,
  updateLeadAutomationRule,
  updateLeadAutomationTemplate
} from "@/lib/db/autoresponder-repository";
import { listOperatorIssues } from "@/lib/db/issues-repository";
import { getSystemSetting, upsertSystemSetting } from "@/lib/db/settings-repository";
import { toJsonValue } from "@/lib/db/json";
import { logError, logInfo } from "@/lib/utils/logging";
import { normalizeUnknownError, YelpValidationError } from "@/lib/yelp/errors";
import { ensureYelpLeadsAccess } from "@/lib/yelp/runtime";

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

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getStringValue(value: unknown, key: string) {
  const record = asRecord(value);
  const candidate = record?.[key];
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : null;
}

function humanizeAiActivityAction(actionType: string) {
  switch (actionType) {
    case "lead.reply.ai-draft.generate":
      return "AI draft generated";
    case "lead.reply.ai-draft.discard":
      return "AI draft discarded";
    case "lead.reply.ai-draft.send":
      return "AI-assisted reply sent";
    default:
      return actionType;
  }
}

function normalizeAutomationDeliveryChannel(channel: string | null | undefined): "YELP_THREAD" | "EMAIL" {
  return channel === "EMAIL" ? "EMAIL" : "YELP_THREAD";
}

function matchesBusinessInitialRule(params: {
  business: {
    id: string;
    locationId?: string | null;
  };
  rule: {
    cadence: "INITIAL" | "FOLLOW_UP_24H" | "FOLLOW_UP_7D";
    isEnabled: boolean;
    businessId?: string | null;
    locationId?: string | null;
    serviceCategoryId?: string | null;
    template?: {
      isEnabled?: boolean;
    } | null;
  };
}) {
  if (!params.rule.isEnabled || params.rule.cadence !== "INITIAL") {
    return false;
  }

  if (params.rule.template && params.rule.template.isEnabled === false) {
    return false;
  }

  if (params.rule.businessId && params.rule.businessId !== params.business.id) {
    return false;
  }

  if (params.rule.locationId && params.rule.locationId !== (params.business.locationId ?? null)) {
    return false;
  }

  return true;
}

function getLatestSyncTime(run: {
  startedAt?: Date | null;
  finishedAt?: Date | null;
  lastSuccessfulSyncAt?: Date | null;
}) {
  return run.lastSuccessfulSyncAt ?? run.finishedAt ?? run.startedAt ?? null;
}

function getLatestRunTime(run: {
  startedAt?: Date | null;
  finishedAt?: Date | null;
}) {
  return run.finishedAt ?? run.startedAt ?? null;
}

function isAfter(left: Date | null, right: Date | null) {
  return Boolean(left && (!right || left.getTime() > right.getTime()));
}

const staleSyncBacklogMs = 15 * 60 * 1000;

function buildBusinessYelpConnectionHealth(params: {
  hasYelpBusinessId: boolean;
  yelpThreadAccess: {
    status: "READY" | "FAILED";
    label: string;
  };
  leadCount: number;
  pendingSyncCount: number;
  pendingSyncOldestAt: Date | null;
  lastLeadActivityAt: Date | null;
  lastWebhookReceivedAt: Date | null;
  lastWebhookStatus: string | null;
  lastWebhookErrorSummary: string | null;
  lastSuccessfulSyncAt: Date | null;
  lastSuccessfulSyncStatus: string | null;
  lastFailedSyncAt: Date | null;
  lastFailedSyncStatus: string | null;
  lastFailedSyncErrorSummary: string | null;
}) {
  if (!params.hasYelpBusinessId) {
    return {
      status: "UNRESOLVED",
      label: "Missing Yelp ID",
      detail: "Save the Yelp business ID before intake, reconcile, or thread delivery can be trusted."
    };
  }

  if (params.yelpThreadAccess.status !== "READY") {
    return {
      status: "FAILED",
      label: "Token blocked",
      detail: params.yelpThreadAccess.label
    };
  }

  if (params.pendingSyncCount > 0) {
    const hasStaleBacklog =
      params.pendingSyncOldestAt !== null &&
      params.pendingSyncOldestAt.getTime() <= Date.now() - staleSyncBacklogMs;

    if (hasStaleBacklog) {
      return {
        status: "PARTIAL",
        label: "Sync backlog",
        detail: `${params.pendingSyncCount} Yelp intake job${params.pendingSyncCount === 1 ? "" : "s"} queued for more than 15 minutes. Reconcile is behind or blocked.`
      };
    }

    return {
      status: "PROCESSING",
      label: "Sync running",
      detail: `${params.pendingSyncCount} Yelp intake job${params.pendingSyncCount === 1 ? "" : "s"} queued or processing.`
    };
  }

  if (isAfter(params.lastFailedSyncAt, params.lastSuccessfulSyncAt)) {
    return {
      status: params.lastSuccessfulSyncAt ? "PARTIAL" : "FAILED",
      label: params.lastSuccessfulSyncAt ? "Recent failure" : "Sync failed",
      detail: params.lastFailedSyncErrorSummary ?? "The latest Yelp intake run failed. Review the issue queue or sync run."
    };
  }

  if (params.lastWebhookReceivedAt) {
    return {
      status: "ACTIVE",
      label: "Webhook live",
      detail:
        params.lastWebhookStatus === "FAILED" || params.lastWebhookStatus === "PARTIAL"
          ? params.lastWebhookErrorSummary ?? "Webhook traffic was received, but the last event needs review."
          : "Recent Yelp webhook traffic has reached the platform."
    };
  }

  if (params.lastSuccessfulSyncAt) {
    return {
      status: "READY",
      label: "Sync verified",
      detail: `Last Yelp intake run finished with ${params.lastSuccessfulSyncStatus?.toLowerCase() ?? "success"} status.`
    };
  }

  if (params.leadCount > 0 || params.lastLeadActivityAt) {
    return {
      status: "READY",
      label: "Leads present",
      detail: "Yelp leads exist locally, but no recent webhook proof is recorded yet."
    };
  }

  return {
    status: "UNKNOWN",
    label: "No traffic yet",
    detail: "Configured business with no recorded Yelp lead traffic yet."
  };
}

function getLeadAutomationAuditActionType(
  cadence: "INITIAL" | "FOLLOW_UP_24H" | "FOLLOW_UP_7D",
  isRetry = false
) {
  if (isRetry) {
    return "lead.autoresponder.retry";
  }

  switch (cadence) {
    case "FOLLOW_UP_24H":
      return "lead.autoresponder.follow-up-24h";
    case "FOLLOW_UP_7D":
      return "lead.autoresponder.follow-up-7d";
    case "INITIAL":
    default:
      return "lead.autoresponder.first-response";
  }
}

function getLeadAutomationActivityLabel(
  cadence: "INITIAL" | "FOLLOW_UP_24H" | "FOLLOW_UP_7D",
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED"
) {
  const cadenceLabel = humanizeLeadAutomationCadence(cadence);

  if (status === "SENT") {
    return `${cadenceLabel} sent`;
  }

  if (status === "FAILED") {
    return `${cadenceLabel} failed`;
  }

  if (status === "SKIPPED") {
    return `${cadenceLabel} skipped`;
  }

  return `${cadenceLabel} pending`;
}

async function ensureLeadAutomationFollowUpAttempts(params: {
  tenantId: string;
  lead: Awaited<ReturnType<typeof getLeadAutomationCandidate>>;
  settings: {
    followUp24hEnabled: boolean;
    followUp24hDelayHours: number;
    followUp7dEnabled: boolean;
    followUp7dDelayDays: number;
  };
  initialAttemptCompletedAt: Date;
}) {
  const scheduled = [];
  const baseContext = {
    tenantId: params.tenantId,
    leadId: params.lead.id,
    businessId: params.lead.business?.id ?? null,
    locationId: params.lead.location?.id ?? params.lead.business?.location?.id ?? null,
    serviceCategoryId: params.lead.serviceCategory?.id ?? null,
    sourceSystem: "INTERNAL" as const
  };

  if (params.settings.followUp24hEnabled) {
    const dueAt = new Date(
      params.initialAttemptCompletedAt.getTime() +
        getLeadAutomationCadenceDelayMs(params.settings, "FOLLOW_UP_24H")
    );
    const attempt = await upsertLeadAutomationAttemptByLeadCadence({
      ...baseContext,
      cadence: "FOLLOW_UP_24H",
      dueAt
    });
    scheduled.push(attempt);
  }

  if (params.settings.followUp7dEnabled) {
    const dueAt = new Date(
      params.initialAttemptCompletedAt.getTime() +
        getLeadAutomationCadenceDelayMs(params.settings, "FOLLOW_UP_7D")
    );
    const attempt = await upsertLeadAutomationAttemptByLeadCadence({
      ...baseContext,
      cadence: "FOLLOW_UP_7D",
      dueAt
    });
    scheduled.push(attempt);
  }

  return scheduled;
}

function asTemplateMetadata(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function buildTemplateMetadata(
  currentValue: unknown,
  values: Pick<LeadAutomationTemplateFormValues, "templateKind" | "renderMode" | "aiPrompt">,
  actorId: string
) {
  return toJsonValue({
    ...asTemplateMetadata(currentValue),
    templateKind: values.templateKind,
    renderMode: values.renderMode,
    aiPrompt: values.aiPrompt || null,
    updatedBy: actorId
  });
}

function validateTemplateBusinessScope(params: {
  template:
    | {
        businessId?: string | null;
        business?: {
          name: string;
        } | null;
      }
    | null;
  ruleBusinessId?: string | null;
}) {
  if (!params.template?.businessId) {
    return;
  }

  if (!params.ruleBusinessId) {
    throw new YelpValidationError(
      `Template ${params.template.business?.name ? `for ${params.template.business.name}` : "scope"} can only be used by a business-specific rule.`
    );
  }

  if (params.template.businessId !== params.ruleBusinessId) {
    throw new YelpValidationError("Template scope does not match the selected Yelp business.");
  }
}

function validateRuleCadenceScope(params: {
  cadence: "INITIAL" | "FOLLOW_UP_24H" | "FOLLOW_UP_7D";
  template: {
    channel: "YELP_THREAD" | "EMAIL";
  };
}) {
  if (params.cadence === "INITIAL") {
    return;
  }

  if (params.template.channel !== "YELP_THREAD") {
    throw new YelpValidationError(
      `${humanizeLeadAutomationCadence(params.cadence)} must stay in the Yelp thread. Masked-email fallback is not available for automated follow-up.`
    );
  }
}

async function renderLeadAutomationMessage(params: {
  tenantId: string;
  lead: Awaited<ReturnType<typeof getLeadAutomationCandidate>>;
  rule: LeadAutomationRuleCandidate;
  settings: {
    aiAssistEnabled: boolean;
    aiModel: string;
  };
  channel: "YELP_THREAD" | "EMAIL";
  fallbackSubject: string;
  fallbackBody: string;
}) {
  const metadata = readLeadAutomationTemplateMetadata(params.rule.template.metadataJson);

  if (metadata.renderMode !== "AI_ASSISTED" || !params.settings.aiAssistEnabled || !metadata.aiPrompt) {
    return {
      subject: params.fallbackSubject,
      body: params.fallbackBody,
      contentMetadata: {
        contentSource: "TEMPLATE",
        templateRenderMode: metadata.renderMode,
        templateKind: metadata.templateKind
      }
    };
  }

  const aiResult = await generateLeadAutomationAiMessage({
    tenantId: params.tenantId,
    lead: params.lead,
    rule: params.rule,
    model: resolveLeadAiModel(params.settings.aiModel),
    channel: params.channel,
    guidance: metadata.aiPrompt,
    fallbackSubject: params.fallbackSubject,
    fallbackBody: params.fallbackBody,
    variables: buildLeadAutomationVariables(params.lead),
    cadenceLabel: humanizeLeadAutomationCadence(params.rule.cadence)
  });

  return {
    subject: aiResult.subject,
    body: aiResult.body,
    contentMetadata: {
      contentSource: aiResult.usedAi ? "AI" : "TEMPLATE_FALLBACK",
      templateRenderMode: metadata.renderMode,
      templateKind: metadata.templateKind,
      aiModel: aiResult.model,
      ...(aiResult.fallbackReason ? { fallbackReason: aiResult.fallbackReason } : {}),
      ...(aiResult.warningCodes.length > 0 ? { warningCodes: aiResult.warningCodes } : {})
    }
  };
}

async function deliverLeadAutomationAttempt(params: {
  tenantId: string;
  actorId: string | null;
  lead: Awaited<ReturnType<typeof getLeadAutomationCandidate>>;
  attemptId: string;
  actionType: string;
  channel: "YELP_THREAD" | "EMAIL";
  renderedSubject: string;
  renderedBody: string;
  recipient: string | null;
  allowEmailFallback?: boolean;
  contentMetadata?: Record<string, unknown> | null;
}) {
  const result = await deliverLeadAutomationMessage({
    tenantId: params.tenantId,
    actorId: params.actorId ?? null,
    leadId: params.lead.id,
    automationAttemptId: params.attemptId,
    channel: params.channel,
    renderedSubject: params.renderedSubject,
    renderedBody: params.renderedBody,
    recipient: params.recipient,
    allowEmailFallback: params.allowEmailFallback,
    idempotencyKey: `automation-attempt:${params.attemptId}`
  });

  if (result.status === "SENT" || result.status === "PARTIAL") {
    const completedAt = new Date();
    const saved = await updateLeadAutomationAttempt(params.attemptId, {
      status: "SENT",
      providerStatus: result.status === "PARTIAL" ? "sent_with_warning" : "sent",
      providerMetadataJson: toJsonValue({
        ...(params.contentMetadata ?? {}),
        deliveryChannel: result.deliveryChannel,
        ...(result.warning ? { warning: result.warning } : {})
      }),
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
    providerMetadataJson: toJsonValue({
      ...(params.contentMetadata ?? {}),
      ...(normalized.details ? { errorDetails: normalized.details } : {})
    }),
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
  const [settingsValue, templates, rules, options, businessOverrides] = await Promise.all([
    getSystemSetting(tenantId, LEAD_AUTORESPONDER_SETTING_KEY),
    listLeadAutomationTemplates(tenantId),
    listLeadAutomationRules(tenantId),
    listLeadAutomationOptions(tenantId),
    listLeadAutomationBusinessOverrides(tenantId)
  ]);

  return {
    settings: readLeadAutoresponderSettings(settingsValue),
    smtpConfigured: isSmtpConfigured(),
    businessOverrides,
    templates,
    rules: rules.map((rule) => ({
      ...rule,
      workingDays: parseWorkingDaysJson(rule.workingDaysJson),
      cadenceLabel: humanizeLeadAutomationCadence(rule.cadence),
      workingHoursLabel: rule.onlyDuringWorkingHours
        ? `${rule.timezone ?? "Timezone missing"} • ${formatWorkingDayLabels(parseWorkingDaysJson(rule.workingDaysJson))} • ${formatMinuteOfDay(rule.startMinute)}-${formatMinuteOfDay(rule.endMinute)}`
        : "Any time"
    })),
    options
  };
}

export async function getLeadAutomationModuleState(tenantId: string) {
  const conversationWindowDays = 30;
  const conversationSince = new Date(Date.now() - conversationWindowDays * 24 * 60 * 60 * 1000);
  const [
    adminState,
    attemptSummary,
    businessAttemptHealth,
    businessConnectionHealth,
    recentAttempts,
    aiAssist,
    aiAuditEvents,
    openIssues,
    yelpThreadAccess,
    conversationTurnMetrics,
    operatorTakeoverCount,
    conversationReviewTurns
  ] = await Promise.all([
    getLeadAutomationAdminState(tenantId),
    getLeadAutomationAttemptSummary(tenantId),
    getLeadAutomationBusinessAttemptHealth(tenantId),
    getLeadAutomationBusinessConnectionHealth(tenantId),
    listRecentLeadAutomationAttempts(tenantId, 8),
    getAiReplyAssistantState(tenantId),
    getAuditLog(tenantId, {
      actionTypePrefix: "lead.reply.ai-draft",
      take: 8
    }),
    listOperatorIssues(tenantId, {
      issueType: "AUTORESPONDER_FAILURE",
      status: "OPEN"
    }),
    ensureYelpLeadsAccess(tenantId)
      .then(({ credential }) => ({
        status: "READY" as const,
        label: credential.label
      }))
      .catch((error) => ({
        status: "FAILED" as const,
        label: normalizeUnknownError(error).message
      })),
    listLeadConversationAutomationTurnMetrics(tenantId, conversationSince),
    countLeadConversationOperatorTakeovers(tenantId, conversationSince),
    listLeadConversationReviewTurns(tenantId, {
      since: conversationSince,
      take: 40
    })
  ]);
  const enabledTemplates = adminState.templates.filter((template) => template.isEnabled);
  const enabledRules = adminState.rules.filter((rule) => rule.isEnabled);
  const tenantConversationRollout = getLeadConversationRolloutState({
    enabled: adminState.settings.conversationAutomationEnabled && adminState.settings.isEnabled,
    paused: adminState.settings.conversationGlobalPauseEnabled,
    mode: adminState.settings.conversationMode
  });
  const overrideByBusinessId = new Map(
    adminState.businessOverrides.map((override) => [override.businessId, override])
  );
  const sentCountByBusiness = new Map(
    businessAttemptHealth.sentCounts
      .filter((entry) => entry.businessId)
      .map((entry) => [entry.businessId as string, entry._count._all])
  );
  const failedCountByBusiness = new Map(
    businessAttemptHealth.failedCounts
      .filter((entry) => entry.businessId)
      .map((entry) => [entry.businessId as string, entry._count._all])
  );
  const pendingDueCountByBusiness = new Map(
    businessAttemptHealth.pendingDueCounts
      .filter((entry) => entry.businessId)
      .map((entry) => [entry.businessId as string, entry._count._all])
  );
  const lastSuccessfulAtByBusiness = new Map(
    businessAttemptHealth.lastSuccessfulAttempts
      .filter((attempt) => attempt.businessId)
      .map((attempt) => [attempt.businessId as string, attempt.completedAt ?? attempt.triggeredAt ?? null])
  );
  const leadCountByBusiness = new Map(
    businessConnectionHealth.leadCounts
      .filter((entry) => entry.businessId)
      .map((entry) => [entry.businessId as string, entry._count._all])
  );
  const latestLeadActivityByBusiness = new Map(
    businessConnectionHealth.latestLeadActivity
      .filter((lead) => lead.businessId)
      .map((lead) => [
        lead.businessId as string,
        {
          externalLeadId: lead.externalLeadId,
          lastActivityAt: lead.latestInteractionAt ?? lead.createdAtYelp ?? lead.lastSyncedAt ?? null,
          lastSyncedAt: lead.lastSyncedAt
        }
      ])
  );
  const latestWebhookByBusiness = new Map(
    businessConnectionHealth.latestWebhookActivity
      .filter((lead) => lead.businessId)
      .map((lead) => [
        lead.businessId as string,
        {
          externalLeadId: lead.externalLeadId,
          receivedAt: lead.latestWebhookReceivedAt,
          status: lead.latestWebhookStatus,
          errorSummary: lead.latestWebhookErrorSummary
        }
      ])
  );
  const latestSuccessfulSyncByBusiness = new Map(
    businessConnectionHealth.latestSuccessfulSyncRuns
      .filter((run) => run.businessId)
      .map((run) => [
        run.businessId as string,
        {
          type: run.type,
          status: run.status,
          syncedAt: getLatestSyncTime(run),
          errorSummary: run.errorSummary
        }
      ])
  );
  const latestFailedSyncByBusiness = new Map(
    businessConnectionHealth.latestFailedSyncRuns
      .filter((run) => run.businessId)
      .map((run) => [
        run.businessId as string,
        {
          type: run.type,
          status: run.status,
          failedAt: getLatestRunTime(run),
          errorSummary: run.errorSummary
        }
      ])
  );
  const pendingSyncCountByBusiness = new Map(
    businessConnectionHealth.pendingSyncCounts
      .filter((entry) => entry.businessId)
      .map((entry) => [entry.businessId as string, entry._count._all])
  );
  const pendingSyncOldestByBusiness = new Map(
    businessConnectionHealth.pendingSyncCounts
      .filter((entry) => entry.businessId)
      .map((entry) => [entry.businessId as string, entry._min.startedAt ?? entry._min.updatedAt ?? null])
  );
  const issueCountByBusiness = new Map<string, number>();
  const openIssuesByLeadId = new Map<
    string,
    {
      id: string;
      summary: string;
      severity: string;
      lastDetectedAt: Date;
    }
  >();

  for (const issue of openIssues) {
    const businessId = issue.business?.id;

    if (businessId) {
      issueCountByBusiness.set(businessId, (issueCountByBusiness.get(businessId) ?? 0) + 1);
    }

    if (issue.lead?.id && !openIssuesByLeadId.has(issue.lead.id)) {
      openIssuesByLeadId.set(issue.lead.id, {
        id: issue.id,
        summary: issue.summary,
        severity: issue.severity,
        lastDetectedAt: issue.lastDetectedAt
      });
    }
  }

  const conversationMetrics = buildConversationAnalytics({
    turns: conversationTurnMetrics,
    operatorTakeoverCount,
    windowDays: conversationWindowDays
  });
  const rawConversationReviewQueue = buildConversationReviewQueue({
    turns: conversationReviewTurns,
    openIssuesByLeadId
  });
  const conversationReviewQueue = {
    ...rawConversationReviewQueue,
    items: rawConversationReviewQueue.items.slice(0, 8).map((item) => ({
      ...item,
      decisionLabel: humanizeLeadConversationDecision(item.decision),
      intentLabel: humanizeLeadConversationIntent(item.intent),
      stopReasonLabel: item.stopReason ? humanizeLeadConversationStopReason(item.stopReason) : null
    }))
  };

  const businessHealth = adminState.options.businesses.map((business) => {
    const override = overrideByBusinessId.get(business.id) ?? null;
    const defaultsApply =
      adminState.settings.scopeMode === "ALL_BUSINESSES" || adminState.settings.scopedBusinessIds.includes(business.id);
    const isEnabled = override ? override.isEnabled : adminState.settings.isEnabled && defaultsApply;
    const conversationEnabled = override
      ? override.isEnabled && override.conversationAutomationEnabled
      : adminState.settings.conversationAutomationEnabled && adminState.settings.isEnabled && defaultsApply;
    const conversationMode = override ? override.conversationMode : adminState.settings.conversationMode;
    const conversationRollout = getLeadConversationRolloutState({
      enabled: conversationEnabled,
      paused: adminState.settings.conversationGlobalPauseEnabled,
      mode: conversationMode
    });
    const effectiveChannel = override
      ? normalizeAutomationDeliveryChannel(override.defaultChannel)
      : normalizeAutomationDeliveryChannel(adminState.settings.defaultChannel);
    const matchingInitialRules = enabledRules.filter((rule) =>
      matchesBusinessInitialRule({
        business,
        rule
      })
    );
    const globalInitialRuleCount = matchingInitialRules.filter((rule) => !rule.serviceCategoryId).length;
    const conditionalInitialRuleCount = matchingInitialRules.filter((rule) => Boolean(rule.serviceCategoryId)).length;
    const sentCount = sentCountByBusiness.get(business.id) ?? 0;
    const failedCount = failedCountByBusiness.get(business.id) ?? 0;
    const pendingDueCount = pendingDueCountByBusiness.get(business.id) ?? 0;
    const openIssueCount = issueCountByBusiness.get(business.id) ?? 0;
    const lastSuccessfulAt = lastSuccessfulAtByBusiness.get(business.id) ?? null;
    const leadCount = leadCountByBusiness.get(business.id) ?? 0;
    const latestLeadActivity = latestLeadActivityByBusiness.get(business.id) ?? null;
    const latestWebhook = latestWebhookByBusiness.get(business.id) ?? null;
    const latestSuccessfulSync = latestSuccessfulSyncByBusiness.get(business.id) ?? null;
    const latestFailedSync = latestFailedSyncByBusiness.get(business.id) ?? null;
    const pendingSyncCount = pendingSyncCountByBusiness.get(business.id) ?? 0;
    const pendingSyncOldestAt = pendingSyncOldestByBusiness.get(business.id) ?? null;
    const hasStaleSyncBacklog =
      pendingSyncCount > 0 &&
      pendingSyncOldestAt !== null &&
      pendingSyncOldestAt.getTime() <= Date.now() - staleSyncBacklogMs;
    const followUp24hEnabled = override
      ? override.followUp24hEnabled
      : adminState.settings.followUp24hEnabled && isEnabled;
    const followUp7dEnabled = override
      ? override.followUp7dEnabled
      : adminState.settings.followUp7dEnabled && isEnabled;
    const aiAssistEnabled = override
      ? override.aiAssistEnabled
      : adminState.settings.aiAssistEnabled && isEnabled;
    const activeFollowUpLabels = [
      followUp24hEnabled ? "24h" : null,
      followUp7dEnabled ? "7d" : null
    ].filter(Boolean);
    const yelpConnection = buildBusinessYelpConnectionHealth({
      hasYelpBusinessId: Boolean(business.encryptedYelpBusinessId),
      yelpThreadAccess,
      leadCount,
      pendingSyncCount,
      pendingSyncOldestAt,
      lastLeadActivityAt: latestLeadActivity?.lastActivityAt ?? null,
      lastWebhookReceivedAt: latestWebhook?.receivedAt ?? null,
      lastWebhookStatus: latestWebhook?.status ?? null,
      lastWebhookErrorSummary: latestWebhook?.errorSummary ?? null,
      lastSuccessfulSyncAt: latestSuccessfulSync?.syncedAt ?? latestLeadActivity?.lastSyncedAt ?? null,
      lastSuccessfulSyncStatus: latestSuccessfulSync?.status ?? null,
      lastFailedSyncAt: latestFailedSync?.failedAt ?? null,
      lastFailedSyncStatus: latestFailedSync?.status ?? null,
      lastFailedSyncErrorSummary: latestFailedSync?.errorSummary ?? null
    });
    let healthStatus = "INACTIVE";
    let healthLabel = "Off";
    let detail = "Tenant defaults do not cover this business yet.";

    if (!business.encryptedYelpBusinessId) {
      healthStatus = "UNRESOLVED";
      healthLabel = "Missing Yelp ID";
      detail = "Save the Yelp business ID before thread automation can send.";
    } else if (yelpThreadAccess.status !== "READY") {
      healthStatus = "FAILED";
      healthLabel = "Delivery blocked";
      detail = yelpThreadAccess.label;
    } else if (!isEnabled) {
      healthStatus = "INACTIVE";
      healthLabel = "Off";
      detail = override ? "Business override is disabled." : "Tenant defaults are not active for this business.";
    } else if (globalInitialRuleCount === 0 && conditionalInitialRuleCount === 0) {
      healthStatus = "UNRESOLVED";
      healthLabel = "Needs initial rule";
      detail = "No enabled initial rule can reply for this business.";
    } else if (globalInitialRuleCount === 0 && conditionalInitialRuleCount > 0) {
      healthStatus = "PARTIAL";
      healthLabel = "Conditional only";
      detail = "Only service-scoped initial rules are active for this business.";
    } else if (openIssueCount > 0 || failedCount > 0) {
      healthStatus = "PARTIAL";
      healthLabel = "Needs attention";
      detail =
        openIssueCount > 0
          ? `${openIssueCount} open autoresponder issue${openIssueCount === 1 ? "" : "s"}.`
          : `${failedCount} failed automation attempt${failedCount === 1 ? "" : "s"} recorded.`;
    } else if (lastSuccessfulAt) {
      healthStatus = "ACTIVE";
      healthLabel = "Live";
      detail = "This business has recorded a successful automated thread send.";
    } else {
      healthStatus = "READY";
      healthLabel = "Ready";
      detail = "Configured and eligible. No successful automated send recorded yet.";
    }

    if (pendingDueCount > 0) {
      detail = `${detail} ${pendingDueCount} follow-up${pendingDueCount === 1 ? "" : "s"} due now.`;
    }

    return {
      businessId: business.id,
      businessName: business.name,
      yelpBusinessId: business.encryptedYelpBusinessId,
      isEnabled,
      defaultsApply,
      hasOverride: Boolean(override),
      effectiveChannel,
      automationPostureLabel: isEnabled
        ? `${effectiveChannel === "EMAIL" ? "Masked email" : "Yelp thread"} • ${globalInitialRuleCount + conditionalInitialRuleCount} initial rule${globalInitialRuleCount + conditionalInitialRuleCount === 1 ? "" : "s"}`
        : "Automation off",
      followUpLabel: activeFollowUpLabels.length > 0 ? activeFollowUpLabels.join(" + ") : "Follow-ups off",
      aiAssistEnabled,
      conversationEnabled,
      conversationMode,
      conversationRolloutLabel: conversationRollout.label,
      conversationPilotLabel: conversationRollout.pilotLabel,
      conversationRolloutDescription: conversationRollout.description,
      healthStatus,
      healthLabel,
      detail,
      openIssueCount,
      sentCount,
      failedCount,
      pendingDueCount,
      lastSuccessfulAt,
      initialRuleCount: globalInitialRuleCount + conditionalInitialRuleCount,
      yelpConnectionStatus: yelpConnection.status,
      yelpConnectionLabel: yelpConnection.label,
      yelpConnectionDetail: yelpConnection.detail,
      leadCount,
      pendingSyncCount,
      pendingSyncOldestAt,
      hasStaleSyncBacklog,
      latestLeadExternalId: latestLeadActivity?.externalLeadId ?? latestWebhook?.externalLeadId ?? null,
      lastLeadActivityAt: latestLeadActivity?.lastActivityAt ?? null,
      lastWebhookReceivedAt: latestWebhook?.receivedAt ?? null,
      lastWebhookStatus: latestWebhook?.status ?? null,
      lastSyncAt: latestSuccessfulSync?.syncedAt ?? latestLeadActivity?.lastSyncedAt ?? null,
      lastSyncStatus: latestSuccessfulSync?.status ?? null,
      lastSyncErrorSummary: latestFailedSync?.errorSummary ?? null
    };
  });
  const recentAttemptContext = new Map(
    recentAttempts.map((attempt) => [
      attempt.id,
      {
        businessName: attempt.business?.name ?? "Unknown business",
        externalLeadId: attempt.lead?.externalLeadId ?? "Unknown lead",
        customerName: attempt.lead?.customerName ?? null
      }
    ])
  );
  const recentAttemptRows = buildLeadAutomationHistory(recentAttempts).map((attempt) => {
    const context = recentAttemptContext.get(attempt.id);

    return {
      ...attempt,
      businessName: context?.businessName ?? "Unknown business",
      externalLeadId: context?.externalLeadId ?? "Unknown lead",
      customerName: context?.customerName ?? null
    };
  });
  const recentAiActivity = aiAuditEvents.map((event) => {
    const requestSummary = asRecord(event.requestSummaryJson);
    const responseSummaryWrapper = asRecord(event.responseSummaryJson);
    const responseSummary = asRecord(responseSummaryWrapper?.summary);

    return {
      id: event.id,
      createdAt: event.createdAt,
      actionType: event.actionType,
      actionLabel: humanizeAiActivityAction(event.actionType),
      status: event.status,
      businessName: event.business?.name ?? "Tenant-wide",
      actorName: event.actor?.name ?? null,
      channel: getStringValue(requestSummary, "channel"),
      warningCodes:
        Array.isArray(responseSummary?.warningCodes) && responseSummary?.warningCodes.length > 0
          ? (responseSummary.warningCodes as string[])
          : []
    };
  });
  const recentActivity = [
    ...recentAttemptRows.map((attempt) => ({
      id: `attempt:${attempt.id}`,
      createdAt: attempt.triggeredAt,
      actionLabel: getLeadAutomationActivityLabel(attempt.cadence, attempt.status),
      status: attempt.status,
      targetLabel: attempt.customerName ?? attempt.externalLeadId,
      businessName: attempt.businessName,
      channelLabel: attempt.deliveryChannelLabel ?? (attempt.channel === "EMAIL" ? "Yelp masked email" : "Yelp thread"),
      detail:
        attempt.errorSummary ??
        attempt.skipReasonLabel ??
        (attempt.dueAt && attempt.status === "PENDING"
          ? "Scheduled and waiting for its due window."
          : attempt.ruleName ?? attempt.scopeLabel)
    })),
    ...recentAiActivity.map((event) => ({
      id: `audit:${event.id}`,
      createdAt: event.createdAt,
      actionLabel: event.actionLabel,
      status: event.status,
      targetLabel: event.actorName ?? "Operator",
      businessName: event.businessName,
      channelLabel: event.channel === "EMAIL" ? "Yelp masked email" : event.channel === "YELP_THREAD" ? "Yelp thread" : "AI assist",
      detail: event.warningCodes.length > 0 ? event.warningCodes.join(", ") : "Review-only"
    }))
  ]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 12);
  const businessReadyCount = businessHealth.filter((business) => ["READY", "ACTIVE", "PARTIAL"].includes(business.healthStatus)).length;
  const businessLiveCount = businessHealth.filter((business) => business.healthStatus === "ACTIVE").length;
  const businessNeedsSetupCount = businessHealth.filter((business) => business.healthStatus === "UNRESOLVED").length;
  const businessIssueCount = businessHealth.filter((business) => business.openIssueCount > 0 || business.failedCount > 0).length;

  return {
    ...adminState,
    moduleSummary: {
      isEnabled: adminState.settings.isEnabled,
      scopeMode: adminState.settings.scopeMode,
      scopedBusinessCount: adminState.settings.scopedBusinessIds.length,
      defaultChannel: adminState.settings.defaultChannel,
      emailFallbackEnabled: adminState.settings.emailFallbackEnabled,
      aiAssistEnabled: adminState.settings.aiAssistEnabled,
      aiModel: adminState.settings.aiModel,
      conversationAutomationEnabled: adminState.settings.conversationAutomationEnabled && adminState.settings.isEnabled,
      conversationGlobalPauseEnabled: adminState.settings.conversationGlobalPauseEnabled,
      conversationMode: adminState.settings.conversationMode,
      conversationRolloutLabel: tenantConversationRollout.label,
      conversationPilotLabel: tenantConversationRollout.pilotLabel,
      conversationRolloutDescription: tenantConversationRollout.description,
      conversationAllowedIntentLabels: formatConversationIntentLabels(adminState.settings.conversationAllowedIntents),
      conversationMaxAutomatedTurns: adminState.settings.conversationMaxAutomatedTurns,
      smtpConfigured: adminState.smtpConfigured,
      enabledTemplateCount: enabledTemplates.length,
      enabledRuleCount: enabledRules.length,
      businessOverrideCount: adminState.businessOverrides.length,
      sentCount: attemptSummary.sentCount,
      failedCount: attemptSummary.failedCount,
      skippedCount: attemptSummary.skippedCount,
      pendingCount: attemptSummary.pendingCount,
      pendingDueCount: attemptSummary.pendingDueCount,
      scheduledCount: attemptSummary.scheduledCount,
      lastSuccessfulAt: attemptSummary.lastSuccessfulAt,
      openIssueCount: openIssues.length,
      deliveryAccessStatus: yelpThreadAccess.status,
      deliveryAccessLabel: yelpThreadAccess.label,
      businessReadyCount,
      businessLiveCount,
      businessNeedsSetupCount,
      businessIssueCount,
      conversationReviewOpenCount: conversationReviewQueue.openCount
    },
    operatingMode: {
      primaryChannel: adminState.settings.defaultChannel === "EMAIL" ? "Yelp masked email fallback" : "Yelp thread",
      scopePolicy:
        adminState.settings.scopeMode === "SELECTED_BUSINESSES"
          ? adminState.settings.scopedBusinessIds.length > 0
            ? `${adminState.settings.scopedBusinessIds.length} selected business${adminState.settings.scopedBusinessIds.length === 1 ? "" : "es"} use the tenant default. Others stay off unless they have an override.`
            : "No businesses are selected for the tenant default yet. Only explicit overrides can send."
          : "All businesses without an override use the tenant default.",
      fallbackPolicy: adminState.settings.emailFallbackEnabled
        ? adminState.smtpConfigured
          ? "Masked email can be used only when thread delivery is unavailable."
          : "Masked email fallback is enabled in policy, but SMTP is not configured."
        : "Masked email fallback is disabled. Thread delivery must be available.",
      afterHoursPolicy:
        "Rules can gate by working hours. Due follow-ups outside the valid window are re-queued to the next working window instead of sending immediately.",
      followUpPolicy:
        adminState.settings.followUp24hEnabled || adminState.settings.followUp7dEnabled
          ? [
              adminState.settings.followUp24hEnabled
                ? `24-hour follow-up after ${adminState.settings.followUp24hDelayHours}h`
                : null,
              adminState.settings.followUp7dEnabled
                ? `following-week follow-up after ${adminState.settings.followUp7dDelayDays}d`
                : null
            ]
              .filter(Boolean)
              .join(" • ")
          : "Automated follow-ups are disabled until a business or tenant scope enables them.",
      liveTemplateMode: enabledTemplates.some((template) => template.channel === "YELP_THREAD")
        ? "Thread-safe templates are live."
        : "No live Yelp-thread template is enabled yet.",
      conversationPolicy: adminState.settings.conversationGlobalPauseEnabled
        ? tenantConversationRollout.description
        : adminState.settings.conversationAutomationEnabled && adminState.settings.isEnabled
          ? `${tenantConversationRollout.label} • ${adminState.settings.conversationMaxAutomatedTurns} automated turn${adminState.settings.conversationMaxAutomatedTurns === 1 ? "" : "s"} max`
          : tenantConversationRollout.description
    },
    aiAssist: {
      ...aiAssist,
      availableModels: approvedLeadAiModelOptions
    },
    businessOverrides: adminState.businessOverrides.map((override) => ({
      id: override.id,
      businessId: override.businessId,
      businessName: override.business.name,
      yelpBusinessId: override.business.encryptedYelpBusinessId,
      isEnabled: override.isEnabled,
      defaultChannel: override.defaultChannel === "EMAIL" ? "EMAIL" : "YELP_THREAD",
      emailFallbackEnabled: override.emailFallbackEnabled,
      followUp24hEnabled: override.followUp24hEnabled,
      followUp24hDelayHours: override.followUp24hDelayHours,
      followUp7dEnabled: override.followUp7dEnabled,
      followUp7dDelayDays: override.followUp7dDelayDays,
      aiAssistEnabled: override.aiAssistEnabled,
      aiModel: resolveLeadAiModel(override.aiModel),
      aiModelLabel: getLeadAiModelLabel(override.aiModel),
      conversationAutomationEnabled: override.conversationAutomationEnabled,
      conversationMode: override.conversationMode,
      conversationModeLabel: humanizeLeadConversationMode(override.conversationMode),
      conversationAllowedIntents: leadConversationAllowedIntentsSchema.parse(override.conversationAllowedIntentsJson),
      conversationAllowedIntentLabels: formatConversationIntentLabels(
        leadConversationAllowedIntentsSchema.parse(override.conversationAllowedIntentsJson)
      ),
      conversationMaxAutomatedTurns: override.conversationMaxAutomatedTurns,
      conversationReviewFallbackEnabled: override.conversationReviewFallbackEnabled,
      conversationEscalateToIssueQueue: override.conversationEscalateToIssueQueue,
      updatedAt: override.updatedAt
    })),
    businessHealth,
    conversationMetrics,
    conversationReviewQueue,
    recentActivity,
    openIssues: openIssues.slice(0, 6).map((issue) => ({
      id: issue.id,
      issueType: issue.issueType,
      severity: issue.severity,
      summary: issue.summary,
      lastDetectedAt: issue.lastDetectedAt,
      targetLabel:
        issue.lead?.customerName ??
        issue.lead?.externalLeadId ??
        issue.business?.name ??
        "Tenant-wide"
    }))
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

export async function saveLeadAutomationBusinessOverrideWorkflow(
  tenantId: string,
  actorId: string,
  input: unknown
) {
  const values = leadAutoresponderBusinessOverrideSchema.parse(input);
  const existing = await getLeadAutomationBusinessOverrideByBusinessId(tenantId, values.businessId);
  const saved = await upsertLeadAutomationBusinessOverride(tenantId, values.businessId, {
    isEnabled: values.isEnabled,
    defaultChannel: values.defaultChannel,
    emailFallbackEnabled: values.emailFallbackEnabled,
    followUp24hEnabled: values.followUp24hEnabled,
    followUp24hDelayHours: values.followUp24hDelayHours,
    followUp7dEnabled: values.followUp7dEnabled,
    followUp7dDelayDays: values.followUp7dDelayDays,
    aiAssistEnabled: values.aiAssistEnabled,
    aiModel: values.aiModel,
    conversationAutomationEnabled: values.conversationAutomationEnabled,
    conversationMode: values.conversationMode,
    conversationAllowedIntentsJson: toJsonValue(values.conversationAllowedIntents),
    conversationMaxAutomatedTurns: values.conversationMaxAutomatedTurns,
    conversationReviewFallbackEnabled: values.conversationReviewFallbackEnabled,
    conversationEscalateToIssueQueue: values.conversationEscalateToIssueQueue,
    metadataJson: toJsonValue({
      updatedBy: actorId
    })
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: values.businessId,
    actionType: "settings.lead-autoresponder-business-override.save",
    status: "SUCCESS",
    before: toJsonValue(existing ?? {}),
    after: toJsonValue(saved)
  });

  return saved;
}

export async function deleteLeadAutomationBusinessOverrideWorkflow(
  tenantId: string,
  actorId: string,
  businessId: string
) {
  const existing = await getLeadAutomationBusinessOverrideByBusinessId(tenantId, businessId);

  if (!existing) {
    throw new YelpValidationError("Business-specific autoresponder override not found.");
  }

  await deleteLeadAutomationBusinessOverride(tenantId, businessId);

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId,
    actionType: "settings.lead-autoresponder-business-override.delete",
    status: "SUCCESS",
    before: toJsonValue(existing),
    after: toJsonValue({})
  });

  return {
    deleted: true
  };
}

export async function createLeadAutomationTemplateWorkflow(
  tenantId: string,
  actorId: string,
  input: unknown
) {
  const values = leadAutomationTemplateFormSchema.parse(input);
  const saved = await createLeadAutomationTemplate(tenantId, {
    businessId: values.businessId || null,
    name: values.name,
    channel: values.channel,
    isEnabled: values.isEnabled,
    subjectTemplate: values.subjectTemplate || null,
    bodyTemplate: values.bodyTemplate,
    sourceSystem: "INTERNAL",
    metadataJson: buildTemplateMetadata(null, values, actorId)
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
      isEnabled: saved.isEnabled,
      businessId: saved.businessId
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
    businessId: values.businessId || null,
    name: values.name,
    channel: values.channel,
    isEnabled: values.isEnabled,
    subjectTemplate: values.subjectTemplate || null,
    bodyTemplate: values.bodyTemplate,
    metadataJson: buildTemplateMetadata(existing.metadataJson, values, actorId)
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

export async function deleteLeadAutomationTemplateWorkflow(
  tenantId: string,
  actorId: string,
  templateId: string
) {
  const existing = await getLeadAutomationTemplateById(tenantId, templateId);

  if (!existing) {
    throw new YelpValidationError("Lead automation template not found.");
  }

  await deleteLeadAutomationTemplate(templateId);

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: existing.businessId ?? undefined,
    actionType: "settings.lead-automation-template.delete",
    status: "SUCCESS",
    before: toJsonValue(existing),
    after: toJsonValue({})
  });

  return {
    deleted: true
  };
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

  validateTemplateBusinessScope({
    template,
    ruleBusinessId: values.businessId || null
  });
  validateRuleCadenceScope({
    cadence: values.cadence,
    template: {
      channel: normalizeAutomationDeliveryChannel(template.channel)
    }
  });

  const saved = await createLeadAutomationRule(tenantId, {
    templateId: values.templateId,
    businessId: values.businessId || null,
    locationId: values.locationId || null,
    serviceCategoryId: values.serviceCategoryId || null,
    name: values.name,
    channel: template.channel,
    cadence: values.cadence,
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

  validateTemplateBusinessScope({
    template,
    ruleBusinessId: values.businessId || null
  });
  validateRuleCadenceScope({
    cadence: values.cadence,
    template: {
      channel: normalizeAutomationDeliveryChannel(template.channel)
    }
  });

  const saved = await updateLeadAutomationRule(ruleId, {
    templateId: values.templateId,
    businessId: values.businessId || null,
    locationId: values.locationId || null,
    serviceCategoryId: values.serviceCategoryId || null,
    name: values.name,
    channel: template.channel,
    cadence: values.cadence,
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

export async function deleteLeadAutomationRuleWorkflow(
  tenantId: string,
  actorId: string,
  ruleId: string
) {
  const existing = await getLeadAutomationRuleById(tenantId, ruleId);

  if (!existing) {
    throw new YelpValidationError("Lead automation rule not found.");
  }

  await deleteLeadAutomationRule(ruleId);

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: existing.businessId ?? undefined,
    actionType: "settings.lead-automation-rule.delete",
    status: "SUCCESS",
    before: toJsonValue(existing),
    after: toJsonValue({})
  });

  return {
    deleted: true
  };
}

export async function processLeadAutoresponderForNewLead(tenantId: string, leadId: string) {
  const [lead, rules] = await Promise.all([
    getLeadAutomationCandidate(tenantId, leadId),
    listEnabledLeadAutomationRules(tenantId)
  ]);
  const { effectiveSettings } = await getLeadAutomationScopeConfig(tenantId, lead.business?.id ?? null);
  const smtpConfigured = isSmtpConfigured();
  const eligibility = evaluateLeadAutomationEligibility({
    settings: effectiveSettings,
    smtpConfigured,
    lead,
    rules,
    cadence: "INITIAL"
  });

  if (!eligibility.eligible && eligibility.skipReason === "DUPLICATE") {
    logInfo("lead.autoresponder.duplicate", {
      tenantId,
      leadId,
      cadence: "INITIAL"
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
      channel: eligibility.rule?.channel ?? effectiveSettings.defaultChannel,
      cadence: "INITIAL",
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
      actionType: getLeadAutomationAuditActionType("INITIAL"),
      status: "SUCCESS",
      correlationId: attempt.id,
      upstreamReference: lead.externalLeadId,
      requestSummary: {
        cadence: attempt.cadence,
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
      cadence: "INITIAL",
      skipReason: eligibility.skipReason
    });
    await recordAutoresponderMetric({
      tenantId,
      cadence: "INITIAL",
      outcome: "SKIPPED",
      skipReason: eligibility.skipReason
    });

    return attempt;
  }

  const variables = buildLeadAutomationVariables(lead);
  const fallbackSubject =
    renderLeadAutomationTemplate(eligibility.rule.template.subjectTemplate, variables) ||
    getFallbackSubject({
      businessName: lead.business?.name ?? null,
      customerName: lead.customerName ?? null,
      leadReference: lead.externalLeadId
    });
  const fallbackBody = renderLeadAutomationTemplate(eligibility.rule.template.bodyTemplate, variables);
  const renderedMessage = await renderLeadAutomationMessage({
    tenantId,
    lead,
    rule: eligibility.rule,
    settings: {
      aiAssistEnabled: effectiveSettings.aiAssistEnabled,
      aiModel: effectiveSettings.aiModel
    },
    channel: normalizeAutomationDeliveryChannel(eligibility.rule.channel),
    fallbackSubject,
    fallbackBody
  });
  const disclosedMessage = applyLeadAutomationDisclosure({
    channel: eligibility.rule.channel,
    subject: renderedMessage.subject,
    body: renderedMessage.body,
    businessName: lead.business?.name ?? null
  });

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
      cadence: "INITIAL",
      status: "PENDING",
      sourceSystem: "INTERNAL",
      recipient: eligibility.recipient,
      renderedSubject: disclosedMessage.subject,
      renderedBody: disclosedMessage.body,
      startedAt: new Date()
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      logInfo("lead.autoresponder.duplicate", {
        tenantId,
        leadId,
        cadence: "INITIAL"
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
    actionType: getLeadAutomationAuditActionType("INITIAL"),
    channel: normalizeAutomationDeliveryChannel(eligibility.rule.channel),
    renderedSubject: disclosedMessage.subject,
    renderedBody: disclosedMessage.body,
    recipient: eligibility.recipient,
    allowEmailFallback: effectiveSettings.emailFallbackEnabled,
    contentMetadata: renderedMessage.contentMetadata
  });

  if (result.status === "SENT") {
    await ensureLeadAutomationFollowUpAttempts({
      tenantId,
      lead,
      settings: effectiveSettings,
      initialAttemptCompletedAt: result.completedAt ?? new Date()
    });

    logInfo("lead.autoresponder.sent", {
      tenantId,
      leadId,
      attemptId: result.id,
      cadence: "INITIAL",
      recipient: eligibility.recipient
    });
    await recordAutoresponderMetric({
      tenantId,
      cadence: "INITIAL",
      outcome: "SENT"
    });
  } else {
    logError("lead.autoresponder.failed", {
      tenantId,
      leadId,
      attemptId: result.id,
      cadence: "INITIAL",
      message: result.errorSummary
    });
    await recordAutoresponderMetric({
      tenantId,
      cadence: "INITIAL",
      outcome: "FAILED"
    });
  }

  return result;
}

async function processDueLeadAutomationAttempt(params: {
  tenantId: string;
  leadId: string;
  attemptId: string;
  cadence: "FOLLOW_UP_24H" | "FOLLOW_UP_7D";
  actorId?: string | null;
  isRetry?: boolean;
}) {
  const [lead, rules] = await Promise.all([
    getLeadAutomationCandidate(params.tenantId, params.leadId),
    listEnabledLeadAutomationRules(params.tenantId)
  ]);
  const { effectiveSettings } = await getLeadAutomationScopeConfig(
    params.tenantId,
    lead.business?.id ?? null
  );
  const attempt =
    lead.automationAttempts.find(
      (candidate) => candidate.id === params.attemptId && (candidate.cadence ?? "INITIAL") === params.cadence
    ) ?? null;

  if (!attempt) {
    throw new YelpValidationError("The follow-up attempt no longer exists for this lead.");
  }

  if (attempt.status === "SENT") {
    throw new YelpValidationError(`${humanizeLeadAutomationCadence(params.cadence)} already sent successfully.`);
  }

  const eligibility = evaluateLeadAutomationFollowUpEligibility({
    settings: effectiveSettings,
    lead,
    rules,
    cadence: params.cadence,
    currentAttemptId: attempt.id
  });

  if (!eligibility.eligible) {
    if (eligibility.skipReason === "OUTSIDE_WORKING_HOURS" && eligibility.rule) {
      const nextDueAt = getNextWorkingWindowStart(eligibility.rule, new Date());

      if (nextDueAt) {
        const requeuedAttempt = await updateLeadAutomationAttempt(attempt.id, {
          status: "PENDING",
          skipReason: null,
          ruleId: eligibility.rule.id,
          templateId: eligibility.rule.template.id,
          channel: "YELP_THREAD",
          errorSummary: `Re-queued until ${nextDueAt.toISOString()} because the follow-up became due outside working hours.`,
          dueAt: nextDueAt,
          startedAt: null,
          completedAt: null
        });

        await recordAuditEvent({
          tenantId: params.tenantId,
          actorId: params.actorId ?? undefined,
          businessId: lead.business?.id ?? undefined,
          actionType: getLeadAutomationAuditActionType(params.cadence, params.isRetry),
          status: "SUCCESS",
          correlationId: requeuedAttempt.id,
          upstreamReference: lead.externalLeadId,
          requestSummary: {
            cadence: requeuedAttempt.cadence,
            channel: requeuedAttempt.channel,
            ruleId: requeuedAttempt.ruleId,
            templateId: requeuedAttempt.templateId
          },
          responseSummary: {
            attemptStatus: requeuedAttempt.status,
            message: eligibility.message,
            requeuedUntil: nextDueAt.toISOString()
          }
        });

        logInfo("lead.autoresponder.requeued", {
          tenantId: params.tenantId,
          leadId: lead.id,
          attemptId: requeuedAttempt.id,
          cadence: params.cadence,
          dueAt: nextDueAt.toISOString()
        });
        await recordAutoresponderMetric({
          tenantId: params.tenantId,
          cadence: params.cadence,
          outcome: "REQUEUED"
        });

        return requeuedAttempt;
      }
    }

    const skippedAttempt = await updateLeadAutomationAttempt(attempt.id, {
      status: "SKIPPED",
      skipReason: eligibility.skipReason,
      ruleId: eligibility.rule?.id ?? null,
      templateId: eligibility.rule?.template.id ?? null,
      channel: eligibility.rule?.channel ?? "YELP_THREAD",
      errorSummary: eligibility.message,
      completedAt: new Date()
    });

    await recordAuditEvent({
      tenantId: params.tenantId,
      actorId: params.actorId ?? undefined,
      businessId: lead.business?.id ?? undefined,
      actionType: getLeadAutomationAuditActionType(params.cadence, params.isRetry),
      status: "SUCCESS",
      correlationId: skippedAttempt.id,
      upstreamReference: lead.externalLeadId,
      requestSummary: {
        cadence: skippedAttempt.cadence,
        channel: skippedAttempt.channel,
        ruleId: skippedAttempt.ruleId,
        templateId: skippedAttempt.templateId
      },
      responseSummary: {
        attemptStatus: skippedAttempt.status,
        skipReason: skippedAttempt.skipReason,
        message: eligibility.message
      }
    });

    logInfo("lead.autoresponder.skipped", {
      tenantId: params.tenantId,
      leadId: lead.id,
      attemptId: skippedAttempt.id,
      cadence: params.cadence,
      skipReason: eligibility.skipReason
    });
    await recordAutoresponderMetric({
      tenantId: params.tenantId,
      cadence: params.cadence,
      outcome: "SKIPPED",
      skipReason: eligibility.skipReason
    });

    return skippedAttempt;
  }

  const variables = buildLeadAutomationVariables(lead);
  const fallbackSubject =
    attempt.renderedSubject ||
    renderLeadAutomationTemplate(eligibility.rule.template.subjectTemplate, variables) ||
    getFallbackSubject({
      businessName: lead.business?.name ?? null,
      customerName: lead.customerName ?? null,
      leadReference: lead.externalLeadId
    });
  const fallbackBody =
    attempt.renderedBody ||
    renderLeadAutomationTemplate(eligibility.rule.template.bodyTemplate, variables);
  const renderedMessage = await renderLeadAutomationMessage({
    tenantId: params.tenantId,
    lead,
    rule: eligibility.rule,
    settings: {
      aiAssistEnabled: effectiveSettings.aiAssistEnabled,
      aiModel: effectiveSettings.aiModel
    },
    channel: "YELP_THREAD",
    fallbackSubject,
    fallbackBody
  });
  const disclosedMessage = applyLeadAutomationDisclosure({
    channel: "YELP_THREAD",
    subject: renderedMessage.subject,
    body: renderedMessage.body,
    businessName: lead.business?.name ?? null
  });

  await updateLeadAutomationAttempt(attempt.id, {
    status: "PENDING",
    skipReason: null,
    ruleId: eligibility.rule.id,
    templateId: eligibility.rule.template.id,
    channel: "YELP_THREAD",
    recipient: null,
    renderedSubject: disclosedMessage.subject,
    renderedBody: disclosedMessage.body,
    errorSummary: null,
    providerMessageId: null,
    providerStatus: null,
    providerMetadataJson: null,
    startedAt: new Date(),
    completedAt: null
  });

  const result = await deliverLeadAutomationAttempt({
    tenantId: params.tenantId,
    actorId: params.actorId ?? null,
    lead,
    attemptId: attempt.id,
    actionType: getLeadAutomationAuditActionType(params.cadence, params.isRetry),
    channel: "YELP_THREAD",
    renderedSubject: disclosedMessage.subject,
    renderedBody: disclosedMessage.body,
    recipient: null,
    allowEmailFallback: false,
    contentMetadata: renderedMessage.contentMetadata
  });

  if (result.status === "SENT") {
    logInfo("lead.autoresponder.sent", {
      tenantId: params.tenantId,
      leadId: lead.id,
      attemptId: result.id,
      cadence: params.cadence
    });
    await recordAutoresponderMetric({
      tenantId: params.tenantId,
      cadence: params.cadence,
      outcome: "SENT"
    });
  } else {
    logError("lead.autoresponder.failed", {
      tenantId: params.tenantId,
      leadId: lead.id,
      attemptId: result.id,
      cadence: params.cadence,
      message: result.errorSummary
    });
    await recordAutoresponderMetric({
      tenantId: params.tenantId,
      cadence: params.cadence,
      outcome: "FAILED"
    });
  }

  return result;
}

export async function reconcileDueLeadAutomationFollowUps(limit = 20) {
  const now = new Date();
  const dueAttempts = await listDueLeadAutomationAttempts(limit * 3, now);
  const results = [];

  for (const attempt of dueAttempts) {
    const claimed = await claimLeadAutomationAttemptForProcessing(attempt.id, now);

    if (!claimed) {
      continue;
    }

    try {
      const processed = await processDueLeadAutomationAttempt({
        tenantId: attempt.tenantId,
        leadId: attempt.leadId,
        attemptId: attempt.id,
        cadence: attempt.cadence as "FOLLOW_UP_24H" | "FOLLOW_UP_7D"
      });

      results.push({
        attemptId: processed.id,
        leadId: processed.leadId,
        cadence: processed.cadence,
        status: processed.status
      });
    } catch (error) {
      const normalized = normalizeUnknownError(error);

      results.push({
        attemptId: attempt.id,
        leadId: attempt.leadId,
        cadence: attempt.cadence,
        status: "FAILED" as const,
        code: normalized.code,
        message: normalized.message
      });
    }

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

export async function runLeadAutomationFollowUpWorker(limit = 20) {
  return reconcileDueLeadAutomationFollowUps(limit);
}

export async function getLeadAutomationHistoryForLead(tenantId: string, leadId: string) {
  const lead = await getLeadAutomationCandidate(tenantId, leadId);
  return buildLeadAutomationHistory(lead.automationAttempts);
}

export async function retryLeadAutomationAttemptWorkflow(
  tenantId: string,
  actorId: string,
  leadId: string,
  attemptId?: string | null
) {
  const lead = await getLeadAutomationCandidate(tenantId, leadId);
  const { effectiveSettings } = await getLeadAutomationScopeConfig(tenantId, lead.business?.id ?? null);
  const attempt =
    (attemptId
      ? lead.automationAttempts.find((candidate) => candidate.id === attemptId)
      : [...(lead.automationAttempts ?? [])].sort((left, right) => {
          const leftTime = (left.completedAt ?? left.triggeredAt ?? new Date(0)).getTime();
          const rightTime = (right.completedAt ?? right.triggeredAt ?? new Date(0)).getTime();
          return rightTime - leftTime;
        }).find((candidate) => candidate.status !== "SENT")) ?? null;

  if (!attempt) {
    throw new YelpValidationError("No retryable autoresponder attempt exists for this lead.");
  }

  const cadence = (attempt.cadence ?? "INITIAL") as "INITIAL" | "FOLLOW_UP_24H" | "FOLLOW_UP_7D";

  if (cadence !== "INITIAL") {
    return processDueLeadAutomationAttempt({
      tenantId,
      leadId,
      attemptId: attempt.id,
      cadence,
      actorId,
      isRetry: true
    });
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
  const disclosedMessage = applyLeadAutomationDisclosure({
    channel: attempt.channel ?? "EMAIL",
    subject: renderedSubject,
    body: renderedBody,
    businessName: lead.business?.name ?? null
  });

  if (!disclosedMessage.body.trim()) {
    throw new YelpValidationError("This attempt does not have a rendered message body to retry.");
  }

  await updateLeadAutomationAttempt(attempt.id, {
    status: "PENDING",
    skipReason: null,
    startedAt: new Date(),
    completedAt: null,
    errorSummary: null,
    providerMessageId: null,
    providerStatus: null,
    providerMetadataJson: null,
    renderedSubject: disclosedMessage.subject,
    renderedBody: disclosedMessage.body
  });

  const result = await deliverLeadAutomationAttempt({
    tenantId,
    actorId,
    lead,
    attemptId: attempt.id,
    actionType: getLeadAutomationAuditActionType("INITIAL", true),
    channel: normalizeAutomationDeliveryChannel(attempt.channel),
    renderedSubject: disclosedMessage.subject,
    renderedBody: disclosedMessage.body,
    recipient: attempt.recipient,
    allowEmailFallback: effectiveSettings.emailFallbackEnabled
  });

  if (result.status === "SENT") {
    await ensureLeadAutomationFollowUpAttempts({
      tenantId,
      lead,
      settings: effectiveSettings,
      initialAttemptCompletedAt: result.completedAt ?? new Date()
    });

    logInfo("lead.autoresponder.retry_sent", {
      tenantId,
      leadId,
      attemptId: result.id,
      cadence: "INITIAL",
      recipient: attempt.recipient
    });
  } else {
    logError("lead.autoresponder.retry_failed", {
      tenantId,
      leadId,
      attemptId: result.id,
      cadence: "INITIAL",
      message: result.errorSummary
    });
  }

  return result;
}
