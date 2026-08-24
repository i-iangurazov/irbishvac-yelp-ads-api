import { createAnthropicJsonMessage } from "../features/autoresponder/anthropic-client";
import { resolveLeadAiModel } from "../features/autoresponder/config";

async function main() {
  const model = resolveLeadAiModel();
  const response = await createAnthropicJsonMessage({
    model,
    system:
      "This is a production connectivity check. Return only valid JSON with exactly one boolean key named ok.",
    user: 'Return {"ok":true}.',
    maxTokens: 32,
  });
  const payload =
    typeof response.json === "object" && response.json !== null
      ? (response.json as Record<string, unknown>)
      : {};

  console.log(
    JSON.stringify({
      ok: payload.ok === true,
      provider: "ANTHROPIC",
      model,
      latencyMs: response.latencyMs,
      usage: response.usage,
    }),
  );

  if (payload.ok !== true) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      ok: false,
      provider: "ANTHROPIC",
      category: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Unknown Anthropic connectivity failure.",
    }),
  );
  process.exitCode = 1;
});
