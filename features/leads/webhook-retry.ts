const WEBHOOK_RETRY_BASE_DELAY_MS = 60_000;
const WEBHOOK_RETRY_MAX_DELAY_MS = 60 * 60_000;

export const YELP_WEBHOOK_MAX_RETRIES = 5;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function getWebhookRetryState(statsJson: unknown) {
  const record = asRecord(statsJson);
  const retryCount =
    typeof record?.retryCount === "number" &&
    Number.isFinite(record.retryCount) &&
    record.retryCount >= 0
      ? Math.trunc(record.retryCount)
      : 0;
  const parsedNextAttemptAt =
    typeof record?.nextAttemptAt === "string"
      ? new Date(record.nextAttemptAt)
      : null;

  return {
    retryCount,
    nextAttemptAt:
      parsedNextAttemptAt && Number.isFinite(parsedNextAttemptAt.getTime())
        ? parsedNextAttemptAt
        : null,
  };
}

export function getWebhookRetryDelayMs(retryCount: number) {
  const normalizedRetryCount = Math.max(0, Math.trunc(retryCount));

  return Math.min(
    WEBHOOK_RETRY_MAX_DELAY_MS,
    WEBHOOK_RETRY_BASE_DELAY_MS * 2 ** normalizedRetryCount,
  );
}

export function getNextWebhookAttemptAt(retryCount: number, now = new Date()) {
  return new Date(now.getTime() + getWebhookRetryDelayMs(retryCount));
}

export function isWebhookRetryDue(statsJson: unknown, now = new Date()) {
  const state = getWebhookRetryState(statsJson);

  return !state.nextAttemptAt || state.nextAttemptAt <= now;
}
