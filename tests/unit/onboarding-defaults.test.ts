import { describe, expect, it } from "vitest";

import { buildNewTenantAutoresponderSettings } from "@/features/onboarding/service";

describe("new external-client defaults", () => {
  it("starts every client paused and in review-only mode", () => {
    const settings = buildNewTenantAutoresponderSettings();

    expect(settings.isEnabled).toBe(false);
    expect(settings.tenantKillSwitchEnabled).toBe(true);
    expect(settings.conversationAutomationEnabled).toBe(false);
    expect(settings.conversationGlobalPauseEnabled).toBe(true);
    expect(settings.conversationMode).toBe("REVIEW_ONLY");
  });
});
