import "server-only";

import { z } from "zod";

import type { LeadAutomationChannel } from "@prisma/client";

import { extractLeadReplyThreadContext, evaluateLeadReplyDraftRisk, isAiReplyAssistantConfigured } from "@/features/leads/ai-reply-service";
import { claimProviderRequestBudget } from "@/features/operations/provider-budget-service";
import type { LeadAutomationCandidate, LeadAutomationRuleCandidate, LeadAutomationVariableBag } from "@/features/autoresponder/logic";
import { getServerEnv } from "@/lib/utils/env";
import { fetchWithRetry } from "@/lib/utils/fetch";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const aiMessageSchema = z.object({
  subject: z.string().trim().min(1).max(200).nullable().optional(),
  body: z.string().trim().min(1).max(900)
});

export type LeadAutomationAiRenderResult = {
  usedAi: boolean;
  subject: string;
  body: string;
  model: string | null;
  fallbackReason: string | null;
  warningCodes: string[];
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

function sanitizeAiBody(value: string) {
  return value.replace(/^\s*\[automated.*?\]\s*/i, "").trim();
}

async function createOpenAiLeadAutomationMessage(params: {
  channel: LeadAutomationChannel;
  model: string;
  guidance: string;
  fallbackSubject: string;
  fallbackBody: string;
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
                "You generate live autoresponder messages for Yelp lead conversations. " +
                "Stay concise, operational, and polite. " +
                "Do not mention that you are AI. Do not include the automated disclosure line because the platform adds it. " +
                "Do not quote prices, promise estimates, promise arrival times, promise availability, invent services or coverage, or make legal, warranty, licensing, or compliance claims. " +
                "Keep the message thread-safe and ask for a clear next step in Yelp when useful."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Use this business guidance for the reply:\n" +
                `${params.guidance}\n\n` +
                "If the context is too thin or risky, produce a safe generic reply based on the fallback.\n\n" +
                JSON.stringify({
                  channel: params.channel,
                  fallbackSubject: params.fallbackSubject,
                  fallbackBody: params.fallbackBody,
                  context: params.context
                })
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "lead_autoresponder_message",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              subject: {
                type: ["string", "null"]
              },
              body: {
                type: "string"
              }
            },
            required: ["subject", "body"]
          }
        }
      }
    }),
    retries: 1,
    timeoutMs: 20_000
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = getStringAtPath(payload, ["error", "message"]) ?? "OpenAI autoresponder generation failed.";
    throw new Error(message);
  }

  const outputText = extractOutputText(payload);

  if (!outputText) {
    throw new Error("OpenAI did not return autoresponder text.");
  }

  return aiMessageSchema.parse(JSON.parse(outputText));
}

export async function generateLeadAutomationAiMessageFromGuidance(params: {
  tenantId: string;
  lead: LeadAutomationCandidate;
  model: string;
  channel: LeadAutomationChannel;
  guidance: string;
  fallbackSubject: string;
  fallbackBody: string;
  variables: LeadAutomationVariableBag;
  contextLabel: string;
  extraContext?: Record<string, unknown>;
}): Promise<LeadAutomationAiRenderResult> {
  if (!isAiReplyAssistantConfigured()) {
    return {
      usedAi: false,
      subject: params.fallbackSubject,
      body: params.fallbackBody,
      model: null,
      fallbackReason: "AI_NOT_CONFIGURED",
      warningCodes: []
    };
  }

  const threadMessages = extractLeadReplyThreadContext(
    (params.lead.events ?? []).map((event) => ({
      actorType: event.actorType ?? null,
      occurredAt: event.occurredAt ?? null,
      payloadJson: event.payloadJson ?? null,
      isReply: event.isReply ?? false
    }))
  );

  try {
    await claimProviderRequestBudget({
      tenantId: params.tenantId,
      provider: "OPENAI",
      operation: "autoresponder.reply"
    });
    const generated = await createOpenAiLeadAutomationMessage({
      channel: params.channel,
      model: params.model,
      guidance: params.guidance,
      fallbackSubject: params.fallbackSubject,
      fallbackBody: params.fallbackBody,
      context: {
        contextLabel: params.contextLabel,
        leadReference: params.lead.externalLeadId,
        businessName: params.lead.business?.name ?? null,
        locationName: params.lead.location?.name ?? params.lead.business?.location?.name ?? null,
        serviceType: params.lead.serviceCategory?.name ?? params.lead.mappedServiceLabel ?? null,
        customerName: params.lead.customerName,
        latestThreadState: params.lead.internalStatus,
        latestThreadMessages: threadMessages,
        variables: params.variables,
        ...(params.extraContext ?? {})
      }
    });

    const subject = params.channel === "EMAIL"
      ? (generated.subject?.trim() || params.fallbackSubject)
      : params.fallbackSubject;
    const body = sanitizeAiBody(generated.body);
    const warningCodes = evaluateLeadReplyDraftRisk({
      subject: params.channel === "EMAIL" ? subject : null,
      body
    });

    if (!body || warningCodes.length > 0) {
      return {
        usedAi: false,
        subject: params.fallbackSubject,
        body: params.fallbackBody,
        model: params.model,
        fallbackReason: warningCodes.length > 0 ? "AI_RISK_GUARDRAIL" : "AI_EMPTY_MESSAGE",
        warningCodes
      };
    }

    return {
      usedAi: true,
      subject,
      body,
      model: params.model,
      fallbackReason: null,
      warningCodes: []
    };
  } catch {
    return {
      usedAi: false,
      subject: params.fallbackSubject,
      body: params.fallbackBody,
      model: params.model,
      fallbackReason: "AI_REQUEST_FAILED",
      warningCodes: []
    };
  }
}

export async function generateLeadAutomationAiMessage(params: {
  tenantId: string;
  lead: LeadAutomationCandidate;
  rule: LeadAutomationRuleCandidate;
  model: string;
  channel: LeadAutomationChannel;
  guidance: string;
  fallbackSubject: string;
  fallbackBody: string;
  variables: LeadAutomationVariableBag;
  cadenceLabel: string;
}): Promise<LeadAutomationAiRenderResult> {
  return generateLeadAutomationAiMessageFromGuidance({
    tenantId: params.tenantId,
    lead: params.lead,
    model: params.model,
    channel: params.channel,
    guidance: params.guidance,
    fallbackSubject: params.fallbackSubject,
    fallbackBody: params.fallbackBody,
    variables: params.variables,
    contextLabel: params.cadenceLabel
  });
}
