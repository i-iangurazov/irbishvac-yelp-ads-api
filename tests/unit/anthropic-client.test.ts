import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchWithRetry } = vi.hoisted(() => ({ fetchWithRetry: vi.fn() }));

vi.mock("@/lib/utils/fetch", () => ({ fetchWithRetry }));
vi.mock("@/lib/utils/env", () => ({
  getServerEnv: () => ({ ANTHROPIC_API_KEY: "test-anthropic-key" }),
}));

import {
  AnthropicGenerationError,
  createAnthropicJsonMessage,
} from "@/features/autoresponder/anthropic-client";

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Anthropic JSON client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed JSON with all available token categories", async () => {
    fetchWithRetry.mockResolvedValue(
      response({
        content: [{ type: "text", text: '{"body":"Hello"}' }],
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_creation_input_tokens: 30,
          cache_read_input_tokens: 40,
        },
      }),
    );

    await expect(
      createAnthropicJsonMessage({
        model: "claude-sonnet-4-6",
        system: "System policy",
        user: "Untrusted lead content",
      }),
    ).resolves.toMatchObject({
      json: { body: "Hello" },
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheCreationInputTokens: 30,
        cacheReadInputTokens: 40,
      },
    });
    expect(fetchWithRetry).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "test-anthropic-key" }),
      }),
    );
  });

  it("preserves charged usage when Claude returns malformed JSON", async () => {
    fetchWithRetry.mockResolvedValue(
      response({
        content: [{ type: "text", text: "not json" }],
        usage: { input_tokens: 80, output_tokens: 10 },
      }),
    );

    const error = await createAnthropicJsonMessage({
      model: "claude-haiku-4-5",
      system: "System policy",
      user: "Lead content",
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(AnthropicGenerationError);
    expect(error).toMatchObject({
      message: "Claude returned malformed JSON.",
      usage: {
        inputTokens: 80,
        outputTokens: 10,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
    });
  });

  it("does not expose provider response details for failed requests", async () => {
    fetchWithRetry.mockResolvedValue(
      response(
        { error: { message: "invalid x-api-key test-anthropic-key" } },
        401,
      ),
    );

    const error = await createAnthropicJsonMessage({
      model: "claude-opus-4-6",
      system: "System policy",
      user: "Lead content",
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(AnthropicGenerationError);
    expect(error.message).not.toContain("test-anthropic-key");
    expect(error.message).toContain("[REDACTED]");
  });
});
