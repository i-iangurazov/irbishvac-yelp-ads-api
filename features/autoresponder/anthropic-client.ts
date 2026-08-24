import "server-only";

import { z } from "zod";

import { fetchWithRetry } from "@/lib/utils/fetch";
import { getServerEnv } from "@/lib/utils/env";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

const anthropicResponseSchema = z.object({
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
    }),
  ),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_creation_input_tokens: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .default(0),
    cache_read_input_tokens: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .default(0),
  }),
});

export type AnthropicUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
};

export class AnthropicGenerationError extends Error {
  readonly usage: AnthropicUsage | null;
  readonly latencyMs: number;

  constructor(
    message: string,
    params: {
      usage?: AnthropicUsage | null;
      latencyMs: number;
      cause?: unknown;
    },
  ) {
    super(message, { cause: params.cause });
    this.name = "AnthropicGenerationError";
    this.usage = params.usage ?? null;
    this.latencyMs = params.latencyMs;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getErrorMessage(payload: unknown) {
  const record = asRecord(payload);
  const error = asRecord(record?.error);
  return typeof error?.message === "string" && error.message.trim()
    ? error.message.trim()
    : "Anthropic request failed.";
}

function parseJsonText(value: string) {
  const trimmed = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("Claude did not return a JSON object.");
  }

  return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as unknown;
}

export function isAnthropicConfigured() {
  return Boolean(getServerEnv().ANTHROPIC_API_KEY?.trim());
}

export async function createAnthropicJsonMessage(params: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}) {
  const startedAt = Date.now();
  const apiKey = getServerEnv().ANTHROPIC_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  let response: Response;

  try {
    response = await fetchWithRetry(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens ?? 1_024,
        temperature: 0.2,
        system: params.system,
        messages: [
          {
            role: "user",
            content: params.user,
          },
        ],
      }),
      retries: 1,
      timeoutMs: 20_000,
    });
  } catch (error) {
    throw new AnthropicGenerationError(
      "Claude request failed before a response was received.",
      {
        latencyMs: Date.now() - startedAt,
        cause: error,
      },
    );
  }
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AnthropicGenerationError(
      getErrorMessage(payload).replaceAll(apiKey, "[REDACTED]"),
      {
        latencyMs: Date.now() - startedAt,
      },
    );
  }

  const parsed = anthropicResponseSchema.parse(payload);
  const usage: AnthropicUsage = {
    inputTokens: parsed.usage.input_tokens,
    outputTokens: parsed.usage.output_tokens,
    cacheCreationInputTokens: parsed.usage.cache_creation_input_tokens,
    cacheReadInputTokens: parsed.usage.cache_read_input_tokens,
  };
  const outputText = parsed.content
    .filter((item) => item.type === "text")
    .map((item) => item.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n");

  if (!outputText) {
    throw new AnthropicGenerationError("Claude did not return message text.", {
      usage,
      latencyMs: Date.now() - startedAt,
    });
  }

  try {
    return {
      json: parseJsonText(outputText),
      usage,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    throw new AnthropicGenerationError("Claude returned malformed JSON.", {
      usage,
      latencyMs: Date.now() - startedAt,
      cause: error,
    });
  }
}
