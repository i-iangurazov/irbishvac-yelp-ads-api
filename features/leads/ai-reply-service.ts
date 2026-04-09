import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  buildLeadAutomationVariables,
  isWithinWorkingHours,
  renderLeadAutomationTemplate,
  selectLeadAutomationRule
} from "@/features/autoresponder/logic";
import { defaultLeadAiModel } from "@/features/autoresponder/constants";
import {
  getLeadAiModelLabel,
  getLeadAutomationScopeConfig,
  resolveLeadAiModel
} from "@/features/autoresponder/config";
import { recordAuditEvent } from "@/features/audit/service";
import {
  leadReplyDraftRequestSchema,
  leadReplyDraftUsageSchema,
  type LeadReplyDraftRequestInput
} from "@/features/leads/schemas";
import {
  getLeadAutomationCandidate,
  listEnabledLeadAutomationRules
} from "@/lib/db/autoresponder-repository";
import { toJsonValue } from "@/lib/db/json";
import { getLeadRecordById } from "@/lib/db/leads-repository";
import { getServerEnv } from "@/lib/utils/env";
import { fetchWithRetry } from "@/lib/utils/fetch";
import { logError, logInfo } from "@/lib/utils/logging";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_THREAD_MESSAGES = 6;

const aiDraftResponseSchema = z.object({
  needs_human_reply: z.boolean().default(false),
  warnings: z.array(z.string().trim().min(1).max(120)).max(6).default([]),
  drafts: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(60),
        subject: z.string().trim().min(1).max(200).nullable().optional(),
        body: z.string().trim().min(1).max(900)
      })
    )
    .min(1)
    .max(3)
});

export type LeadReplyDraftWarningCode =
  | "INSUFFICIENT_CONTEXT"
  | "POTENTIAL_PRICING_CLAIM"
  | "POTENTIAL_AVAILABILITY_CLAIM"
  | "POTENTIAL_COMPLIANCE_CLAIM"
  | "POTENTIAL_SERVICE_INVENTION";

export type LeadReplyDraftWarning = {
  code: LeadReplyDraftWarningCode;
  message: string;
};

export type LeadReplyDraftSuggestion = {
  id: string;
  title: string;
  subject: string | null;
  body: string;
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

function extractEventMessage(payload: unknown) {
  const candidates = [
    ["message"],
    ["text"],
    ["request_content"],
    ["content"],
    ["body"],
    ["data", "message"],
    ["data", "text"],
    ["event", "message"],
    ["event", "text"],
    ["payload", "message"],
    ["payload", "text"],
    ["details", "message"],
    ["details", "text"]
  ] as const;

  for (const path of candidates) {
    const value = getStringAtPath(payload, path);

    if (value) {
      return value;
    }
  }

  return null;
}

function humanizeActor(actorType: string | null, isReply: boolean) {
  const normalized = actorType?.toLowerCase() ?? "";

  if (normalized.includes("customer") || normalized.includes("consumer") || normalized.includes("user")) {
    return "Customer";
  }

  if (normalized.includes("business") || normalized.includes("partner") || normalized.includes("owner")) {
    return "Business";
  }

  return isReply ? "Business" : "Customer";
}

export function extractLeadReplyThreadContext(
  events: Array<{
    actorType: string | null;
    occurredAt: Date | null;
    payloadJson: unknown;
    isReply: boolean;
  }>
) {
  const messages = events
    .map((event) => {
      const text = extractEventMessage(event.payloadJson);

      if (!text) {
        return null;
      }

      return {
        actor: humanizeActor(event.actorType, event.isReply),
        occurredAt: event.occurredAt?.toISOString() ?? null,
        text
      };
    })
    .filter((entry): entry is { actor: string; occurredAt: string | null; text: string } => Boolean(entry));

  const deduped = messages.filter((entry, index) => {
    const previous = messages[index - 1];
    return !(previous && previous.actor === entry.actor && previous.text === entry.text);
  });

  return deduped.slice(-MAX_THREAD_MESSAGES);
}

function stripAutomationDisclosure(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/^\s*\[automated(?: reply)?\]\s*/i, "")
    .replace(/^\s*automated reply from .*?(?:\n\n|\n)/i, "")
    .trim();

  return normalized.length > 0 ? normalized : null;
}

function buildWarning(code: LeadReplyDraftWarningCode): LeadReplyDraftWarning {
  switch (code) {
    case "INSUFFICIENT_CONTEXT":
      return {
        code,
        message: "Limited thread context. Review the draft carefully before sending."
      };
    case "POTENTIAL_PRICING_CLAIM":
      return {
        code,
        message: "Potential pricing language detected. Confirm details manually before sending."
      };
    case "POTENTIAL_AVAILABILITY_CLAIM":
      return {
        code,
        message: "Potential timing or availability promise detected. Review manually."
      };
    case "POTENTIAL_COMPLIANCE_CLAIM":
      return {
        code,
        message: "Potential guarantee or compliance claim detected. Review manually."
      };
    case "POTENTIAL_SERVICE_INVENTION":
      return {
        code,
        message: "Potential unsupported service or coverage wording detected. Review manually."
      };
  }
}

function normalizeWarnings(warnings: Iterable<LeadReplyDraftWarningCode>) {
  return [...new Set(warnings)].map(buildWarning);
}

export function isAiReplyAssistantConfigured() {
  return Boolean(getServerEnv().OPENAI_API_KEY?.trim());
}

function getConfiguredAiModel(preferredModel?: string | null) {
  return resolveLeadAiModel(preferredModel, getServerEnv().OPENAI_REPLY_MODEL?.trim(), defaultLeadAiModel);
}

export async function getAiReplyAssistantState(tenantId: string, businessId?: string | null) {
  const { effectiveSettings } = await getLeadAutomationScopeConfig(tenantId, businessId);
  const selectedModel = getConfiguredAiModel(effectiveSettings.aiModel);

  return {
    envConfigured: isAiReplyAssistantConfigured(),
    enabled: effectiveSettings.aiAssistEnabled,
    reviewRequired: true,
    model: selectedModel,
    modelLabel: getLeadAiModelLabel(selectedModel),
    guardrails: [
      "No prices or cost quotes",
      "No arrival-time or availability promises",
      "No invented services, coverage, or guarantees",
      "Operator review is always required before send"
    ]
  };
}

export async function canUseAiReplyAssistant(tenantId: string, businessId?: string | null) {
  const state = await getAiReplyAssistantState(tenantId, businessId);
  return state.envConfigured && state.enabled;
}

export function evaluateLeadReplyDraftRisk(draft: { subject: string | null; body: string }) {
  const combined = [draft.subject ?? "", draft.body].join("\n").toLowerCase();
  const warnings = new Set<LeadReplyDraftWarningCode>();

  if (/\$|\busd\b|\bdollars?\b|\bprice\b|\bcost\b|\bquote\b/.test(combined)) {
    warnings.add("POTENTIAL_PRICING_CLAIM");
  }

  if (
    /\barrive\b|\barrival\b|\bavailable\b|\bavailability\b|\bwe can be there\b|\btoday at\b|\btomorrow at\b|\bwithin \d+/.test(
      combined
    )
  ) {
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

export function buildFallbackLeadReplyDrafts(params: {
  channel: LeadReplyDraftRequestInput["channel"];
  customerName: string | null;
  businessName: string | null;
  serviceType: string | null;
  isAfterHours: boolean;
}) {
  const greeting = params.customerName?.trim() ? `Hi ${params.customerName.trim()},` : "Hi,";
  const businessName = params.businessName?.trim() || "our team";
  const serviceType = params.serviceType?.trim() || "your request";
  const statusLine = params.isAfterHours
    ? `We received your Yelp message for ${serviceType}, and our team will review it during the next business window.`
    : `We received your Yelp message about ${serviceType}, and our team is reviewing it now.`;

  return [
    {
      title: params.isAfterHours ? "After-hours follow-up" : "Clarify the request",
      subject: params.channel === "EMAIL" ? `Thanks for contacting ${businessName}` : null,
      body: `${greeting}\n\n${statusLine} Could you share a little more detail about the issue and the best callback or appointment timing for you?`
    }
  ] satisfies Array<{ title: string; subject: string | null; body: string }>;
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

async function createOpenAiLeadDrafts(params: {
  channel: LeadReplyDraftRequestInput["channel"];
  variantCount: number;
  model: string;
  context: Record<string, unknown>;
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
                "You draft review-only reply suggestions for Yelp lead conversations. " +
                "Keep replies short, operational, and polite. " +
                "Do not quote prices, promise arrival times, promise availability, invent services or coverage, or make legal, warranty, licensing, or compliance claims. " +
                "Do not sound robotic or overly salesy. " +
                "Prefer acknowledgment, one clear next step, and a request for missing detail when needed. " +
                "If context is thin or risky, set needs_human_reply to true and keep the reply generic and safe."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Generate concise reply drafts for this Yelp lead conversation context. Return JSON only.\n\n" +
                JSON.stringify({
                  channel: params.channel,
                  variantCount: params.variantCount,
                  context: params.context
                })
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "lead_reply_drafts",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              needs_human_reply: {
                type: "boolean"
              },
              warnings: {
                type: "array",
                items: { type: "string" },
                maxItems: 6
              },
              drafts: {
                type: "array",
                minItems: 1,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    subject: { type: ["string", "null"] },
                    body: { type: "string" }
                  },
                  required: ["title", "subject", "body"]
                }
              }
            },
            required: ["needs_human_reply", "warnings", "drafts"]
          }
        }
      }
    }),
    retries: 1,
    timeoutMs: 20_000
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = getStringAtPath(payload, ["error", "message"]) ?? "OpenAI draft generation failed.";
    throw new Error(message);
  }

  const outputText = extractOutputText(payload);

  if (!outputText) {
    throw new Error("OpenAI did not return draft text.");
  }

  return aiDraftResponseSchema.parse(JSON.parse(outputText));
}

export async function generateLeadReplyDraftsWorkflow(
  tenantId: string,
  actorId: string,
  leadId: string,
  input: unknown
) {
  const values = leadReplyDraftRequestSchema.parse(input);
  const requestId = randomUUID();
  const [lead, automationCandidate, rules] = await Promise.all([
    getLeadRecordById(tenantId, leadId),
    getLeadAutomationCandidate(tenantId, leadId),
    listEnabledLeadAutomationRules(tenantId)
  ]);
  const aiState = await getAiReplyAssistantState(tenantId, lead.businessId ?? automationCandidate.business?.id ?? null);

  if (!(aiState.envConfigured && aiState.enabled)) {
    throw new Error("AI draft generation is not configured for this lead scope.");
  }

  const matchedRule = selectLeadAutomationRule(automationCandidate, rules);
  const variables = buildLeadAutomationVariables(automationCandidate);
  const threadMessages = extractLeadReplyThreadContext(lead.events);
  const businessName = lead.business?.name ?? automationCandidate.business?.name ?? null;
  const locationName =
    automationCandidate.location?.name ??
    automationCandidate.business?.location?.name ??
    automationCandidate.automationAttempts[0]?.rule?.location?.name ??
    null;
  const serviceType = automationCandidate.serviceCategory?.name ?? automationCandidate.mappedServiceLabel ?? null;
  const templateExample = matchedRule
    ? stripAutomationDisclosure(renderLeadAutomationTemplate(matchedRule.template.bodyTemplate, variables))
    : null;
  const isAfterHours = matchedRule ? !isWithinWorkingHours(matchedRule, new Date()) : false;
  const contextWarnings = new Set<LeadReplyDraftWarningCode>();

  if (threadMessages.length === 0) {
    contextWarnings.add("INSUFFICIENT_CONTEXT");
  }

  try {
    const generated = await createOpenAiLeadDrafts({
      channel: values.channel,
      variantCount: values.variantCount,
      model: aiState.model,
      context: {
        leadReference: lead.externalLeadId,
        businessName,
        locationName,
        serviceType,
        customerName: lead.customerName ?? automationCandidate.customerName ?? null,
        latestReplyState: lead.replyState,
        latestActivityAt: lead.latestInteractionAt?.toISOString() ?? null,
        isAfterHours,
        approvedTemplateExample: templateExample,
        threadMessages
      }
    });
    const riskyWarnings = new Set<LeadReplyDraftWarningCode>();
    const drafts = generated.drafts.map((draft, index) => {
      for (const warning of evaluateLeadReplyDraftRisk({
        subject: values.channel === "EMAIL" ? draft.subject ?? null : null,
        body: draft.body
      })) {
        riskyWarnings.add(warning);
      }

      return {
        id: `${requestId}:${index + 1}`,
        title: draft.title,
        subject: values.channel === "EMAIL" ? draft.subject ?? null : null,
        body: draft.body.trim()
      } satisfies LeadReplyDraftSuggestion;
    });

    const finalWarnings = normalizeWarnings([
      ...contextWarnings,
      ...riskyWarnings,
      ...(generated.needs_human_reply ? (["INSUFFICIENT_CONTEXT"] as const) : [])
    ]);
    const safeDrafts =
      riskyWarnings.size > 0
        ? buildFallbackLeadReplyDrafts({
            channel: values.channel,
            customerName: lead.customerName ?? automationCandidate.customerName ?? null,
            businessName,
            serviceType,
            isAfterHours
          }).map((draft, index) => ({
            id: `${requestId}:fallback:${index + 1}`,
            title: draft.title,
            subject: draft.subject,
            body: draft.body
          }))
        : drafts;

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: lead.business?.id ?? lead.businessId ?? undefined,
      actionType: "lead.reply.ai-draft.generate",
      status: "SUCCESS",
      correlationId: requestId,
      upstreamReference: lead.externalLeadId,
      requestSummary: toJsonValue({
        channel: values.channel,
        variantCount: values.variantCount,
        threadMessageCount: threadMessages.length
      }),
      responseSummary: toJsonValue({
        draftCount: safeDrafts.length,
        needsHumanReply: generated.needs_human_reply || finalWarnings.length > 0,
        warningCodes: finalWarnings.map((warning) => warning.code)
      })
    });

    logInfo("lead.reply.ai_draft.generated", {
      tenantId,
      leadId,
      requestId,
      channel: values.channel,
      draftCount: safeDrafts.length,
      warningCodes: finalWarnings.map((warning) => warning.code)
    });

    return {
      requestId,
      channel: values.channel,
      generatedAt: new Date().toISOString(),
      needsHumanReply: generated.needs_human_reply || finalWarnings.length > 0,
      warnings: finalWarnings,
      drafts: safeDrafts
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate an AI reply draft.";

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: lead.business?.id ?? lead.businessId ?? undefined,
      actionType: "lead.reply.ai-draft.generate",
      status: "FAILED",
      correlationId: requestId,
      upstreamReference: lead.externalLeadId,
      requestSummary: toJsonValue({
        channel: values.channel,
        variantCount: values.variantCount,
        threadMessageCount: threadMessages.length
      }),
      responseSummary: toJsonValue({
        message
      })
    });

    logError("lead.reply.ai_draft.failed", {
      tenantId,
      leadId,
      requestId,
      channel: values.channel,
      message
    });

    throw error;
  }
}

export async function recordLeadReplyDraftUsageWorkflow(
  tenantId: string,
  actorId: string,
  leadId: string,
  input: unknown
) {
  const values = leadReplyDraftUsageSchema.parse(input);
  const lead = await getLeadRecordById(tenantId, leadId);

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: lead.business?.id ?? lead.businessId ?? undefined,
    actionType: "lead.reply.ai-draft.discard",
    status: "SUCCESS",
    correlationId: values.requestId,
    upstreamReference: lead.externalLeadId,
    requestSummary: toJsonValue({
      draftId: values.draftId ?? null
    }),
    responseSummary: toJsonValue({
      action: values.action
    })
  });

  logInfo("lead.reply.ai_draft.discarded", {
    tenantId,
    leadId,
    requestId: values.requestId,
    draftId: values.draftId ?? null
  });

  return {
    status: "RECORDED" as const
  };
}
