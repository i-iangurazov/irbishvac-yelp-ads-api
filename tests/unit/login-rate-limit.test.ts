import { describe, expect, it } from "vitest";

import {
  checkLoginRateLimit,
  clearFailedLogins,
  recordFailedLogin,
} from "@/lib/auth/rate-limit";

describe("login rate limiting", () => {
  it("blocks a matching IP and email after five failed attempts", () => {
    const ip = "203.0.113.10";
    const email = "operator@example.com";
    const now = Date.now();

    clearFailedLogins(ip, email);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      recordFailedLogin(ip, email, now);
    }

    expect(checkLoginRateLimit(ip, email, now)).toMatchObject({
      allowed: false,
    });
    clearFailedLogins(ip, email);
    expect(checkLoginRateLimit(ip, email, now)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });
});
