import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchWithRetry } from "@/lib/utils/fetch";

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries retryable status responses and returns the successful retry", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const response = await fetchWithRetry("https://example.com/test", {
      retries: 1,
      retryDelayMs: 0,
      maxRetryDelayMs: 0,
      jitterRatio: 0
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("stops retrying once the retry budget is exhausted", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("still failing", { status: 503 }));

    const response = await fetchWithRetry("https://example.com/test", {
      retries: 2,
      retryDelayMs: 0,
      maxRetryDelayMs: 0,
      jitterRatio: 0
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(response.status).toBe(503);
  });
});
