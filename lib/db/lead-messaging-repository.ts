import "server-only";

import type {
  LeadAutomationChannel,
  LeadConversationActionStatus,
  LeadConversationActionType,
  LeadConversationInitiator,
  RecordSourceSystem
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { toJsonValue } from "@/lib/db/json";

export async function createLeadConversationAction(data: {
  tenantId: string;
  leadId: string;
  automationAttemptId?: string | null;
  actorId?: string | null;
  initiator: LeadConversationInitiator;
  actionType: LeadConversationActionType;
  channel: LeadAutomationChannel;
  status?: LeadConversationActionStatus;
  sourceSystem?: RecordSourceSystem;
  recipient?: string | null;
  renderedSubject?: string | null;
  renderedBody?: string | null;
  providerMessageId?: string | null;
  providerStatus?: string | null;
  providerMetadataJson?: unknown;
  errorSummary?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}) {
  return prisma.leadConversationAction.create({
    data: {
      tenantId: data.tenantId,
      leadId: data.leadId,
      automationAttemptId: data.automationAttemptId ?? null,
      actorId: data.actorId ?? null,
      initiator: data.initiator,
      actionType: data.actionType,
      channel: data.channel,
      status: data.status ?? "PENDING",
      sourceSystem: data.sourceSystem ?? "INTERNAL",
      recipient: data.recipient ?? null,
      renderedSubject: data.renderedSubject ?? null,
      renderedBody: data.renderedBody ?? null,
      providerMessageId: data.providerMessageId ?? null,
      providerStatus: data.providerStatus ?? null,
    providerMetadataJson:
        data.providerMetadataJson === undefined ? undefined : toJsonValue(data.providerMetadataJson),
      errorSummary: data.errorSummary ?? null,
      startedAt: data.startedAt ?? null,
      completedAt: data.completedAt ?? null
    }
  });
}

export async function updateLeadConversationAction(
  actionId: string,
  data: {
    status?: LeadConversationActionStatus;
    recipient?: string | null;
    renderedSubject?: string | null;
    renderedBody?: string | null;
    providerMessageId?: string | null;
    providerStatus?: string | null;
    providerMetadataJson?: unknown;
    errorSummary?: string | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
  }
) {
  return prisma.leadConversationAction.update({
    where: { id: actionId },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.recipient !== undefined ? { recipient: data.recipient } : {}),
      ...(data.renderedSubject !== undefined ? { renderedSubject: data.renderedSubject } : {}),
      ...(data.renderedBody !== undefined ? { renderedBody: data.renderedBody } : {}),
      ...(data.providerMessageId !== undefined ? { providerMessageId: data.providerMessageId } : {}),
      ...(data.providerStatus !== undefined ? { providerStatus: data.providerStatus } : {}),
      ...(data.providerMetadataJson !== undefined
        ? { providerMetadataJson: toJsonValue(data.providerMetadataJson) }
        : {}),
      ...(data.errorSummary !== undefined ? { errorSummary: data.errorSummary } : {}),
      ...(data.startedAt !== undefined ? { startedAt: data.startedAt } : {}),
      ...(data.completedAt !== undefined ? { completedAt: data.completedAt } : {})
    }
  });
}
