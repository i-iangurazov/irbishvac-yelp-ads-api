import { describe, expect, it } from "vitest";

import {
  getNextWebhookAttemptAt,
  getWebhookRetryDelayMs,
  getWebhookRetryState,
  isWebhookRetryDue,
  YELP_WEBHOOK_MAX_RETRIES,
} from "@/features/leads/webhook-retry";

describe("Yelp webhook retry policy", () => {
  it("uses bounded exponential backoff", () => {
    expect(getWebhookRetryDelayMs(0)).toBe(60_000);
    expect(getWebhookRetryDelayMs(1)).toBe(120_000);
    expect(getWebhookRetryDelayMs(5)).toBe(1_920_000);
    expect(getWebhookRetryDelayMs(20)).toBe(3_600_000);
    expect(YELP_WEBHOOK_MAX_RETRIES).toBe(5);
  });

  it("does not retry before nextAttemptAt", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const nextAttemptAt = getNextWebhookAttemptAt(2, now);
    const stats = {
      retryCount: 2,
      nextAttemptAt: nextAttemptAt.toISOString(),
    };

    expect(getWebhookRetryState(stats)).toEqual({
      retryCount: 2,
      nextAttemptAt,
    });
    expect(isWebhookRetryDue(stats, now)).toBe(false);
    expect(isWebhookRetryDue(stats, nextAttemptAt)).toBe(true);
  });

  it("treats malformed retry metadata as a first due attempt", () => {
    expect(
      getWebhookRetryState({
        retryCount: -1,
        nextAttemptAt: "invalid",
      }),
    ).toEqual({
      retryCount: 0,
      nextAttemptAt: null,
    });
    expect(isWebhookRetryDue(null)).toBe(true);
  });
});
