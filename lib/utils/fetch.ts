import "server-only";

export type FetchWithRetryOptions = RequestInit & {
  retries?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  jitterRatio?: number;
  retryOnStatus?: number[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: string | null) {
  if (!value) {
    return null;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryAt = Date.parse(value);

  if (Number.isNaN(retryAt)) {
    return null;
  }

  return Math.max(0, retryAt - Date.now());
}

export async function fetchWithRetry(input: string | URL | Request, options: FetchWithRetryOptions = {}) {
  const {
    retries = 2,
    timeoutMs = 15_000,
    retryDelayMs = 500,
    maxRetryDelayMs = 10_000,
    jitterRatio = 0.2,
    retryOnStatus = [408, 429, 500, 502, 503, 504],
    ...init
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
        cache: "no-store"
      });

      clearTimeout(timeout);

      if (!retryOnStatus.includes(response.status) || attempt === retries) {
        return response;
      }

      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      const baseDelayMs = Math.min(maxRetryDelayMs, retryDelayMs * 2 ** attempt);
      const jitterMs = Math.round(baseDelayMs * jitterRatio * Math.random());

      await sleep(Math.max(retryAfterMs ?? 0, baseDelayMs + jitterMs));
      continue;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      if (attempt === retries) {
        throw error;
      }
    }

    const baseDelayMs = Math.min(maxRetryDelayMs, retryDelayMs * 2 ** attempt);
    const jitterMs = Math.round(baseDelayMs * jitterRatio * Math.random());
    await sleep(baseDelayMs + jitterMs);
  }

  throw lastError ?? new Error("Request failed");
}
