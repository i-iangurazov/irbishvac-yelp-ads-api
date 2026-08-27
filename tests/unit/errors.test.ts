import { describe, expect, it } from "vitest";

import {
  normalizeUnknownError,
  normalizeYelpError,
  YelpValidationError,
} from "@/lib/yelp/errors";

describe("error normalization", () => {
  it("passes through known Yelp errors", () => {
    const error = new YelpValidationError("Bad input");
    expect(normalizeUnknownError(error)).toBe(error);
  });

  it("wraps unknown errors into a generic API error", () => {
    const error = normalizeUnknownError(new Error("boom"));
    expect(error.code).toBe("UNKNOWN_ERROR");
    expect(error.status).toBe(500);
  });

  it.each([400, 422])(
    "preserves Yelp's upstream %s validation status",
    async (status) => {
      const error = await normalizeYelpError(
        new Response(JSON.stringify({ error: "invalid" }), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );

      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.status).toBe(status);
    },
  );
});
