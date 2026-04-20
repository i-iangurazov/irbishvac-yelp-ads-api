import "server-only";

import type {
  LeadAutomationChannel,
  LeadConversationAutomationMode,
  LeadConversationDecision,
  LeadConversationStopReason,
  OperatorIssueSeverity,
  Prisma
} from "@prisma/client";

import {
  leadAutomationStarterTemplates,
  type LeadConversationIntentValue
} from "@/features/autoresponder/constants";
import {
  classifyInboundConversationEvent,
  decideInboundConversationResponse,
  findNextInboundConversationEvent,
  getAutomatedConversationReplyCount,
  getLeadConversationRolloutState,
  humanizeLeadConversationDecision,
  humanizeLeadConversationIntent,
  humanizeLeadConversationMode,
  humanizeLeadConversationStopReason,
  stripAutomationDisclosure,
  type LeadConversationClassification
} from "@/features/autoresponder/conversation";
import { getLeadAutomationScopeConfig, resolveLeadAiModel } from "@/features/autoresponder/config";
import {
  applyLeadAutomationDisclosure,
  buildLeadAutomationVariables,
  hasHumanTakeoverSince,
  renderLeadAutomationTemplate,
  shouldStopForLifecycle,
  type LeadAutomationCandidate
} from "@/features/autoresponder/logic";
import { readLeadAutomationTemplateMetadata } from "@/features/autoresponder/template-metadata";
import { generateLeadAutomationAiMessageFromGuidance } from "@/features/autoresponder/ai-service";
import { recordAuditEvent } from "@/features/audit/service";
import { deliverLeadAutomationMessage } from "@/features/leads/messaging-service";
import { recordConversationDecisionMetric } from "@/features/operations/observability-service";
import {
  createLeadConversationAutomationTurn,
  getLeadAutomationCandidate,
  getLeadConversationAutomationTurnBySourceEventKey,
  listEnabledLeadAutomationTemplates,
  upsertLeadConversationAutomationState
} from "@/lib/db/autoresponder-repository";
import { toJsonValue } from "@/lib/db/json";
import { createOperatorIssue, getOperatorIssueByDedupeKey, updateOperatorIssue } from "@/lib/db/issues-repository";
import { normalizeUnknownError } from "@/lib/yelp/errors";

type ConversationTemplateKind = keyof typeof leadAutomationStarterTemplates;

type ConversationTemplateSource = {
  id: string | null;
  name: string;
  channel: LeadAutomationChannel;
  metadataJson: unknown;
  subjectTemplate: string | null;
  bodyTemplate: string;
};

function getLatestHumanTakeoverAt(lead: LeadAutomationCandidate) {
  return (
    lead.conversationActions
      ?.filter(
        (action) =>
          action.initiator === "OPERATOR" &&
          action.status === "SENT" &&
          (action.actionType === "SEND_MESSAGE" || action.actionType === "MARK_REPLIED")
      )
      .map((action) => action.completedAt ?? action.createdAt)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null
  );
}

function getLatestAutomatedReplyAt(lead: LeadAutomationCandidate) {
  const attemptReplyTimes =
    lead.automationAttempts
      ?.filter((attempt) => attempt.status === "SENT")
      .map((attempt) => attempt.completedAt ?? attempt.triggeredAt ?? null)
      .filter((value): value is Date => value instanceof Date) ?? [];
  const actionReplyTimes =
    lead.conversationActions
      ?.filter(
        (action) =>
          action.initiator === "AUTOMATION" &&
          action.status === "SENT" &&
          (action.actionType === "SEND_MESSAGE" || action.actionType === "MARK_REPLIED")
      )
      .map((action) => action.completedAt ?? action.createdAt)
      .filter((value): value is Date => value instanceof Date) ?? [];
  const stateReplyTime = lead.conversationAutomationState?.lastAutomatedReplyAt ?? null;

  return [...attemptReplyTimes, ...actionReplyTimes, ...(stateReplyTime ? [stateReplyTime] : [])].sort(
    (left, right) => right.getTime() - left.getTime()
  )[0] ?? null;
}

function excerptForDecisionTrace(value: string | null | undefined, maxLength = 320) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function getStarterTemplate(kind: ConversationTemplateKind): ConversationTemplateSource {
  const starter = leadAutomationStarterTemplates[kind];

  return {
    id: null,
    name: starter.name,
    channel: "YELP_THREAD",
    metadataJson: {
      templateKind: kind,
      renderMode: starter.aiPrompt ? "AI_ASSISTED" : "STATIC",
      aiPrompt: starter.aiPrompt ?? null
    },
    subjectTemplate: starter.subject,
    bodyTemplate: starter.body
  };
}

function selectConversationTemplateSource(params: {
  templates: Awaited<ReturnType<typeof listEnabledLeadAutomationTemplates>>;
  lead: LeadAutomationCandidate;
  templateKind: ConversationTemplateKind;
}) {
  const matchingTemplates = params.templates
    .filter((template) => template.channel === "YELP_THREAD")
    .filter((template) => {
      const metadata = readLeadAutomationTemplateMetadata(template.metadataJson);
      return metadata.templateKind === params.templateKind;
    })
    .filter((template) => !template.businessId || template.businessId === params.lead.business?.id)
    .sort((left, right) => {
      const leftScoped = Number(Boolean(left.businessId));
      const rightScoped = Number(Boolean(right.businessId));

      if (leftScoped !== rightScoped) {
        return rightScoped - leftScoped;
      }

      return left.name.localeCompare(right.name);
    });

  const matchedTemplate = matchingTemplates[0] ?? null;

  if (!matchedTemplate) {
    return getStarterTemplate(params.templateKind);
  }

  return {
    id: matchedTemplate.id,
    name: matchedTemplate.name,
    channel: matchedTemplate.channel,
    metadataJson: matchedTemplate.metadataJson,
    subjectTemplate: matchedTemplate.subjectTemplate,
    bodyTemplate: matchedTemplate.bodyTemplate
  } satisfies ConversationTemplateSource;
}

async function renderConversationTemplate(params: {
  tenantId: string;
  lead: LeadAutomationCandidate;
  settings: {
    aiAssistEnabled: boolean;
    aiModel: string;
  };
  template: ConversationTemplateSource;
  classification: LeadConversationClassification;
  forAutoSend: boolean;
}) {
  const variables = buildLeadAutomationVariables(params.lead);
  const fallbackSubject =
    stripAutomationDisclosure(renderLeadAutomationTemplate(params.template.subjectTemplate ?? "", variables)) ?? "";
  const fallbackBody =
    stripAutomationDisclosure(renderLeadAutomationTemplate(params.template.bodyTemplate, variables)) ??
    renderLeadAutomationTemplate(params.template.bodyTemplate, variables);
  const metadata = readLeadAutomationTemplateMetadata(params.template.metadataJson);

  if (metadata.renderMode !== "AI_ASSISTED" || !params.settings.aiAssistEnabled || !metadata.aiPrompt) {
    return {
      subject: fallbackSubject,
      body: params.forAutoSend
        ? applyLeadAutomationDisclosure({
            channel: "YELP_THREAD",
            subject: fallbackSubject,
            body: fallbackBody,
            businessName: params.lead.business?.name ?? null
          }).body
        : fallbackBody,
      contentMetadata: {
        contentSource: "TEMPLATE",
        templateKind: metadata.templateKind,
        templateRenderMode: metadata.renderMode
      }
    };
  }

  const aiResult = await generateLeadAutomationAiMessageFromGuidance({
    tenantId: params.tenantId,
    lead: params.lead,
    model: resolveLeadAiModel(params.settings.aiModel),
    channel: "YELP_THREAD",
    guidance: metadata.aiPrompt,
    fallbackSubject,
    fallbackBody,
    variables,
    contextLabel: `Conversation automation • ${humanizeLeadConversationIntent(params.classification.intent)}`,
    extraContext: {
      inboundIntent: params.classification.intent,
      inboundMessage: params.classification.messageText
    }
  });
  const renderedBody = params.forAutoSend
    ? applyLeadAutomationDisclosure({
        channel: "YELP_THREAD",
        subject: aiResult.subject,
        body: aiResult.body,
        businessName: params.lead.business?.name ?? null
      }).body
    : stripAutomationDisclosure(aiResult.body) ?? fallbackBody;

  return {
    subject: aiResult.subject,
    body: renderedBody,
    contentMetadata: {
      contentSource: aiResult.usedAi ? "AI" : "TEMPLATE_FALLBACK",
      templateKind: metadata.templateKind,
      templateRenderMode: metadata.renderMode,
      aiModel: aiResult.model,
      ...(aiResult.fallbackReason ? { fallbackReason: aiResult.fallbackReason } : {}),
      ...(aiResult.warningCodes.length > 0 ? { warningCodes: aiResult.warningCodes } : {})
    }
  };
}

function getConversationIssueSeverity(stopReason: LeadConversationStopReason | null): OperatorIssueSeverity {
  switch (stopReason) {
    case "CUSTOMER_ESCALATION":
      return "CRITICAL";
    case "PRICING_RISK":
    case "AVAILABILITY_RISK":
    case "SEND_FAILED":
      return "HIGH";
    case "MAX_AUTOMATED_TURNS_REACHED":
    case "LOW_CONFIDENCE":
    case "UNCLEAR_SERVICE":
    case "MISSING_THREAD_CONTEXT":
      return "MEDIUM";
    default:
      return "LOW";
  }
}

function shouldSendConversationHandoffAcknowledgement(params: {
  settings: {
    conversationAutomationEnabled: boolean;
    conversationGlobalPauseEnabled?: boolean;
    conversationMode: LeadConversationAutomationMode;
  };
  stopReason: LeadConversationStopReason | null;
}) {
  if (
    !params.settings.conversationAutomationEnabled ||
    params.settings.conversationGlobalPauseEnabled ||
    params.settings.conversationMode !== "BOUNDED_AUTO_REPLY"
  ) {
    return false;
  }

  return (
    params.stopReason === "PRICING_RISK" ||
    params.stopReason === "AVAILABILITY_RISK" ||
    params.stopReason === "UNCLEAR_SERVICE" ||
    params.stopReason === "LOW_CONFIDENCE" ||
    params.stopReason === "INTENT_NOT_ALLOWED"
  );
}

function buildConversationHandoffAcknowledgement(params: {
  lead: LeadAutomationCandidate;
  stopReason: LeadConversationStopReason | null;
}) {
  const subject = "";
  const body =
    params.stopReason === "PRICING_RISK"
      ? "Thanks for asking. We do not want to guess on pricing from the current details. A team member will review this Yelp thread and follow up with the right next step. If you can, add photos, the address, and a short description here."
      : params.stopReason === "AVAILABILITY_RISK"
        ? "Thanks for checking. We cannot promise timing automatically here. A team member will review availability and follow up. If helpful, please add your preferred timing and address in this Yelp thread."
        : "Thanks, we received your message. A team member needs to review this before we reply further. If you can, add photos, the address, or a short description here in Yelp.";

  return applyLeadAutomationDisclosure({
    channel: "YELP_THREAD",
    subject,
    body,
    businessName: params.lead.business?.name ?? null
  });
}

async function upsertConversationIssue(params: {
  tenantId: string;
  lead: LeadAutomationCandidate;
  sourceEventKey: string;
  classification: LeadConversationClassification;
  stopReason: LeadConversationStopReason;
}) {
  const dedupeKey = `conversation-automation:${params.lead.id}:${params.sourceEventKey}`;
  const title =
    params.stopReason === "CUSTOMER_ESCALATION"
      ? "Customer escalation requires handoff"
      : params.stopReason === "PRICING_RISK"
        ? "Pricing request requires human review"
        : params.stopReason === "AVAILABILITY_RISK"
          ? "Availability request requires human review"
          : params.stopReason === "MAX_AUTOMATED_TURNS_REACHED"
            ? "Automated turn limit reached"
            : "Conversation automation needs review";
  const summary = humanizeLeadConversationStopReason(params.stopReason);
  const details = {
    sourceEventKey: params.sourceEventKey,
    intent: params.classification.intent,
    confidence: params.classification.confidence,
    message: params.classification.messageText
  };
  const existing = await getOperatorIssueByDedupeKey(params.tenantId, dedupeKey);

  if (!existing) {
    await createOperatorIssue(params.tenantId, {
      dedupeKey,
      issueType: "AUTORESPONDER_FAILURE",
      severity: getConversationIssueSeverity(params.stopReason),
      sourceSystem: "DERIVED",
      title,
      summary,
      detailsJson: toJsonValue(details),
      businessId: params.lead.business?.id ?? null,
      locationId: params.lead.location?.id ?? params.lead.business?.location?.id ?? null,
      leadId: params.lead.id
    });
    return;
  }

  await updateOperatorIssue(existing.id, {
    severity: getConversationIssueSeverity(params.stopReason),
    title,
    summary,
    detailsJson: toJsonValue(details),
    status: "OPEN",
    detectedCount: {
      increment: 1
    },
    lastDetectedAt: new Date(),
    resolvedAt: null,
    resolvedById: null,
    resolutionReason: null,
    resolutionNote: null,
    ignoredAt: null,
    ignoredById: null
  });
}

function buildStateUpdate(params: {
  lead: LeadAutomationCandidate;
  settings: {
    conversationAutomationEnabled: boolean;
    conversationGlobalPauseEnabled?: boolean;
    conversationMode: LeadConversationAutomationMode;
    conversationMaxAutomatedTurns: number;
  };
  sourceEventKey: string;
  occurredAt: Date | null | undefined;
  intent: LeadConversationIntentValue;
  decision: LeadConversationDecision;
  stopReason: LeadConversationStopReason | null;
  automatedTurnDelta?: number;
  lastAutomatedReplyAt?: Date | null;
}) {
  const latestHumanTakeoverAt = getLatestHumanTakeoverAt(params.lead) ?? params.lead.conversationAutomationState?.humanTakeoverAt ?? null;
  const nextAutomatedTurnCount =
    getAutomatedConversationReplyCount(params.lead) + (params.automatedTurnDelta ?? 0);
  const rollout = getLeadConversationRolloutState({
    enabled: params.settings.conversationAutomationEnabled,
    paused: params.settings.conversationGlobalPauseEnabled ?? false,
    mode: params.settings.conversationMode
  });

  return {
    isEnabled: params.settings.conversationAutomationEnabled,
    mode: params.settings.conversationMode,
    automatedTurnCount: nextAutomatedTurnCount,
    lastAutomatedReplyAt:
      params.lastAutomatedReplyAt ??
      params.lead.conversationAutomationState?.lastAutomatedReplyAt ??
      null,
    lastProcessedEventKey: params.sourceEventKey,
    lastInboundAt: params.occurredAt ?? params.lead.conversationAutomationState?.lastInboundAt ?? null,
    lastIntent: params.intent,
    lastDecision: params.decision,
    lastStopReason: params.stopReason,
    blockedAt:
      params.decision === "HUMAN_HANDOFF" && params.stopReason
        ? new Date()
        : null,
    escalatedAt:
      params.decision === "HUMAN_HANDOFF" && params.stopReason
        ? new Date()
        : params.lead.conversationAutomationState?.escalatedAt ?? null,
    humanTakeoverAt: latestHumanTakeoverAt,
    metadataJson: toJsonValue({
      lastUpdatedBy: "conversation-automation",
      rolloutLabel: rollout.label,
      rolloutPilotLabel: rollout.pilotLabel,
      automatedTurnCount: nextAutomatedTurnCount,
      maxAutomatedTurns: params.settings.conversationMaxAutomatedTurns,
      lastProcessedDecision: params.decision,
      lastProcessedStopReason: params.stopReason
    })
  } satisfies Omit<Prisma.LeadConversationAutomationStateUncheckedCreateInput, "tenantId" | "leadId">;
}

export async function processLeadConversationAutomationForInboundMessage(params: {
  tenantId: string;
  leadId: string;
  sourceEventId?: string | null;
}) {
  const [lead, templates] = await Promise.all([
    getLeadAutomationCandidate(params.tenantId, params.leadId),
    listEnabledLeadAutomationTemplates(params.tenantId)
  ]);
  const settingsScope = await getLeadAutomationScopeConfig(params.tenantId, lead.business?.id ?? null);
  const sourceEvent = findNextInboundConversationEvent(lead, params.sourceEventId, {
    after: getLatestAutomatedReplyAt(lead)
  });

  if (!sourceEvent?.eventKey) {
    return {
      processed: false,
      reason: "NO_NEW_INBOUND_EVENT"
    };
  }

  const existingTurn = await getLeadConversationAutomationTurnBySourceEventKey(params.tenantId, sourceEvent.eventKey);

  if (existingTurn) {
    return {
      processed: false,
      reason: "DUPLICATE_EVENT",
      turnId: existingTurn.id
    };
  }

  const classification = classifyInboundConversationEvent(sourceEvent);

  if (!classification) {
    return {
      processed: false,
      reason: "NO_MESSAGE_TEXT"
    };
  }

  if (shouldStopForLifecycle(lead.internalStatus)) {
    const savedState = await upsertLeadConversationAutomationState(
      params.tenantId,
      lead.id,
      buildStateUpdate({
        lead,
        settings: settingsScope.effectiveSettings,
        sourceEventKey: sourceEvent.eventKey,
        occurredAt: sourceEvent.occurredAt,
        intent: classification.intent,
        decision: "HUMAN_HANDOFF",
        stopReason: "LIFECYCLE_STOPPED"
      })
    );
    const turn = await createLeadConversationAutomationTurn({
      tenantId: params.tenantId,
      leadId: lead.id,
      stateId: savedState.id,
      sourceEventKey: sourceEvent.eventKey,
      sourceExternalEventId: sourceEvent.externalEventId ?? null,
      mode: settingsScope.effectiveSettings.conversationMode,
      intent: classification.intent,
      decision: "HUMAN_HANDOFF",
      confidence: classification.confidence,
      stopReason: "LIFECYCLE_STOPPED",
      metadataJson: toJsonValue({
        inboundMessage: classification.messageText,
        sourceEventOccurredAt: sourceEvent.occurredAt?.toISOString() ?? null,
        sourceExternalEventId: sourceEvent.externalEventId ?? null,
        classification: {
          intent: classification.intent,
          confidence: classification.confidence,
          templateKind: classification.templateKind
        },
        rollout: getLeadConversationRolloutState({
          enabled: settingsScope.effectiveSettings.conversationAutomationEnabled,
          paused: settingsScope.effectiveSettings.conversationGlobalPauseEnabled,
          mode: settingsScope.effectiveSettings.conversationMode
        }),
        mode: {
          value: settingsScope.effectiveSettings.conversationMode,
          label: humanizeLeadConversationMode(settingsScope.effectiveSettings.conversationMode)
        },
        decisionSummary: {
          decision: "HUMAN_HANDOFF",
          decisionLabel: humanizeLeadConversationDecision("HUMAN_HANDOFF"),
          stopReason: "LIFECYCLE_STOPPED",
          stopReasonLabel: humanizeLeadConversationStopReason("LIFECYCLE_STOPPED"),
          issueCreated: false
        }
      }),
      completedAt: new Date()
    });
    await recordConversationDecisionMetric({
      tenantId: params.tenantId,
      decision: turn.decision,
      stopReason: turn.stopReason,
      mode: settingsScope.effectiveSettings.conversationMode,
      confidence: classification.confidence
    });

    return {
      processed: true,
      decision: turn.decision,
      stopReason: turn.stopReason
    };
  }

  const decision = decideInboundConversationResponse({
    settings: settingsScope.effectiveSettings,
    lead,
    classification,
    hasHumanTakeover: hasHumanTakeoverSince(lead, null)
  });

  const selectedTemplate = selectConversationTemplateSource({
    templates,
    lead,
    templateKind: classification.templateKind
  });
  const selectedTemplateMetadata = readLeadAutomationTemplateMetadata(selectedTemplate.metadataJson);
  const automatedTurnCountBefore = getAutomatedConversationReplyCount(lead);
  const buildTurnMetadata = (params: {
    decision: LeadConversationDecision;
    stopReason: LeadConversationStopReason | null;
    automatedTurnDelta?: number;
    issueCreated?: boolean;
    renderedMetadata?: Record<string, unknown>;
    delivery?: Record<string, unknown>;
    errorSummary?: string | null;
  }) =>
    toJsonValue({
      inboundMessage: classification.messageText,
      inboundMessageExcerpt: excerptForDecisionTrace(classification.messageText),
      sourceEventOccurredAt: sourceEvent.occurredAt?.toISOString() ?? null,
      sourceExternalEventId: sourceEvent.externalEventId ?? null,
      classification: {
        intent: classification.intent,
        confidence: classification.confidence,
        templateKind: classification.templateKind
      },
      sourceContext: {
        customerMessageExcerpt: excerptForDecisionTrace(classification.messageText),
        sourceEventKey: sourceEvent.eventKey,
        sourceExternalEventId: sourceEvent.externalEventId ?? null,
        sourceEventOccurredAt: sourceEvent.occurredAt?.toISOString() ?? null
      },
      decisionSummary: {
        decision: params.decision,
        decisionLabel: humanizeLeadConversationDecision(params.decision),
        stopReason: params.stopReason,
        stopReasonLabel: params.stopReason ? humanizeLeadConversationStopReason(params.stopReason) : null,
        issueCreated: params.issueCreated ?? false,
        errorSummary: params.errorSummary ?? null
      },
      reviewState: {
        operatorReviewRequired: params.decision !== "AUTO_REPLY",
        operatorEditStatus: params.decision === "REVIEW_ONLY" ? "WAITING_FOR_OPERATOR" : "NOT_APPLICABLE",
        handoffRequired: params.decision === "HUMAN_HANDOFF"
      },
      rollout: getLeadConversationRolloutState({
        enabled: settingsScope.effectiveSettings.conversationAutomationEnabled,
        paused: settingsScope.effectiveSettings.conversationGlobalPauseEnabled,
        mode: settingsScope.effectiveSettings.conversationMode
      }),
      mode: {
        value: settingsScope.effectiveSettings.conversationMode,
        label: humanizeLeadConversationMode(settingsScope.effectiveSettings.conversationMode)
      },
      template: {
        id: selectedTemplate.id,
        name: selectedTemplate.name,
        kind: selectedTemplateMetadata.templateKind,
        renderMode: selectedTemplateMetadata.renderMode,
        promptSource: selectedTemplateMetadata.aiPrompt ? "TEMPLATE_AI_PROMPT" : "STATIC_TEMPLATE",
        aiPromptConfigured: Boolean(selectedTemplateMetadata.aiPrompt),
        aiPromptPreview: excerptForDecisionTrace(selectedTemplateMetadata.aiPrompt, 260)
      },
      routing: {
        ruleId: null,
        ruleName: null,
        ruleSource: "Conversation routing uses inbound intent classification and template family matching. Cadence rules are not used for conversation turns."
      },
      automatedTurns: {
        before: automatedTurnCountBefore,
        after: automatedTurnCountBefore + (params.automatedTurnDelta ?? 0),
        max: settingsScope.effectiveSettings.conversationMaxAutomatedTurns
      },
      rendering: {
        contentSource: params.renderedMetadata?.contentSource ?? null,
        templateKind: params.renderedMetadata?.templateKind ?? selectedTemplateMetadata.templateKind,
        templateRenderMode: params.renderedMetadata?.templateRenderMode ?? selectedTemplateMetadata.renderMode,
        aiModel: params.renderedMetadata?.aiModel ?? null,
        fallbackReason: params.renderedMetadata?.fallbackReason ?? null,
        warningCodes: params.renderedMetadata?.warningCodes ?? []
      },
      ...(params.renderedMetadata ?? {}),
      ...(params.delivery ? { delivery: params.delivery } : {})
    });

  if (decision.decision === "AUTO_REPLY") {
    const rendered = await renderConversationTemplate({
      tenantId: params.tenantId,
      lead,
      settings: settingsScope.effectiveSettings,
      template: selectedTemplate,
      classification,
      forAutoSend: true
    });
    const delivery = await deliverLeadAutomationMessage({
      tenantId: params.tenantId,
      actorId: null,
      leadId: lead.id,
      automationAttemptId: null,
      channel: "YELP_THREAD",
      renderedSubject: rendered.subject,
      renderedBody: rendered.body,
      recipient: null,
      allowEmailFallback: false,
      idempotencyKey: `conversation-turn:${sourceEvent.eventKey}`
    });

    if (delivery.status === "FAILED") {
      const normalized = normalizeUnknownError(delivery.error);
      const savedState = await upsertLeadConversationAutomationState(
        params.tenantId,
        lead.id,
        buildStateUpdate({
          lead,
          settings: settingsScope.effectiveSettings,
          sourceEventKey: sourceEvent.eventKey,
          occurredAt: sourceEvent.occurredAt,
          intent: classification.intent,
          decision: "HUMAN_HANDOFF",
          stopReason: "SEND_FAILED"
        })
      );
      const turn = await createLeadConversationAutomationTurn({
        tenantId: params.tenantId,
        leadId: lead.id,
        stateId: savedState.id,
        sourceEventKey: sourceEvent.eventKey,
        sourceExternalEventId: sourceEvent.externalEventId ?? null,
        mode: settingsScope.effectiveSettings.conversationMode,
        intent: classification.intent,
        decision: "HUMAN_HANDOFF",
        confidence: classification.confidence,
        stopReason: "SEND_FAILED",
        templateId: selectedTemplate.id,
        renderedSubject: rendered.subject || null,
        renderedBody: rendered.body,
        errorSummary: normalized.message,
        metadataJson: buildTurnMetadata({
          decision: "HUMAN_HANDOFF",
          stopReason: "SEND_FAILED",
          issueCreated: settingsScope.effectiveSettings.conversationEscalateToIssueQueue,
          renderedMetadata: rendered.contentMetadata,
          errorSummary: normalized.message
        }),
        completedAt: new Date()
      });

      if (settingsScope.effectiveSettings.conversationEscalateToIssueQueue) {
        await upsertConversationIssue({
          tenantId: params.tenantId,
          lead,
          sourceEventKey: sourceEvent.eventKey,
          classification,
          stopReason: "SEND_FAILED"
        });
      }

      await recordAuditEvent({
        tenantId: params.tenantId,
        businessId: lead.business?.id ?? undefined,
        actionType: "lead.conversation-automation.auto-reply",
        status: "FAILED",
        correlationId: sourceEvent.eventKey,
        upstreamReference: lead.externalLeadId,
        requestSummary: toJsonValue({
          intent: classification.intent,
          mode: settingsScope.effectiveSettings.conversationMode
        }),
        responseSummary: toJsonValue({
          decision: turn.decision,
          stopReason: turn.stopReason,
          message: normalized.message
        })
      });
      await recordConversationDecisionMetric({
        tenantId: params.tenantId,
        decision: turn.decision,
        stopReason: turn.stopReason,
        mode: settingsScope.effectiveSettings.conversationMode,
        confidence: classification.confidence
      });

      return {
        processed: true,
        decision: turn.decision,
        stopReason: turn.stopReason
      };
    }

    const completedAt = new Date();
    const savedState = await upsertLeadConversationAutomationState(
      params.tenantId,
      lead.id,
      buildStateUpdate({
        lead,
        settings: settingsScope.effectiveSettings,
        sourceEventKey: sourceEvent.eventKey,
        occurredAt: sourceEvent.occurredAt,
        intent: classification.intent,
        decision: "AUTO_REPLY",
        stopReason: null,
        automatedTurnDelta: 1,
        lastAutomatedReplyAt: completedAt
      })
    );
    const turn = await createLeadConversationAutomationTurn({
      tenantId: params.tenantId,
      leadId: lead.id,
      stateId: savedState.id,
      sourceEventKey: sourceEvent.eventKey,
      sourceExternalEventId: sourceEvent.externalEventId ?? null,
      mode: settingsScope.effectiveSettings.conversationMode,
      intent: classification.intent,
      decision: "AUTO_REPLY",
      confidence: classification.confidence,
      templateId: selectedTemplate.id,
      renderedSubject: rendered.subject || null,
      renderedBody: rendered.body,
      metadataJson: buildTurnMetadata({
        decision: "AUTO_REPLY",
        stopReason: null,
        automatedTurnDelta: 1,
        renderedMetadata: rendered.contentMetadata,
        delivery: {
          deliveryStatus: delivery.status,
          deliveryChannel: delivery.deliveryChannel,
          warning: delivery.warning ?? null
        }
      }),
      completedAt
    });

    await recordAuditEvent({
      tenantId: params.tenantId,
      businessId: lead.business?.id ?? undefined,
      actionType: "lead.conversation-automation.auto-reply",
      status: "SUCCESS",
      correlationId: sourceEvent.eventKey,
      upstreamReference: lead.externalLeadId,
      requestSummary: toJsonValue({
        intent: classification.intent,
        mode: settingsScope.effectiveSettings.conversationMode
      }),
      responseSummary: toJsonValue({
        decision: turn.decision,
        contentSource: rendered.contentMetadata.contentSource
      })
    });
    await recordConversationDecisionMetric({
      tenantId: params.tenantId,
      decision: turn.decision,
      stopReason: null,
      mode: settingsScope.effectiveSettings.conversationMode,
      confidence: classification.confidence
    });

    return {
      processed: true,
      decision: turn.decision,
      stopReason: null
    };
  }

  if (decision.decision === "REVIEW_ONLY") {
    const rendered = await renderConversationTemplate({
      tenantId: params.tenantId,
      lead,
      settings: settingsScope.effectiveSettings,
      template: selectedTemplate,
      classification,
      forAutoSend: false
    });
    const savedState = await upsertLeadConversationAutomationState(
      params.tenantId,
      lead.id,
      buildStateUpdate({
        lead,
        settings: settingsScope.effectiveSettings,
        sourceEventKey: sourceEvent.eventKey,
        occurredAt: sourceEvent.occurredAt,
        intent: classification.intent,
        decision: "REVIEW_ONLY",
        stopReason: decision.stopReason
      })
    );
    const turn = await createLeadConversationAutomationTurn({
      tenantId: params.tenantId,
      leadId: lead.id,
      stateId: savedState.id,
      sourceEventKey: sourceEvent.eventKey,
      sourceExternalEventId: sourceEvent.externalEventId ?? null,
      mode: settingsScope.effectiveSettings.conversationMode,
      intent: classification.intent,
      decision: "REVIEW_ONLY",
      confidence: classification.confidence,
      stopReason: decision.stopReason,
      templateId: selectedTemplate.id,
      renderedSubject: rendered.subject || null,
      renderedBody: rendered.body,
      metadataJson: buildTurnMetadata({
        decision: "REVIEW_ONLY",
        stopReason: decision.stopReason,
        renderedMetadata: rendered.contentMetadata
      }),
      completedAt: new Date()
    });

    await recordAuditEvent({
      tenantId: params.tenantId,
      businessId: lead.business?.id ?? undefined,
      actionType: "lead.conversation-automation.review-only",
      status: "SUCCESS",
      correlationId: sourceEvent.eventKey,
      upstreamReference: lead.externalLeadId,
      requestSummary: toJsonValue({
        intent: classification.intent,
        mode: settingsScope.effectiveSettings.conversationMode
      }),
      responseSummary: toJsonValue({
        decision: turn.decision,
        stopReason: turn.stopReason
      })
    });
    await recordConversationDecisionMetric({
      tenantId: params.tenantId,
      decision: turn.decision,
      stopReason: turn.stopReason,
      mode: settingsScope.effectiveSettings.conversationMode,
      confidence: classification.confidence
    });

    return {
      processed: true,
      decision: turn.decision,
      stopReason: turn.stopReason
    };
  }

  const shouldSendHandoffAcknowledgement = shouldSendConversationHandoffAcknowledgement({
    settings: settingsScope.effectiveSettings,
    stopReason: decision.stopReason
  });
  let handoffDelivery: Awaited<ReturnType<typeof deliverLeadAutomationMessage>> | null = null;
  let handoffRenderedSubject: string | null = null;
  let handoffRenderedBody: string | null = null;
  let handoffErrorSummary: string | null = null;
  let finalStopReason = decision.stopReason;
  let automatedTurnDelta = 0;
  let lastAutomatedReplyAt: Date | null = null;

  if (shouldSendHandoffAcknowledgement) {
    const rendered = buildConversationHandoffAcknowledgement({
      lead,
      stopReason: decision.stopReason
    });

    handoffRenderedSubject = rendered.subject || null;
    handoffRenderedBody = rendered.body;
    handoffDelivery = await deliverLeadAutomationMessage({
      tenantId: params.tenantId,
      actorId: null,
      leadId: lead.id,
      automationAttemptId: null,
      channel: "YELP_THREAD",
      renderedSubject: rendered.subject,
      renderedBody: rendered.body,
      recipient: null,
      allowEmailFallback: false,
      idempotencyKey: `conversation-handoff:${sourceEvent.eventKey}`
    });

    if (handoffDelivery.status === "FAILED") {
      const normalized = normalizeUnknownError(handoffDelivery.error);
      finalStopReason = "SEND_FAILED";
      handoffErrorSummary = normalized.message;
    } else {
      lastAutomatedReplyAt = new Date();
    }
  }

  const savedState = await upsertLeadConversationAutomationState(
    params.tenantId,
    lead.id,
    buildStateUpdate({
      lead,
      settings: settingsScope.effectiveSettings,
      sourceEventKey: sourceEvent.eventKey,
      occurredAt: sourceEvent.occurredAt,
      intent: classification.intent,
      decision: "HUMAN_HANDOFF",
      stopReason: finalStopReason,
      automatedTurnDelta,
      lastAutomatedReplyAt
    })
  );
  const turn = await createLeadConversationAutomationTurn({
    tenantId: params.tenantId,
    leadId: lead.id,
    stateId: savedState.id,
    sourceEventKey: sourceEvent.eventKey,
    sourceExternalEventId: sourceEvent.externalEventId ?? null,
    mode: settingsScope.effectiveSettings.conversationMode,
    intent: classification.intent,
    decision: "HUMAN_HANDOFF",
    confidence: classification.confidence,
    stopReason: finalStopReason,
    templateId: selectedTemplate.id,
    renderedSubject: handoffRenderedSubject,
    renderedBody: handoffRenderedBody,
    errorSummary: handoffErrorSummary,
    metadataJson: buildTurnMetadata({
      decision: "HUMAN_HANDOFF",
      stopReason: finalStopReason,
      issueCreated: decision.shouldCreateIssue,
      automatedTurnDelta,
      renderedMetadata: handoffRenderedBody
        ? {
            contentSource: "STATIC_HANDOFF_ACKNOWLEDGEMENT",
            templateKind: selectedTemplateMetadata.templateKind,
            templateRenderMode: "STATIC"
          }
        : undefined,
      delivery: handoffDelivery
        ? {
            deliveryStatus: handoffDelivery.status,
            deliveryChannel: handoffDelivery.deliveryChannel,
            warning: handoffDelivery.warning ?? null
          }
        : undefined,
      errorSummary: handoffErrorSummary
    }),
    completedAt: new Date()
  });

  if (decision.shouldCreateIssue && finalStopReason) {
    await upsertConversationIssue({
      tenantId: params.tenantId,
      lead,
      sourceEventKey: sourceEvent.eventKey,
      classification,
      stopReason: finalStopReason
    });
  }

  await recordAuditEvent({
    tenantId: params.tenantId,
    businessId: lead.business?.id ?? undefined,
    actionType: "lead.conversation-automation.handoff",
    status: "SUCCESS",
    correlationId: sourceEvent.eventKey,
    upstreamReference: lead.externalLeadId,
    requestSummary: toJsonValue({
      intent: classification.intent,
      mode: settingsScope.effectiveSettings.conversationMode
      }),
      responseSummary: toJsonValue({
        decision: turn.decision,
        stopReason: turn.stopReason,
        handoffAcknowledgementSent: handoffDelivery?.status === "SENT"
      })
    });
  await recordConversationDecisionMetric({
    tenantId: params.tenantId,
    decision: turn.decision,
    stopReason: turn.stopReason,
    mode: settingsScope.effectiveSettings.conversationMode,
    confidence: classification.confidence
  });

  return {
    processed: true,
    decision: turn.decision,
    stopReason: turn.stopReason
  };
}

export function formatConversationIntentLabels(intents: LeadConversationIntentValue[] | null | undefined) {
  if (!intents || intents.length === 0) {
    return "No auto-reply intents";
  }

  return intents.map(humanizeLeadConversationIntent).join(", ");
}

export function getConversationRecommendedNextAction(decision: LeadConversationDecision, stopReason: LeadConversationStopReason | null) {
  if (decision === "AUTO_REPLY") {
    return "Automation already replied in the Yelp thread.";
  }

  if (decision === "REVIEW_ONLY") {
    return "Review the suggested reply and send it manually if it looks right.";
  }

  return humanizeLeadConversationStopReason(stopReason);
}
