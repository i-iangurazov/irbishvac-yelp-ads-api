import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { defaultLeadAiModel } from "@/features/autoresponder/constants";
import { getAiReplyAssistantState, extractLeadReplyThreadContext } from "@/features/leads/ai-reply-service";
import { recordAuditEvent } from "@/features/audit/service";
import {
  leadSummaryRequestSchema,
  leadSummaryUsageSchema
} from "@/features/leads/schemas";
import { getLeadDetail } from "@/features/leads/service";
import { toJsonValue } from "@/lib/db/json";
import { getServerEnv } from "@/lib/utils/env";
import { fetchWithRetry } from "@/lib/utils/fetch";
import { logError, logInfo } from "@/lib/utils/logging";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const aiLeadSummaryResponseSchema = z.object({
  needs_human_review: z.boolean().default(false),
  warnings: z.array(z.string().trim().min(1).max(140)).max(6).default([]),
  customer_intent_summary: z.string().trim().min(1).max(280),
  service_context_summary: z.string().trim().min(1).max(220),
  thread_status_summary: z.string().trim().min(1).max(220),
  partner_lifecycle_summary: z.string().trim().min(1).max(220),
  issue_note: z.string().trim().min(1).max(220).nullable().optional(),
  missing_info: z.array(z.string().trim().min(1).max(140)).max(5).default([]),
  next_steps: z.array(z.string().trim().min(1).max(140)).max(4).default([])
});

export type LeadAiSummaryWarningCode =
  | "INSUFFICIENT_CONTEXT"
  | "NEEDS_HUMAN_REVIEW"
  | "POTENTIAL_PRICING_CLAIM"
  | "POTENTIAL_AVAILABILITY_CLAIM"
  | "POTENTIAL_COMPLIANCE_CLAIM"
  | "POTENTIAL_SERVICE_INVENTION";

export type LeadAiSummaryWarning = {
  code: LeadAiSummaryWarningCode;
  message: string;
};

export type LeadAiSummaryResponse = {
  requestId: string;
  generatedAt: string;
  needsHumanReview: boolean;
  warnings: LeadAiSummaryWarning[];
  summary: {
    customerIntent: string;
    serviceContext: string;
    threadStatus: string;
    partnerLifecycle: string;
    issueNote: string | null;
    missingInfo: string[];
    nextSteps: string[];
  };
};

type LeadSummaryContext = {
  leadReference: string;
  businessId: string | null;
  businessName: string | null;
  locationName: string | null;
  customerName: string | null;
  serviceType: string | null;
  replyState: string;
  createdAtYelp: string;
  latestActivityAt: string | null;
  threadMessages: Array<{
    actor: string;
    occurredAt: string | null;
    text: string;
  }>;
  partnerLifecycleStatus: string;
  mappingState: string;
  mappingReference: string | null;
  partnerSyncHealth: {
    status: string;
    message: string;
  };
  openIssues: Array<{
    issueType: string;
    severity: string;
    summary: string;
  }>;
  automation: {
    status: string;
    message: string;
  };
  latestOutboundChannel: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getStringAtPath(value: unknown, path: readonly string[]) {
  let current: unknown = value;

  for (const key of path) {
    const record = asRecord(current);

    if (!record) {
      return null;
    }

    current = record[key];
  }

  return typeof current === "string" && current.trim().length > 0 ? current.trim() : null;
}

function extractOutputText(payload: unknown) {
  const record = asRecord(payload);

  if (!record) {
    return null;
  }

  if (typeof record.output_text === "string" && record.output_text.trim().length > 0) {
    return record.output_text;
  }

  const output = Array.isArray(record.output) ? record.output : [];

  for (const item of output) {
    const itemRecord = asRecord(item);
    const content = Array.isArray(itemRecord?.content) ? itemRecord.content : [];

    for (const contentItem of content) {
      const contentRecord = asRecord(contentItem);
      const text =
        (typeof contentRecord?.text === "string" ? contentRecord.text : null) ??
        (typeof contentRecord?.output_text === "string" ? contentRecord.output_text : null);

      if (text?.trim()) {
        return text;
      }
    }
  }

  return null;
}

function humanizeLeadState(value: string) {
  switch (value) {
    case "UNREAD":
      return "Unread";
    case "READ":
      return "Read";
    case "REPLIED":
      return "Replied";
    case "UNMAPPED":
      return "No partner lifecycle update";
    case "JOB_IN_PROGRESS":
      return "Job in progress";
    case "CLOSED_WON":
      return "Closed won";
    case "CLOSED_LOST":
    case "LOST":
      return "Closed lost";
    default:
      return value
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildWarning(code: LeadAiSummaryWarningCode): LeadAiSummaryWarning {
  switch (code) {
    case "INSUFFICIENT_CONTEXT":
      return {
        code,
        message: "Limited context is available. Review the source thread before acting."
      };
    case "NEEDS_HUMAN_REVIEW":
      return {
        code,
        message: "The generated summary is only a suggestion and needs human review."
      };
    case "POTENTIAL_PRICING_CLAIM":
      return {
        code,
        message: "Potential pricing language detected. Confirm details manually."
      };
    case "POTENTIAL_AVAILABILITY_CLAIM":
      return {
        code,
        message: "Potential timing or availability promise detected. Review manually."
      };
    case "POTENTIAL_COMPLIANCE_CLAIM":
      return {
        code,
        message: "Potential legal, warranty, or compliance claim detected. Review manually."
      };
    case "POTENTIAL_SERVICE_INVENTION":
      return {
        code,
        message: "Potential unsupported service or coverage wording detected. Review manually."
      };
  }
}

function normalizeWarnings(warnings: Iterable<LeadAiSummaryWarningCode>) {
  return [...new Set(warnings)].map(buildWarning);
}

export async function buildLeadSummaryContext(tenantId: string, leadId: string) {
  const detail = await getLeadDetail(tenantId, leadId);
  const threadMessages = extractLeadReplyThreadContext(detail.lead.events);

  return {
    leadReference: detail.lead.externalLeadId,
    businessId: detail.lead.businessId ?? detail.lead.business?.id ?? null,
    businessName: detail.lead.business?.name ?? null,
    locationName: detail.crm.mapping?.location?.name ?? null,
    customerName: detail.lead.customerName ?? null,
    serviceType: detail.lead.mappedServiceLabel ?? null,
    replyState: detail.lead.replyState,
    createdAtYelp: detail.lead.createdAtYelp.toISOString(),
    latestActivityAt: detail.lead.latestInteractionAt?.toISOString() ?? null,
    threadMessages,
    partnerLifecycleStatus: detail.crm.currentInternalStatus,
    mappingState: detail.crm.mapping?.state ?? "UNRESOLVED",
    mappingReference: detail.crm.mappingResolved ? detail.crm.mappingReference : null,
    partnerSyncHealth: {
      status: detail.crm.health.status,
      message: detail.crm.health.message
    },
    openIssues: detail.linkedIssues.slice(0, 3).map((issue) => ({
      issueType: issue.issueType,
      severity: issue.severity,
      summary: issue.summary
    })),
    automation: {
      status: detail.automationSummary.status,
      message: detail.automationSummary.message
    },
    latestOutboundChannel: detail.replyComposer.latestOutboundChannel
  } satisfies LeadSummaryContext;
}

function getLastCustomerMessage(
  messages: LeadSummaryContext["threadMessages"]
) {
  return [...messages].reverse().find((message) => message.actor === "Customer") ?? null;
}

function buildDeterministicNextSteps(context: LeadSummaryContext) {
  const nextSteps: string[] = [];

  if (context.replyState === "UNREAD" || context.threadMessages.length === 0) {
    nextSteps.push("Review the Yelp thread and confirm the customer's latest request.");
  }

  if (context.mappingState === "UNRESOLVED" || context.mappingState === "CONFLICT" || context.mappingState === "ERROR") {
    nextSteps.push("Resolve the partner mapping before relying on downstream lifecycle reporting.");
  }

  if (context.openIssues.length > 0) {
    nextSteps.push("Review the linked issue queue item before treating the lead as complete.");
  }

  if (context.partnerLifecycleStatus === "UNMAPPED") {
    nextSteps.push("Record the first partner lifecycle update after the next real follow-up.");
  }

  if (nextSteps.length === 0) {
    nextSteps.push("Use the current thread and partner status to decide the next human follow-up.");
  }

  return nextSteps.slice(0, 3);
}

export function buildFallbackLeadSummary(context: LeadSummaryContext): LeadAiSummaryResponse["summary"] {
  const lastCustomerMessage = getLastCustomerMessage(context.threadMessages);
  const missingInfo = [
    ...(context.serviceType ? [] : ["Service category is not mapped yet."]),
    ...(context.threadMessages.length > 0 ? [] : ["No Yelp-thread message content is stored yet."]),
    ...(context.mappingState === "UNRESOLVED" || context.mappingState === "CONFLICT" || context.mappingState === "ERROR"
      ? ["Partner mapping needs review."]
      : []),
    ...(context.partnerLifecycleStatus === "UNMAPPED" ? ["No partner lifecycle update is recorded yet."] : [])
  ].slice(0, 4);

  return {
    customerIntent: lastCustomerMessage
      ? `Latest customer note: ${truncateText(lastCustomerMessage.text, 170)}`
      : context.serviceType
        ? `Customer reached out about ${context.serviceType}.`
        : "Customer intent needs human review.",
    serviceContext: context.serviceType
      ? `${context.serviceType} for ${context.businessName ?? "the mapped business"}${context.locationName ? ` • ${context.locationName}` : ""}.`
      : `Service context is incomplete for ${context.businessName ?? "this lead"}.`,
    threadStatus:
      context.threadMessages.length > 0
        ? `${context.threadMessages.length} Yelp thread message${context.threadMessages.length === 1 ? "" : "s"} stored. Reply state: ${humanizeLeadState(context.replyState)}.`
        : "No Yelp thread messages are stored yet.",
    partnerLifecycle: `Partner lifecycle: ${humanizeLeadState(context.partnerLifecycleStatus)}. Mapping: ${humanizeLeadState(context.mappingState)}${context.mappingReference ? ` • ${context.mappingReference}` : ""}.`,
    issueNote: context.openIssues[0]?.summary ?? (context.partnerSyncHealth.status !== "CURRENT" ? context.partnerSyncHealth.message : null),
    missingInfo,
    nextSteps: buildDeterministicNextSteps(context)
  };
}

export function evaluateLeadSummaryRisk(summary: LeadAiSummaryResponse["summary"]) {
  const combined = [
    summary.customerIntent,
    summary.serviceContext,
    summary.threadStatus,
    summary.partnerLifecycle,
    summary.issueNote ?? "",
    ...summary.missingInfo,
    ...summary.nextSteps
  ]
    .join("\n")
    .toLowerCase();
  const warnings = new Set<LeadAiSummaryWarningCode>();

  if (/\$|\busd\b|\bdollars?\b|\bprice\b|\bcost\b|\bquote\b/.test(combined)) {
    warnings.add("POTENTIAL_PRICING_CLAIM");
  }

  if (/\barrive\b|\barrival\b|\bavailable\b|\bavailability\b|\btoday at\b|\btomorrow at\b|\bwithin \d+/.test(combined)) {
    warnings.add("POTENTIAL_AVAILABILITY_CLAIM");
  }

  if (/\bguarantee\b|\bguaranteed\b|\bwarranty\b|\blicensed\b|\binsured\b|\bcertified\b/.test(combined)) {
    warnings.add("POTENTIAL_COMPLIANCE_CLAIM");
  }

  if (/\bwe serve all\b|\bany service\b|\ball repairs\b|\bany area\b/.test(combined)) {
    warnings.add("POTENTIAL_SERVICE_INVENTION");
  }

  return [...warnings];
}

async function createOpenAiLeadSummary(params: {
  model: string;
  context: LeadSummaryContext;
}) {
  const env = getServerEnv();
  const response = await fetchWithRetry(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: params.model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You summarize Yelp leads for human operators. " +
                "Use only the supplied facts. " +
                "Keep every field concise, practical, and non-speculative. " +
                "Do not invent prices, availability, arrival times, booking outcomes, services, coverage, guarantees, or compliance statements. " +
                "If context is thin, set needs_human_review to true, keep the summary generic, and surface missing information."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Generate a concise operator summary for this Yelp lead. Return JSON only.\n\n" +
                JSON.stringify({
                  context: params.context
                })
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "lead_operator_summary",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              needs_human_review: { type: "boolean" },
              warnings: {
                type: "array",
                items: { type: "string" },
                maxItems: 6
              },
              customer_intent_summary: { type: "string" },
              service_context_summary: { type: "string" },
              thread_status_summary: { type: "string" },
              partner_lifecycle_summary: { type: "string" },
              issue_note: { type: ["string", "null"] },
              missing_info: {
                type: "array",
                items: { type: "string" },
                maxItems: 5
              },
              next_steps: {
                type: "array",
                items: { type: "string" },
                maxItems: 4
              }
            },
            required: [
              "needs_human_review",
              "warnings",
              "customer_intent_summary",
              "service_context_summary",
              "thread_status_summary",
              "partner_lifecycle_summary",
              "issue_note",
              "missing_info",
              "next_steps"
            ]
          }
        }
      }
    }),
    retries: 1,
    timeoutMs: 20_000
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = getStringAtPath(payload, ["error", "message"]) ?? "OpenAI lead summary generation failed.";
    throw new Error(message);
  }

  const outputText = extractOutputText(payload);

  if (!outputText) {
    throw new Error("OpenAI did not return a lead summary.");
  }

  return aiLeadSummaryResponseSchema.parse(JSON.parse(outputText));
}

export async function generateLeadSummaryWorkflow(
  tenantId: string,
  actorId: string,
  leadId: string,
  input: unknown
) {
  const values = leadSummaryRequestSchema.parse(input);
  const requestId = randomUUID();
  const context = await buildLeadSummaryContext(tenantId, leadId);
  const aiState = await getAiReplyAssistantState(tenantId, context.businessId);

  if (!(aiState.envConfigured && aiState.enabled)) {
    throw new Error("AI summary generation is not configured for this lead scope.");
  }

  const contextWarnings = new Set<LeadAiSummaryWarningCode>();

  if (context.threadMessages.length === 0 || !context.serviceType) {
    contextWarnings.add("INSUFFICIENT_CONTEXT");
  }

  try {
    const generated = await createOpenAiLeadSummary({
      model: aiState.model ?? defaultLeadAiModel,
      context
    });
    const candidateSummary: LeadAiSummaryResponse["summary"] = {
      customerIntent: generated.customer_intent_summary,
      serviceContext: generated.service_context_summary,
      threadStatus: generated.thread_status_summary,
      partnerLifecycle: generated.partner_lifecycle_summary,
      issueNote: generated.issue_note ?? null,
      missingInfo: generated.missing_info,
      nextSteps: generated.next_steps
    };
    const riskyWarnings = new Set<LeadAiSummaryWarningCode>(
      evaluateLeadSummaryRisk(candidateSummary)
    );

    if (generated.needs_human_review) {
      contextWarnings.add("NEEDS_HUMAN_REVIEW");
    }

    const summary =
      riskyWarnings.size > 0 ? buildFallbackLeadSummary(context) : candidateSummary;
    const warnings = normalizeWarnings([
      ...contextWarnings,
      ...riskyWarnings
    ]);
    const actionType = values.refresh ? "lead.summary.ai.refresh" : "lead.summary.ai.generate";

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: null,
      actionType,
      status: "SUCCESS",
      correlationId: requestId,
      upstreamReference: context.leadReference,
      requestSummary: toJsonValue({
        threadMessageCount: context.threadMessages.length,
        serviceType: context.serviceType,
        refresh: values.refresh
      }),
      responseSummary: toJsonValue({
        needsHumanReview: generated.needs_human_review || warnings.length > 0,
        warningCodes: warnings.map((warning) => warning.code)
      })
    });

    logInfo("lead.summary.ai.generated", {
      tenantId,
      leadId,
      requestId,
      refresh: values.refresh,
      warningCodes: warnings.map((warning) => warning.code)
    });

    return {
      requestId,
      generatedAt: new Date().toISOString(),
      needsHumanReview: generated.needs_human_review || warnings.length > 0,
      warnings,
      summary
    } satisfies LeadAiSummaryResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate an AI lead summary.";
    const actionType = values.refresh ? "lead.summary.ai.refresh" : "lead.summary.ai.generate";

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: null,
      actionType,
      status: "FAILED",
      correlationId: requestId,
      upstreamReference: context.leadReference,
      requestSummary: toJsonValue({
        threadMessageCount: context.threadMessages.length,
        serviceType: context.serviceType,
        refresh: values.refresh
      }),
      responseSummary: toJsonValue({
        message
      })
    });

    logError("lead.summary.ai.failed", {
      tenantId,
      leadId,
      requestId,
      refresh: values.refresh,
      message
    });

    throw error;
  }
}

export async function recordLeadSummaryUsageWorkflow(
  tenantId: string,
  actorId: string,
  leadId: string,
  input: unknown
) {
  const values = leadSummaryUsageSchema.parse(input);
  const context = await buildLeadSummaryContext(tenantId, leadId);

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: null,
    actionType: "lead.summary.ai.dismiss",
    status: "SUCCESS",
    correlationId: values.requestId,
    upstreamReference: context.leadReference,
    responseSummary: toJsonValue({
      action: values.action
    })
  });

  logInfo("lead.summary.ai.dismissed", {
    tenantId,
    leadId,
    requestId: values.requestId
  });

  return {
    status: "RECORDED" as const
  };
}
