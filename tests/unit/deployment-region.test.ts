import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("deployment region", () => {
  it("runs Vercel functions beside the us-east-1 production database", () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
    ) as { regions?: string[] };

    expect(config.regions).toEqual(["iad1"]);
  });
});
