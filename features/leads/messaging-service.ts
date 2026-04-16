import "server-only";

import { createHash } from "node:crypto";

import type { LeadAutomationChannel } from "@prisma/client";

import { canUseAiReplyAssistant } from "@/features/leads/ai-reply-service";
import { recordAuditEvent } from "@/features/audit/service";
import { leadMarkRepliedSchema, leadReplyFormSchema } from "@/features/leads/schemas";
import { syncLeadSnapshotFromYelp } from "@/features/leads/yelp-sync";
import { sendLeadAutomationEmail } from "@/features/autoresponder/email";
import {
  createLeadConversationAction,
  updateLeadConversationAction
} from "@/lib/db/lead-messaging-repository";
import {
  claimExternalSideEffect,
  completeExternalSideEffect,
  resetExternalSideEffectClaim
} from "@/lib/db/external-side-effects-repository";
import { claimProviderRequestBudget } from "@/features/operations/provider-budget-service";
import { getLeadRecordById } from "@/lib/db/leads-repository";
import { toJsonValue } from "@/lib/db/json";
import { logError, logInfo } from "@/lib/utils/logging";
import {
  normalizeUnknownError,
  YelpApiError,
  YelpMissingAccessError,
  YelpNotFoundError,
  YelpValidationError
} from "@/lib/yelp/errors";
import { YelpLeadsClient } from "@/lib/yelp/leads-client";
import { ensureYelpLeadsAccess } from "@/lib/yelp/runtime";
import { isSmtpConfigured } from "@/features/report-delivery/email";

function buildLeadAutomationHtml(body: string) {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827">${body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />")}</div>`;
}

function hashIdempotencyPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

function buildSendSideEffectKey(params: {
  leadId: string;
  channel: LeadAutomationChannel;
  initiator: "AUTOMATION" | "OPERATOR";
  automationAttemptId?: string | null;
  explicitIdempotencyKey?: string | null;
  renderedSubject?: string | null;
  renderedBody: string;
}) {
  if (params.explicitIdempotencyKey?.trim()) {
    return `lead-send:${params.leadId}:${params.explicitIdempotencyKey.trim()}`;
  }

  if (params.automationAttemptId) {
    return `lead-send:${params.leadId}:attempt:${params.automationAttemptId}:${params.channel}`;
  }

  if (params.initiator === "AUTOMATION") {
    return `lead-send:${params.leadId}:automation:${params.channel}:${hashIdempotencyPayload({
      subject: params.renderedSubject ?? null,
      body: params.renderedBody
    })}`;
  }

  return null;
}

function buildDuplicateSuppressedAction(id: string | null | undefined) {
  return {
    id: id ?? "duplicate-suppressed"
  };
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

function getLeadMaskedEmail(lead: Awaited<ReturnType<typeof getLeadRecordById>>) {
  return lead.customerEmail?.trim() || null;
}

function getLatestUnreadEventId(lead: Awaited<ReturnType<typeof getLeadRecordById>>) {
  return [...lead.events]
    .reverse()
    .find((event) => !event.isRead && event.externalEventId)?.externalEventId ?? null;
}

function getLatestSuccessfulOutboundChannel(lead: Awaited<ReturnType<typeof getLeadRecordById>>) {
  return (
    lead.conversationActions.find(
      (action) =>
        action.status === "SENT" &&
        (action.actionType === "SEND_MESSAGE" || action.actionType === "MARK_REPLIED")
    )?.channel ?? null
  );
}

function shouldFallbackFromYelpThread(error: YelpApiError) {
  return ["MISSING_ACCESS", "NOT_FOUND", "VALIDATION_ERROR"].includes(error.code);
}

async function tryRefreshLeadFromYelp(params: {
  tenantId: string;
  lead: Awaited<ReturnType<typeof getLeadRecordById>>;
  client: YelpLeadsClient;
  sourceEventType: string;
}) {
  const yelpBusinessId =
    params.lead.business?.encryptedYelpBusinessId ?? params.lead.externalBusinessId ?? null;

  if (!yelpBusinessId) {
    return "The saved lead snapshot could not be refreshed because the Yelp business ID is missing locally.";
  }

  try {
    await syncLeadSnapshotFromYelp({
      tenantId: params.tenantId,
      business: {
        id: params.lead.business?.id ?? params.lead.businessId ?? null,
        locationId: params.lead.locationId ?? params.lead.business?.locationId ?? null,
        encryptedYelpBusinessId: yelpBusinessId
      },
      client: params.client,
      leadId: params.lead.externalLeadId,
      receivedAt: new Date(),
      sourceEventType: params.sourceEventType,
      sourceEventId: null,
      sourceInteractionTime: null
    });

    return null;
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    logError("lead.reply.refresh_failed", {
      tenantId: params.tenantId,
      leadId: params.lead.id,
      externalLeadId: params.lead.externalLeadId,
      sourceEventType: params.sourceEventType,
      message: normalized.message
    });

    return normalized.message;
  }
}

async function createFailedConversationAction(params: {
  tenantId: string;
  leadId: string;
  automationAttemptId?: string | null;
  actorId?: string | null;
  initiator: "AUTOMATION" | "OPERATOR";
  channel: LeadAutomationChannel;
  actionType: "SEND_MESSAGE" | "MARK_READ" | "MARK_REPLIED";
  renderedSubject?: string | null;
  renderedBody?: string | null;
  recipient?: string | null;
  error: YelpApiError;
  providerMetadataJson?: Record<string, unknown> | null;
}) {
  const action = await createLeadConversationAction({
    tenantId: params.tenantId,
    leadId: params.leadId,
    automationAttemptId: params.automationAttemptId ?? null,
    actorId: params.actorId ?? null,
    initiator: params.initiator,
    channel: params.channel,
    actionType: params.actionType,
    status: "FAILED",
    renderedSubject: params.renderedSubject ?? null,
    renderedBody: params.renderedBody ?? null,
    recipient: params.recipient ?? null,
    providerStatus: "failed",
    providerMetadataJson: params.providerMetadataJson ?? null,
    errorSummary: params.error.message,
    completedAt: new Date()
  });

  return {
    status: "FAILED" as const,
    warning: null,
    action,
    error: params.error
  };
}

async function sendLeadReplyInYelpThread(params: {
  tenantId: string;
  lead: Awaited<ReturnType<typeof getLeadRecordById>>;
  actorId?: string | null;
  initiator: "AUTOMATION" | "OPERATOR";
  automationAttemptId?: string | null;
  renderedBody: string;
  providerMetadataJson?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
}) {
  const sideEffectKey = buildSendSideEffectKey({
    leadId: params.lead.id,
    channel: "YELP_THREAD",
    initiator: params.initiator,
    automationAttemptId: params.automationAttemptId ?? null,
    explicitIdempotencyKey: params.idempotencyKey ?? null,
    renderedBody: params.renderedBody
  });
  const sideEffect =
    sideEffectKey
      ? await claimExternalSideEffect({
          tenantId: params.tenantId,
          idempotencyKey: sideEffectKey,
          provider: "YELP",
          operation: "lead.thread.send",
          businessId: params.lead.businessId ?? params.lead.business?.id ?? null,
          leadId: params.lead.id,
          automationAttemptId: params.automationAttemptId ?? null,
          requestJson: {
            externalLeadId: params.lead.externalLeadId,
            bodyHash: hashIdempotencyPayload(params.renderedBody)
          }
        })
      : null;

  if (sideEffect && !sideEffect.claimed) {
    if (sideEffect.sideEffect.status === "SUCCEEDED") {
      return {
        status: "SENT" as const,
        action: buildDuplicateSuppressedAction(sideEffect.sideEffect.conversationActionId),
        warning: "Duplicate send suppressed by idempotency record."
      };
    }

    if (sideEffect.sideEffect.status === "CLAIMED") {
      return createFailedConversationAction({
        tenantId: params.tenantId,
        leadId: params.lead.id,
        automationAttemptId: params.automationAttemptId ?? null,
        actorId: params.actorId ?? null,
        initiator: params.initiator,
        channel: "YELP_THREAD",
        actionType: "SEND_MESSAGE",
        renderedBody: params.renderedBody,
        error: new YelpValidationError("A matching Yelp thread send is already in progress."),
        providerMetadataJson: {
          idempotencyKey: sideEffectKey,
          duplicateSideEffectId: sideEffect.sideEffect.id,
          ...(params.providerMetadataJson ?? {})
        }
      });
    }

    await resetExternalSideEffectClaim(sideEffect.sideEffect.id, {
      requestJson: {
        externalLeadId: params.lead.externalLeadId,
        bodyHash: hashIdempotencyPayload(params.renderedBody)
      }
    });
  }

  const action = await createLeadConversationAction({
    tenantId: params.tenantId,
    leadId: params.lead.id,
    automationAttemptId: params.automationAttemptId ?? null,
    actorId: params.actorId ?? null,
    initiator: params.initiator,
    channel: "YELP_THREAD",
    actionType: "SEND_MESSAGE",
    status: "PENDING",
    renderedBody: params.renderedBody,
    startedAt: new Date(),
    providerMetadataJson: {
      deliveryChannel: "YELP_THREAD",
      ...(sideEffectKey ? { idempotencyKey: sideEffectKey } : {}),
      ...(params.providerMetadataJson ?? {})
    }
  });

  try {
    await claimProviderRequestBudget({
      tenantId: params.tenantId,
      provider: "YELP",
      operation: "lead.thread.send",
      businessId: params.lead.businessId ?? params.lead.business?.id ?? null
    });
    const { credential } = await ensureYelpLeadsAccess(params.tenantId);
    const client = new YelpLeadsClient(credential);
    const response = await client.writeLeadEvent(params.lead.externalLeadId, {
      request_content: params.renderedBody,
      request_type: "TEXT"
    });
    const refreshWarning = await tryRefreshLeadFromYelp({
      tenantId: params.tenantId,
      lead: params.lead,
      client,
      sourceEventType: "WRITE_EVENT"
    });
    const saved = await updateLeadConversationAction(action.id, {
      status: "SENT",
      providerStatus: "sent",
      providerMetadataJson: {
        deliveryChannel: "YELP_THREAD",
        correlationId: response.correlationId,
        ...(sideEffectKey ? { idempotencyKey: sideEffectKey } : {}),
        ...(params.providerMetadataJson ?? {}),
        ...(refreshWarning ? { refreshWarning } : {})
      },
      completedAt: new Date()
    });
    if (sideEffect) {
      await completeExternalSideEffect(sideEffect.sideEffect.id, {
        status: "SUCCEEDED",
        conversationActionId: saved.id,
        responseJson: {
          correlationId: response.correlationId,
          refreshWarning
        }
      });
    }

    return {
      status: "SENT" as const,
      action: saved,
      warning: refreshWarning
    };
  } catch (error) {
    const normalized = normalizeUnknownError(error);
    const saved = await updateLeadConversationAction(action.id, {
      status: "FAILED",
      providerStatus: "failed",
      providerMetadataJson: {
        deliveryChannel: "YELP_THREAD",
        ...(sideEffectKey ? { idempotencyKey: sideEffectKey } : {}),
        ...(params.providerMetadataJson ?? {})
      },
      errorSummary: normalized.message,
      completedAt: new Date()
    });
    if (sideEffect) {
      await completeExternalSideEffect(sideEffect.sideEffect.id, {
        status: "FAILED",
        conversationActionId: saved.id,
        errorSummary: normalized.message,
        responseJson: {
          code: normalized.code,
          details: normalized.details ?? null
        }
      });
    }

    return {
      status: "FAILED" as const,
      action: saved,
      error: normalized
    };
  }
}

async function markLeadAsRepliedOnYelp(params: {
  tenantId: string;
  lead: Awaited<ReturnType<typeof getLeadRecordById>>;
  actorId?: string | null;
  initiator: "AUTOMATION" | "OPERATOR";
  automationAttemptId?: string | null;
  replyType: "EMAIL" | "PHONE";
  providerMetadataJson?: Record<string, unknown> | null;
}) {
  const actionChannel = params.replyType === "PHONE" ? "PHONE" : "EMAIL";
  const action = await createLeadConversationAction({
    tenantId: params.tenantId,
    leadId: params.lead.id,
    automationAttemptId: params.automationAttemptId ?? null,
    actorId: params.actorId ?? null,
    initiator: params.initiator,
    channel: actionChannel,
    actionType: "MARK_REPLIED",
    status: "PENDING",
    startedAt: new Date(),
    providerMetadataJson: {
      replyType: params.replyType,
      ...(params.providerMetadataJson ?? {})
    }
  });

  try {
    await claimProviderRequestBudget({
      tenantId: params.tenantId,
      provider: "YELP",
      operation: "lead.mark_replied",
      businessId: params.lead.businessId ?? params.lead.business?.id ?? null
    });
    const { credential } = await ensureYelpLeadsAccess(params.tenantId);
    const client = new YelpLeadsClient(credential);
    const response = await client.markLeadAsReplied(params.lead.externalLeadId, {
      reply_type: params.replyType
    });
    const refreshWarning = await tryRefreshLeadFromYelp({
      tenantId: params.tenantId,
      lead: params.lead,
      client,
      sourceEventType: "MARK_REPLIED"
    });
    const saved = await updateLeadConversationAction(action.id, {
      status: "SENT",
      providerStatus: "sent",
      providerMetadataJson: {
        replyType: params.replyType,
        correlationId: response.correlationId,
        ...(params.providerMetadataJson ?? {}),
        ...(refreshWarning ? { refreshWarning } : {})
      },
      completedAt: new Date()
    });

    return {
      status: "SENT" as const,
      action: saved,
      warning: refreshWarning
    };
  } catch (error) {
    const normalized = normalizeUnknownError(error);
    const saved = await updateLeadConversationAction(action.id, {
      status: "FAILED",
      providerStatus: "failed",
      providerMetadataJson: {
        replyType: params.replyType,
        ...(params.providerMetadataJson ?? {})
      },
      errorSummary: normalized.message,
      completedAt: new Date()
    });

    return {
      status: "FAILED" as const,
      action: saved,
      error: normalized
    };
  }
}

async function sendLeadReplyByEmail(params: {
  tenantId: string;
  lead: Awaited<ReturnType<typeof getLeadRecordById>>;
  actorId?: string | null;
  initiator: "AUTOMATION" | "OPERATOR";
  automationAttemptId?: string | null;
  renderedSubject?: string | null;
  renderedBody: string;
  providerMetadataJson?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
}) {
  const maskedEmail = getLeadMaskedEmail(params.lead);

  if (!maskedEmail) {
    return createFailedConversationAction({
      tenantId: params.tenantId,
      leadId: params.lead.id,
      automationAttemptId: params.automationAttemptId ?? null,
      actorId: params.actorId ?? null,
      initiator: params.initiator,
      channel: "EMAIL",
      actionType: "SEND_MESSAGE",
      renderedSubject: params.renderedSubject ?? null,
      renderedBody: params.renderedBody,
      recipient: null,
      error: new YelpValidationError(
        "Yelp did not provide a masked email address for this lead."
      ),
      providerMetadataJson: params.providerMetadataJson ?? null
    });
  }

  const sideEffectKey = buildSendSideEffectKey({
    leadId: params.lead.id,
    channel: "EMAIL",
    initiator: params.initiator,
    automationAttemptId: params.automationAttemptId ?? null,
    explicitIdempotencyKey: params.idempotencyKey ?? null,
    renderedSubject: params.renderedSubject ?? null,
    renderedBody: params.renderedBody
  });
  const sideEffect =
    sideEffectKey
      ? await claimExternalSideEffect({
          tenantId: params.tenantId,
          idempotencyKey: sideEffectKey,
          provider: "SMTP",
          operation: "lead.email.send",
          businessId: params.lead.businessId ?? params.lead.business?.id ?? null,
          leadId: params.lead.id,
          automationAttemptId: params.automationAttemptId ?? null,
          requestJson: {
            recipient: maskedEmail,
            subject: params.renderedSubject ?? null,
            bodyHash: hashIdempotencyPayload(params.renderedBody)
          }
        })
      : null;

  if (sideEffect && !sideEffect.claimed) {
    if (sideEffect.sideEffect.status === "SUCCEEDED") {
      return {
        status: "SENT" as const,
        action: buildDuplicateSuppressedAction(sideEffect.sideEffect.conversationActionId),
        warning: "Duplicate email send suppressed by idempotency record."
      };
    }

    if (sideEffect.sideEffect.status === "CLAIMED") {
      return createFailedConversationAction({
        tenantId: params.tenantId,
        leadId: params.lead.id,
        automationAttemptId: params.automationAttemptId ?? null,
        actorId: params.actorId ?? null,
        initiator: params.initiator,
        channel: "EMAIL",
        actionType: "SEND_MESSAGE",
        renderedSubject: params.renderedSubject ?? null,
        renderedBody: params.renderedBody,
        recipient: maskedEmail,
        error: new YelpValidationError("A matching Yelp masked-email send is already in progress."),
        providerMetadataJson: {
          idempotencyKey: sideEffectKey,
          duplicateSideEffectId: sideEffect.sideEffect.id,
          ...(params.providerMetadataJson ?? {})
        }
      });
    }

    await resetExternalSideEffectClaim(sideEffect.sideEffect.id, {
      requestJson: {
        recipient: maskedEmail,
        subject: params.renderedSubject ?? null,
        bodyHash: hashIdempotencyPayload(params.renderedBody)
      }
    });
  }

  const action = await createLeadConversationAction({
    tenantId: params.tenantId,
    leadId: params.lead.id,
    automationAttemptId: params.automationAttemptId ?? null,
    actorId: params.actorId ?? null,
    initiator: params.initiator,
    channel: "EMAIL",
    actionType: "SEND_MESSAGE",
    status: "PENDING",
    recipient: maskedEmail,
    renderedSubject: params.renderedSubject ?? null,
    renderedBody: params.renderedBody,
    startedAt: new Date(),
    providerMetadataJson: {
      deliveryChannel: "EMAIL",
      ...(sideEffectKey ? { idempotencyKey: sideEffectKey } : {}),
      ...(params.providerMetadataJson ?? {})
    }
  });

  try {
    await claimProviderRequestBudget({
      tenantId: params.tenantId,
      provider: "SMTP",
      operation: "lead.email.send",
      businessId: params.lead.businessId ?? params.lead.business?.id ?? null
    });
    const email = await sendLeadAutomationEmail({
      to: maskedEmail,
      subject:
        params.renderedSubject ??
        getFallbackSubject({
          businessName: params.lead.business?.name ?? null,
          customerName: params.lead.customerName ?? null,
          leadReference: params.lead.externalLeadId
        }),
      text: params.renderedBody,
      html: buildLeadAutomationHtml(params.renderedBody)
    });
    const sentAction = await updateLeadConversationAction(action.id, {
      status: "SENT",
      providerMessageId: email.messageId ?? null,
      providerStatus: "sent",
      providerMetadataJson: {
        deliveryChannel: "EMAIL",
        ...(sideEffectKey ? { idempotencyKey: sideEffectKey } : {}),
        accepted: email.accepted.map((value) => String(value)),
        rejected: email.rejected.map((value) => String(value)),
        response: email.response,
        ...(params.providerMetadataJson ?? {})
      },
      completedAt: new Date()
    });
    if (sideEffect) {
      await completeExternalSideEffect(sideEffect.sideEffect.id, {
        status: "SUCCEEDED",
        conversationActionId: sentAction.id,
        providerMessageId: email.messageId ?? null,
        responseJson: {
          accepted: email.accepted.map((value) => String(value)),
          rejected: email.rejected.map((value) => String(value)),
          response: email.response
        }
      });
    }
    const markReplied = await markLeadAsRepliedOnYelp({
      tenantId: params.tenantId,
      lead: params.lead,
      actorId: params.actorId ?? null,
      initiator: params.initiator,
      automationAttemptId: params.automationAttemptId ?? null,
      replyType: "EMAIL",
      providerMetadataJson: {
        linkedSendActionId: sentAction.id
      }
    });

    if (markReplied.status === "FAILED") {
      return {
        status: "PARTIAL" as const,
        action: sentAction,
        markAction: markReplied.action,
        warning: "Yelp masked email sent, but Yelp could not be marked as replied.",
        error: markReplied.error
      };
    }

    return {
      status: "SENT" as const,
      action: sentAction,
      markAction: markReplied.action,
      warning: markReplied.warning
    };
  } catch (error) {
    const normalized = normalizeUnknownError(error);
    const saved = await updateLeadConversationAction(action.id, {
      status: "FAILED",
      providerStatus: "failed",
      errorSummary: normalized.message,
      completedAt: new Date()
    });
    if (sideEffect) {
      await completeExternalSideEffect(sideEffect.sideEffect.id, {
        status: "FAILED",
        conversationActionId: saved.id,
        errorSummary: normalized.message,
        responseJson: {
          code: normalized.code,
          details: normalized.details ?? null
        }
      });
    }

    return {
      status: "FAILED" as const,
      action: saved,
      error: normalized
    };
  }
}

export async function sendLeadReplyWorkflow(
  tenantId: string,
  actorId: string,
  leadId: string,
  input: unknown,
  options?: {
    idempotencyKey?: string | null;
  }
) {
  const values = leadReplyFormSchema.parse(input);
  const lead = await getLeadRecordById(tenantId, leadId);
  const normalizedSubject = values.subject?.trim() || null;
  const normalizedBody = values.body.trim();
  const result =
    values.channel === "YELP_THREAD"
      ? await sendLeadReplyInYelpThread({
          tenantId,
          lead,
          actorId,
          initiator: "OPERATOR",
          renderedBody: normalizedBody,
          idempotencyKey: options?.idempotencyKey ?? null
        })
      : await sendLeadReplyByEmail({
          tenantId,
          lead,
          actorId,
          initiator: "OPERATOR",
          renderedSubject:
            normalizedSubject ??
            getFallbackSubject({
              businessName: lead.business?.name ?? null,
              customerName: lead.customerName ?? null,
              leadReference: lead.externalLeadId
          }),
          renderedBody: normalizedBody,
          idempotencyKey: options?.idempotencyKey ?? null
        });

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: lead.business?.id ?? lead.businessId ?? undefined,
    actionType: "lead.reply.send",
    status: result.status === "FAILED" ? "FAILED" : "SUCCESS",
    correlationId: result.action.id,
    upstreamReference: lead.externalLeadId,
    requestSummary: toJsonValue({
      channel: values.channel,
      subject: normalizedSubject
    }),
    responseSummary: toJsonValue({
      status: result.status,
      warning: "warning" in result ? result.warning ?? null : null,
      error:
        result.status === "FAILED" || result.status === "PARTIAL"
          ? result.error?.message ?? null
          : null,
      aiDraft:
        values.aiDraft
          ? {
              requestId: values.aiDraft.requestId,
              draftId: values.aiDraft.draftId,
              edited: values.aiDraft.edited,
              warningCodes: values.aiDraft.warningCodes
            }
          : null
    })
  });

  if (values.aiDraft) {
    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: lead.business?.id ?? lead.businessId ?? undefined,
      actionType: "lead.reply.ai-draft.send",
      status: "SUCCESS",
      correlationId: values.aiDraft.requestId,
      upstreamReference: lead.externalLeadId,
      requestSummary: toJsonValue({
        channel: values.channel,
        draftId: values.aiDraft.draftId,
        edited: values.aiDraft.edited,
        warningCodes: values.aiDraft.warningCodes
      }),
      responseSummary: toJsonValue({
        actionId: result.action.id,
        status: result.status
      })
    });
  }

  if (result.status === "FAILED") {
    throw result.error;
  }

  logInfo("lead.reply.sent", {
    tenantId,
    leadId,
    actionId: result.action.id,
    channel: values.channel,
    status: result.status
  });

  return {
    status: result.status,
    channel: values.channel,
    warning: "warning" in result ? result.warning ?? null : null
  };
}

export async function markLeadAsReadWorkflow(tenantId: string, actorId: string, leadId: string) {
  const lead = await getLeadRecordById(tenantId, leadId);
  const unreadEventId = getLatestUnreadEventId(lead);

  if (!unreadEventId) {
    throw new YelpValidationError("This lead does not have an unread Yelp event to mark as read.");
  }

  const action = await createLeadConversationAction({
    tenantId,
    leadId: lead.id,
    actorId,
    initiator: "OPERATOR",
    channel: "YELP_THREAD",
    actionType: "MARK_READ",
    status: "PENDING",
    startedAt: new Date(),
    providerMetadataJson: {
      eventId: unreadEventId
    }
  });

  try {
    await claimProviderRequestBudget({
      tenantId,
      provider: "YELP",
      operation: "lead.mark_read",
      businessId: lead.businessId ?? lead.business?.id ?? null
    });
    const { credential } = await ensureYelpLeadsAccess(tenantId);
    const client = new YelpLeadsClient(credential);
    const response = await client.markLeadEventAsRead(lead.externalLeadId, {
      event_id: unreadEventId,
      time_read: new Date().toISOString()
    });
    const refreshWarning = await tryRefreshLeadFromYelp({
      tenantId,
      lead,
      client,
      sourceEventType: "MARK_READ"
    });
    const saved = await updateLeadConversationAction(action.id, {
      status: "SENT",
      providerStatus: "sent",
      providerMetadataJson: {
        eventId: unreadEventId,
        correlationId: response.correlationId,
        ...(refreshWarning ? { refreshWarning } : {})
      },
      completedAt: new Date()
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: lead.business?.id ?? lead.businessId ?? undefined,
      actionType: "lead.reply.mark-read",
      status: "SUCCESS",
      correlationId: saved.id,
      upstreamReference: lead.externalLeadId,
      requestSummary: toJsonValue({
        eventId: unreadEventId
      }),
      responseSummary: toJsonValue({
        warning: refreshWarning
      })
    });

    return {
      status: "SENT" as const,
      warning: refreshWarning
    };
  } catch (error) {
    const normalized = normalizeUnknownError(error);
    await updateLeadConversationAction(action.id, {
      status: "FAILED",
      providerStatus: "failed",
      errorSummary: normalized.message,
      completedAt: new Date()
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: lead.business?.id ?? lead.businessId ?? undefined,
      actionType: "lead.reply.mark-read",
      status: "FAILED",
      correlationId: action.id,
      upstreamReference: lead.externalLeadId,
      requestSummary: toJsonValue({
        eventId: unreadEventId
      }),
      responseSummary: toJsonValue({
        message: normalized.message,
        code: normalized.code
      })
    });

    throw normalized;
  }
}

export async function markLeadAsRepliedWorkflow(
  tenantId: string,
  actorId: string,
  leadId: string,
  input: unknown
) {
  const values = leadMarkRepliedSchema.parse(input);
  const lead = await getLeadRecordById(tenantId, leadId);
  const result = await markLeadAsRepliedOnYelp({
    tenantId,
    lead,
    actorId,
    initiator: "OPERATOR",
    replyType: values.replyType
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: lead.business?.id ?? lead.businessId ?? undefined,
    actionType: "lead.reply.mark-replied",
    status: result.status === "FAILED" ? "FAILED" : "SUCCESS",
    correlationId: result.action.id,
    upstreamReference: lead.externalLeadId,
    requestSummary: toJsonValue({
      replyType: values.replyType
    }),
    responseSummary: toJsonValue({
      warning: "warning" in result ? result.warning ?? null : null,
      error: result.status === "FAILED" ? result.error.message : null
    })
  });

  if (result.status === "FAILED") {
    throw result.error;
  }

  logInfo("lead.reply.mark_replied", {
    tenantId,
    leadId,
    actionId: result.action.id,
    replyType: values.replyType
  });

  return {
    status: result.status,
    replyType: values.replyType,
    warning: "warning" in result ? result.warning ?? null : null
  };
}

export async function deliverLeadAutomationMessage(params: {
  tenantId: string;
  actorId?: string | null;
  leadId: string;
  automationAttemptId: string | null;
  channel: LeadAutomationChannel;
  renderedSubject: string;
  renderedBody: string;
  recipient: string | null;
  allowEmailFallback?: boolean;
  idempotencyKey?: string | null;
}) {
  const lead = await getLeadRecordById(params.tenantId, params.leadId);

  if (params.channel === "YELP_THREAD") {
    const primary = await sendLeadReplyInYelpThread({
      tenantId: params.tenantId,
      lead,
      actorId: params.actorId ?? null,
      initiator: "AUTOMATION",
      automationAttemptId: params.automationAttemptId,
      renderedBody: params.renderedBody,
      idempotencyKey: params.idempotencyKey ?? null
    });

    if (primary.status === "SENT") {
      return {
        status: "SENT" as const,
        deliveryChannel: "YELP_THREAD" as const,
        warning: primary.warning ?? null,
        error: null
      };
    }

    if (
      params.allowEmailFallback === false ||
      !shouldFallbackFromYelpThread(primary.error) ||
      !getLeadMaskedEmail(lead)
    ) {
      return {
        status: "FAILED" as const,
        deliveryChannel: "YELP_THREAD" as const,
        warning: null,
        error: primary.error
      };
    }

    const fallback = await sendLeadReplyByEmail({
      tenantId: params.tenantId,
      lead,
      actorId: params.actorId ?? null,
      initiator: "AUTOMATION",
      automationAttemptId: params.automationAttemptId,
      renderedSubject: params.renderedSubject,
      renderedBody: params.renderedBody,
      providerMetadataJson: {
        fallbackFrom: "YELP_THREAD",
        fallbackReason: primary.error.message
      },
      idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:email-fallback` : null
    });

    if (fallback.status === "FAILED") {
      return {
        status: "FAILED" as const,
        deliveryChannel: "EMAIL" as const,
        warning: null,
        error: fallback.error
      };
    }

    return {
      status: fallback.status === "PARTIAL" ? "PARTIAL" as const : "SENT" as const,
      deliveryChannel: "EMAIL" as const,
      warning:
        fallback.status === "PARTIAL"
          ? fallback.warning ?? "Yelp masked email sent, but Yelp was not marked as replied."
          : fallback.warning ?? null,
      error: fallback.status === "PARTIAL" ? fallback.error ?? null : null
    };
  }

  const result = await sendLeadReplyByEmail({
    tenantId: params.tenantId,
    lead,
    actorId: params.actorId ?? null,
    initiator: "AUTOMATION",
    automationAttemptId: params.automationAttemptId,
    renderedSubject: params.renderedSubject,
    renderedBody: params.renderedBody,
    idempotencyKey: params.idempotencyKey ?? null
  });

  if (result.status === "FAILED") {
    return {
      status: "FAILED" as const,
      deliveryChannel: "EMAIL" as const,
      warning: null,
      error: result.error
    };
  }

  return {
    status: result.status === "PARTIAL" ? "PARTIAL" as const : "SENT" as const,
    deliveryChannel: "EMAIL" as const,
    warning:
      result.status === "PARTIAL"
        ? result.warning ?? "Yelp masked email sent, but Yelp was not marked as replied."
        : result.warning ?? null,
    error: result.status === "PARTIAL" ? result.error ?? null : null
  };
}

export async function getLeadReplyComposerState(tenantId: string, leadId: string) {
  const lead = await getLeadRecordById(tenantId, leadId);
  const maskedEmail = getLeadMaskedEmail(lead);
  let canUseYelpThread = true;
  let canMarkAsReplied = true;

  try {
    await ensureYelpLeadsAccess(tenantId);
  } catch {
    canUseYelpThread = false;
    canMarkAsReplied = false;
  }

  const canUseEmail = Boolean(maskedEmail) && isSmtpConfigured();
  const latestOutboundChannel = getLatestSuccessfulOutboundChannel(lead);
  const preferredReplyChannel =
    latestOutboundChannel === "YELP_THREAD" || latestOutboundChannel === "EMAIL"
      ? latestOutboundChannel
      : null;

  return {
    canUseYelpThread,
    canUseEmail,
    canGenerateAiDrafts: await canUseAiReplyAssistant(tenantId, lead.businessId ?? lead.business?.id ?? null),
    defaultChannel:
      preferredReplyChannel ??
      (canUseYelpThread ? "YELP_THREAD" : canUseEmail ? "EMAIL" : null),
    latestOutboundChannel,
    maskedEmail,
    canMarkAsRead: Boolean(getLatestUnreadEventId(lead)),
    canMarkAsReplied
  };
}
