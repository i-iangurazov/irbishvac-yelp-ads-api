import { describe, expect, it } from "vitest";

import { isCurrentLocalProgramStatus, isCurrentUpstreamProgramStatus } from "@/features/ads-programs/status";

describe("program status visibility", () => {
  it("keeps only current local program statuses visible", () => {
    expect(isCurrentLocalProgramStatus("ACTIVE")).toBe(true);
    expect(isCurrentLocalProgramStatus("SCHEDULED")).toBe(true);
    expect(isCurrentLocalProgramStatus("PROCESSING")).toBe(true);
    expect(isCurrentLocalProgramStatus("ENDED")).toBe(false);
    expect(isCurrentLocalProgramStatus("FAILED")).toBe(false);
    expect(isCurrentLocalProgramStatus("DRAFT")).toBe(false);
  });

  it("keeps only current upstream program statuses visible", () => {
    expect(isCurrentUpstreamProgramStatus("ACTIVE")).toBe(true);
    expect(isCurrentUpstreamProgramStatus("QUEUED")).toBe(true);
    expect(isCurrentUpstreamProgramStatus("PARTIAL")).toBe(true);
    expect(isCurrentUpstreamProgramStatus("INACTIVE")).toBe(false);
    expect(isCurrentUpstreamProgramStatus("ENDED")).toBe(false);
    expect(isCurrentUpstreamProgramStatus("FAILED")).toBe(false);
  });
});
