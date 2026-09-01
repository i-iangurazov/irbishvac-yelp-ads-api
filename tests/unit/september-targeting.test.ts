import { describe, expect, it } from "vitest";

import {
  getSeptemberLayerBlockedKeywords,
  resolveSeptemberBoostBlockedKeywords,
} from "@/features/ads-programs/september-targeting";

describe("September service targeting policies", () => {
  it("retains the verified policy sizes for every HVAC layer", () => {
    expect(
      getSeptemberLayerBlockedKeywords("SEPTEMBER_HVAC_REPAIR"),
    ).toHaveLength(39);
    expect(
      getSeptemberLayerBlockedKeywords("SEPTEMBER_HVAC_INSTALLATION"),
    ).toHaveLength(36);
    expect(
      getSeptemberLayerBlockedKeywords("SEPTEMBER_HVAC_MAINTENANCE"),
    ).toHaveLength(38);
    expect(
      getSeptemberLayerBlockedKeywords("SEPTEMBER_COMMERCIAL_HVAC"),
    ).toHaveLength(22);
  });

  it("uses the exact repair policy for repair-only Boost focus", () => {
    expect(resolveSeptemberBoostBlockedKeywords(["HVAC_REPAIR"])).toEqual(
      getSeptemberLayerBlockedKeywords("SEPTEMBER_HVAC_REPAIR"),
    );
  });

  it("allows terms needed by selected Plumbing and Water Heater categories", () => {
    const policy = resolveSeptemberBoostBlockedKeywords([
      "HVAC_REPAIR",
      "PLUMBING",
      "WATER_HEATER",
    ]);

    expect(policy).not.toContain("plumbing");
    expect(policy).not.toContain("faucet repair");
    expect(policy).not.toContain("tankless water heater");
    expect(policy).toContain("central air conditioning installation");
  });

  it("clears service exclusions for all-HVAC or non-HVAC focus", () => {
    expect(
      resolveSeptemberBoostBlockedKeywords([
        "HVAC_REPAIR",
        "HVAC_INSTALLATION",
        "HVAC_MAINTENANCE",
      ]),
    ).toEqual([]);
    expect(
      resolveSeptemberBoostBlockedKeywords(["PLUMBING", "WATER_HEATER"]),
    ).toEqual([]);
  });
});
