import { describe, expect, it } from "vitest";

import { pollUntil } from "@/lib/utils/polling";

describe("pollUntil", () => {
  it("returns when a terminal state is reached", async () => {
    let attemptCount = 0;

    const result = await pollUntil({
      attempts: 4,
      initialDelayMs: 1,
      getValue: async () => {
        attemptCount += 1;
        return attemptCount >= 3 ? { status: "COMPLETED" } : { status: "PROCESSING" };
      },
      isComplete: (value) => value.status === "COMPLETED"
    });

    expect(result.status).toBe("COMPLETED");
    expect(attemptCount).toBe(3);
  });

  it("can return the last value instead of throwing when polling is exhausted", async () => {
    let attemptCount = 0;

    const result = await pollUntil({
      attempts: 3,
      initialDelayMs: 1,
      onExhausted: "return-last",
      getValue: async () => {
        attemptCount += 1;
        return { status: "PROCESSING", attempt: attemptCount };
      },
      isComplete: (value) => value.status === "COMPLETED"
    });

    expect(result).toEqual({ status: "PROCESSING", attempt: 3 });
    expect(attemptCount).toBe(3);
  });
});
