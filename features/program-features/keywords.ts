import { z } from "zod";

export const MAX_BLOCKED_KEYWORDS = 100;
export const MAX_KEYWORD_LENGTH = 80;

export function normalizeBlockedKeywords(values: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ");
    const key = normalized.toLocaleLowerCase("en-US");

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export const negativeKeywordUpdateSchema = z
  .object({
    type: z.literal("NEGATIVE_KEYWORD_TARGETING"),
    blockedKeywords: z.array(z.string()).max(MAX_BLOCKED_KEYWORDS),
  })
  .transform((value) => ({
    ...value,
    blockedKeywords: normalizeBlockedKeywords(value.blockedKeywords),
  }))
  .pipe(
    z.object({
      type: z.literal("NEGATIVE_KEYWORD_TARGETING"),
      blockedKeywords: z
        .array(z.string().min(1).max(MAX_KEYWORD_LENGTH))
        .max(MAX_BLOCKED_KEYWORDS),
    }),
  );

export type NegativeKeywordUpdate = z.infer<typeof negativeKeywordUpdateSchema>;

export type KeywordWriteMode = "LIVE" | "DEMO" | "READ_ONLY";

export function resolveKeywordWriteMode({
  canWrite,
  capabilityEnabled,
  demoMode,
  providerLoaded,
  supported,
}: {
  canWrite: boolean;
  capabilityEnabled: boolean;
  demoMode: boolean;
  providerLoaded: boolean;
  supported: boolean;
}): KeywordWriteMode {
  if (!canWrite) {
    return "READ_ONLY";
  }

  if (demoMode) {
    return "DEMO";
  }

  return capabilityEnabled && providerLoaded && supported
    ? "LIVE"
    : "READ_ONLY";
}

export function keywordSetsMatch(expected: string[], actual: string[]) {
  const canonicalize = (values: string[]) =>
    normalizeBlockedKeywords(values)
      .map((value) => value.toLocaleLowerCase("en-US"))
      .sort();

  return (
    JSON.stringify(canonicalize(expected)) ===
    JSON.stringify(canonicalize(actual))
  );
}
