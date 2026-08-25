import { describe, expect, it } from "vitest";

import {
  buildClaudeRuntimeCheck,
  buildOnboardingActionTransition,
  deriveOnboardingReadiness,
  isOnboardingActionAllowed,
  type OnboardingCheck,
} from "@/features/onboarding/readiness";
import { onboardingActivationSchema } from "@/features/onboarding/schemas";

function checks(overrides: Partial<Record<string, boolean>> = {}) {
  return ["business", "yelp-leads", "worker", "safety"].map(
    (id): OnboardingCheck => ({
      id,
      label: id,
      passed: overrides[id] ?? true,
      detail: `${id} detail`,
      href: "/settings",
    }),
  );
}

describe("onboarding readiness", () => {
  it("blocks readiness when Claude is unavailable in the deployment", () => {
    const claudeCheck = buildClaudeRuntimeCheck(false);
    const result = deriveOnboardingReadiness({
      checks: [...checks(), claudeCheck],
      persistedStatus: "DRAFT",
      emergencyDisabled: false,
    });

    expect(claudeCheck).toMatchObject({
      id: "claude-runtime",
      passed: false,
      href: "/autoresponder",
    });
    expect(result.canActivate).toBe(false);
    expect(result.failedChecks.map((check) => check.id)).toContain(
      "claude-runtime",
    );
  });

  it("allows activation only when every check passes", () => {
    const result = deriveOnboardingReadiness({
      checks: checks(),
      persistedStatus: "DRAFT",
      emergencyDisabled: false,
    });

    expect(result.status).toBe("READY");
    expect(result.canActivate).toBe(true);
    expect(result.failedChecks).toEqual([]);
  });

  it("reports connecting while provider or worker evidence is missing", () => {
    const result = deriveOnboardingReadiness({
      checks: checks({ "yelp-leads": false }),
      persistedStatus: "DRAFT",
      emergencyDisabled: false,
    });

    expect(result.status).toBe("CONNECTING");
    expect(result.canActivate).toBe(false);
    expect(result.failedChecks.map((check) => check.id)).toEqual([
      "yelp-leads",
    ]);
  });

  it("turns an active business into blocked when a required check regresses", () => {
    const result = deriveOnboardingReadiness({
      checks: checks({ worker: false }),
      persistedStatus: "ACTIVE",
      emergencyDisabled: false,
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.canActivate).toBe(false);
  });

  it("keeps emergency-disabled businesses blocked even after checks recover", () => {
    const result = deriveOnboardingReadiness({
      checks: checks(),
      persistedStatus: "ACTIVE",
      emergencyDisabled: true,
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.canActivate).toBe(false);
  });

  it("preserves an operator pause", () => {
    const result = deriveOnboardingReadiness({
      checks: checks(),
      persistedStatus: "PAUSED",
      emergencyDisabled: false,
    });

    expect(result.status).toBe("PAUSED");
    expect(result.canActivate).toBe(true);
  });
});

describe("onboarding activation confirmation", () => {
  it("blocks activation while any readiness check fails", () => {
    expect(
      isOnboardingActionAllowed({
        action: "ACTIVATE",
        canActivate: false,
      }),
    ).toBe(false);
    expect(
      isOnboardingActionAllowed({
        action: "PAUSE",
        canActivate: false,
      }),
    ).toBe(true);
  });

  it("rejects activation without the exact review-only confirmation", () => {
    expect(() =>
      onboardingActivationSchema.parse({
        businessId: "business_1",
        action: "ACTIVATE",
        confirmation: "ACTIVATE",
      }),
    ).toThrow(/ACTIVATE REVIEW ONLY/);
  });

  it("requires an explicit phrase to clear an emergency block", () => {
    expect(() =>
      onboardingActivationSchema.parse({
        businessId: "business_1",
        action: "CLEAR_EMERGENCY",
      }),
    ).toThrow(/CLEAR EMERGENCY DISABLE/);
  });

  it("produces safe activation, pause, disable, and recovery transitions", () => {
    const nowIso = "2026-08-24T12:00:00.000Z";

    expect(
      buildOnboardingActionTransition({
        action: "ACTIVATE",
        currentStatus: "READY",
        nowIso,
      }),
    ).toEqual({
      nextStatus: "ACTIVE",
      statePatch: {
        activatedAt: nowIso,
        pausedAt: null,
        emergencyDisabled: false,
      },
    });
    expect(
      buildOnboardingActionTransition({
        action: "PAUSE",
        currentStatus: "ACTIVE",
        nowIso,
      }),
    ).toEqual({
      nextStatus: "PAUSED",
      statePatch: { pausedAt: nowIso },
    });
    expect(
      buildOnboardingActionTransition({
        action: "EMERGENCY_DISABLE",
        currentStatus: "ACTIVE",
        nowIso,
      }),
    ).toEqual({
      nextStatus: "BLOCKED",
      statePatch: {
        emergencyDisabled: true,
        emergencyDisabledAt: nowIso,
      },
    });
    expect(
      buildOnboardingActionTransition({
        action: "CLEAR_EMERGENCY",
        currentStatus: "BLOCKED",
        nowIso,
      }),
    ).toEqual({
      nextStatus: "PAUSED",
      statePatch: {
        emergencyDisabled: false,
        emergencyClearedAt: nowIso,
      },
    });
  });
});
