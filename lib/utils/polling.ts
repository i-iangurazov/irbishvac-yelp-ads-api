import "server-only";

export type PollUntilOptions<T> = {
  attempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  onExhausted?: "throw" | "return-last";
  getValue: (attempt: number) => Promise<T>;
  isComplete: (value: T) => boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollUntil<T>({
  attempts = 6,
  initialDelayMs = 750,
  maxDelayMs = 12_000,
  onExhausted = "throw",
  getValue,
  isComplete
}: PollUntilOptions<T>) {
  let currentDelay = initialDelayMs;
  let lastValue: T | undefined;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await getValue(attempt);
    lastValue = value;

    if (isComplete(value)) {
      return value;
    }

    if (attempt < attempts - 1) {
      await sleep(currentDelay);
      currentDelay = Math.min(currentDelay * 2, maxDelayMs);
    }
  }

  if (onExhausted === "return-last" && lastValue !== undefined) {
    return lastValue;
  }

  throw new Error("Polling exhausted before reaching a terminal state.");
}
