import "server-only";

export type FetchWithRetryOptions = RequestInit & {
  retries?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  retryOnStatus?: number[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(input: string | URL | Request, options: FetchWithRetryOptions = {}) {
  const {
    retries = 2,
    timeoutMs = 15_000,
    retryDelayMs = 500,
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
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      if (attempt === retries) {
        throw error;
      }
    }

    await sleep(retryDelayMs * 2 ** attempt);
  }

  throw lastError ?? new Error("Request failed");
}
