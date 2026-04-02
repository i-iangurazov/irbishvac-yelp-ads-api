import { describe, expect, it } from "vitest";

import { getEnabledCapabilityLabels, normalizeCapabilityFlags } from "@/features/settings/capabilities";

describe("capability flag normalization", () => {
  it("mirrors the new has* flags into the legacy Yelp runtime aliases", () => {
    const normalized = normalizeCapabilityFlags({
      hasAdsApi: true,
      hasLeadsApi: true,
      hasReportingApi: true,
      hasPartnerSupportApi: true
    });

    expect(normalized.adsApiEnabled).toBe(true);
    expect(normalized.dataIngestionApiEnabled).toBe(true);
    expect(normalized.reportingApiEnabled).toBe(true);
    expect(normalized.businessMatchApiEnabled).toBe(true);
  });

  it("hydrates the new operations flags from the legacy stored aliases", () => {
    const normalized = normalizeCapabilityFlags({
      adsApiEnabled: true,
      reportingApiEnabled: true,
      dataIngestionApiEnabled: true,
      businessMatchApiEnabled: true
    });

    expect(normalized.hasAdsApi).toBe(true);
    expect(normalized.hasReportingApi).toBe(true);
    expect(normalized.hasLeadsApi).toBe(true);
    expect(normalized.hasPartnerSupportApi).toBe(true);
  });

  it("returns human labels only for the curated capability set", () => {
    const labels = getEnabledCapabilityLabels(
      normalizeCapabilityFlags({
        hasAdsApi: true,
        hasCrmIntegration: true,
        demoModeEnabled: true
      })
    );

    expect(labels).toEqual(["Ads API", "CRM Integration", "Demo Mode"]);
  });
});
