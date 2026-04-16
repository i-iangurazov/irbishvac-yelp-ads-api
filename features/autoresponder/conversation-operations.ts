import type {
  LeadConversationActionType,
  LeadConversationAutomationMode,
  LeadConversationConfidence,
  LeadConversationDecision,
  LeadConversationIntent,
  LeadConversationStopReason
} from "@prisma/client";

export type ConversationAnalyticsTurn = {
  leadId: string;
  decision: LeadConversationDecision;
  stopReason: LeadConversationStopReason | null;
  createdAt: Date;
};

export function buildConversationAnalytics(params: {
  turns: ConversationAnalyticsTurn[];
  operatorTakeoverCount: number;
  windowDays: number;
}) {
  const automatedReplyCount = params.turns.filter((turn) => turn.decision === "AUTO_REPLY").length;
  const reviewOnlyCount = params.turns.filter((turn) => turn.decision === "REVIEW_ONLY").length;
  const humanHandoffCount = params.turns.filter((turn) => turn.decision === "HUMAN_HANDOFF").length;
  const blockedCount = humanHandoffCount;
  const lowConfidenceCount = params.turns.filter((turn) => turn.stopReason === "LOW_CONFIDENCE").length;
  const maxTurnLimitCount = params.turns.filter((turn) => turn.stopReason === "MAX_AUTOMATED_TURNS_REACHED").length;
  const sendFailureCount = params.turns.filter((turn) => turn.stopReason === "SEND_FAILED").length;
  const pricingRiskCount = params.turns.filter((turn) => turn.stopReason === "PRICING_RISK").length;
  const availabilityRiskCount = params.turns.filter((turn) => turn.stopReason === "AVAILABILITY_RISK").length;

  const turnsByLead = new Map<string, ConversationAnalyticsTurn[]>();

  for (const turn of params.turns) {
    const leadTurns = turnsByLead.get(turn.leadId) ?? [];
    leadTurns.push(turn);
    turnsByLead.set(turn.leadId, leadTurns);
  }

  const autoReplyLeadIds = new Set<string>();
  const replyAfterAutomationLeadIds = new Set<string>();

  for (const [leadId, turns] of turnsByLead.entries()) {
    const ordered = [...turns].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    let sawAutoReply = false;

    for (const turn of ordered) {
      if (turn.decision === "AUTO_REPLY") {
        sawAutoReply = true;
        autoReplyLeadIds.add(leadId);
        continue;
      }

      if (sawAutoReply) {
        replyAfterAutomationLeadIds.add(leadId);
        break;
      }
    }
  }

  const autoReplyLeadCount = autoReplyLeadIds.size;
  const replyAfterAutomationLeadCount = replyAfterAutomationLeadIds.size;

  return {
    windowDays: params.windowDays,
    automatedReplyCount,
    reviewOnlyCount,
    humanHandoffCount,
    blockedCount,
    lowConfidenceCount,
    maxTurnLimitCount,
    sendFailureCount,
    pricingRiskCount,
    availabilityRiskCount,
    operatorTakeoverCount: params.operatorTakeoverCount,
    autoReplyLeadCount,
    replyAfterAutomationLeadCount,
    replyAfterAutomationRate:
      autoReplyLeadCount > 0 ? Math.round((replyAfterAutomationLeadCount / autoReplyLeadCount) * 100) : 0
  };
}

type ConversationReviewAction = {
  id: string;
  actionType: LeadConversationActionType;
  createdAt: Date;
  completedAt: Date | null;
};

type ConversationReviewTurn = {
  id: string;
  leadId: string;
  createdAt: Date;
  mode: LeadConversationAutomationMode;
  intent: LeadConversationIntent;
  decision: LeadConversationDecision;
  confidence: LeadConversationConfidence;
  stopReason: LeadConversationStopReason | null;
  renderedBody: string | null;
  errorSummary: string | null;
  lead: {
    id: string;
    externalLeadId: string;
    customerName: string | null;
    business: {
      id: string;
      name: string;
    } | null;
    conversationActions: ConversationReviewAction[];
  };
};

type ConversationIssueSummary = {
  id: string;
  summary: string;
  severity: string;
  lastDetectedAt: Date;
};

function getOperatorResolutionAfter(turn: ConversationReviewTurn) {
  const resolution = turn.lead.conversationActions
    .filter((action) => {
      const actionAt = action.completedAt ?? action.createdAt;
      return actionAt.getTime() > turn.createdAt.getTime();
    })
    .sort((left, right) => {
      const leftTime = (left.completedAt ?? left.createdAt).getTime();
      const rightTime = (right.completedAt ?? right.createdAt).getTime();
      return leftTime - rightTime;
    })[0] ?? null;

  if (!resolution) {
    return null;
  }

  return {
    actionId: resolution.id,
    actionType: resolution.actionType,
    resolvedAt: resolution.completedAt ?? resolution.createdAt
  };
}

export function buildConversationReviewQueue(params: {
  turns: ConversationReviewTurn[];
  openIssuesByLeadId: Map<string, ConversationIssueSummary>;
}) {
  const latestTurnByLead = new Map<string, ConversationReviewTurn>();

  for (const turn of [...params.turns].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())) {
    if (latestTurnByLead.has(turn.leadId)) {
      continue;
    }

    latestTurnByLead.set(turn.leadId, turn);
  }

  const items = [];
  let resolvedCount = 0;

  for (const turn of latestTurnByLead.values()) {
    const resolution = getOperatorResolutionAfter(turn);

    if (resolution) {
      resolvedCount += 1;
      continue;
    }

    const linkedIssue = params.openIssuesByLeadId.get(turn.leadId) ?? null;

    items.push({
      id: turn.id,
      leadId: turn.leadId,
      externalLeadId: turn.lead.externalLeadId,
      customerName: turn.lead.customerName,
      businessName: turn.lead.business?.name ?? "Unknown business",
      createdAt: turn.createdAt,
      mode: turn.mode,
      intent: turn.intent,
      decision: turn.decision,
      confidence: turn.confidence,
      stopReason: turn.stopReason,
      renderedBody: turn.renderedBody,
      errorSummary: turn.errorSummary,
      linkedIssue
    });
  }

  items.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  return {
    items,
    openCount: items.length,
    resolvedCount
  };
}
