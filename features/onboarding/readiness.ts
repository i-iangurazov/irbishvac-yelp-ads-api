export const onboardingStatusValues = [
  "DRAFT",
  "CONNECTING",
  "REVIEW_REQUIRED",
  "READY",
  "ACTIVE",
  "PAUSED",
  "BLOCKED",
] as const;

export type OnboardingStatus = (typeof onboardingStatusValues)[number];

export type OnboardingCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  href: string;
};

export type OnboardingAction =
  | "CHECK"
  | "ACTIVATE"
  | "PAUSE"
  | "EMERGENCY_DISABLE"
  | "CLEAR_EMERGENCY";

export function isOnboardingActionAllowed(params: {
  action: OnboardingAction;
  canActivate: boolean;
}) {
  return params.action !== "ACTIVATE" || params.canActivate;
}

export function buildOnboardingActionTransition(params: {
  action: OnboardingAction;
  currentStatus: OnboardingStatus;
  nowIso: string;
}) {
  const nextStatus: OnboardingStatus =
    params.action === "ACTIVATE"
      ? "ACTIVE"
      : params.action === "PAUSE"
        ? "PAUSED"
        : params.action === "EMERGENCY_DISABLE"
          ? "BLOCKED"
          : params.action === "CLEAR_EMERGENCY"
            ? "PAUSED"
            : params.currentStatus;
  const statePatch = {
    ...(params.action === "ACTIVATE"
      ? {
          activatedAt: params.nowIso,
          pausedAt: null,
          emergencyDisabled: false,
        }
      : {}),
    ...(params.action === "PAUSE" ? { pausedAt: params.nowIso } : {}),
    ...(params.action === "EMERGENCY_DISABLE"
      ? {
          emergencyDisabled: true,
          emergencyDisabledAt: params.nowIso,
        }
      : {}),
    ...(params.action === "CLEAR_EMERGENCY"
      ? {
          emergencyDisabled: false,
          emergencyClearedAt: params.nowIso,
        }
      : {}),
  };

  return { nextStatus, statePatch };
}

export function deriveOnboardingReadiness(params: {
  checks: OnboardingCheck[];
  persistedStatus?: string | null;
  emergencyDisabled: boolean;
}) {
  const failedChecks = params.checks.filter((check) => !check.passed);
  const canActivate = failedChecks.length === 0 && !params.emergencyDisabled;
  const persistedStatus = onboardingStatusValues.includes(
    params.persistedStatus as OnboardingStatus,
  )
    ? (params.persistedStatus as OnboardingStatus)
    : "DRAFT";

  let status: OnboardingStatus;

  if (params.emergencyDisabled) {
    status = "BLOCKED";
  } else if (persistedStatus === "PAUSED") {
    status = "PAUSED";
  } else if (persistedStatus === "ACTIVE") {
    status = canActivate ? "ACTIVE" : "BLOCKED";
  } else if (canActivate) {
    status = "READY";
  } else if (params.checks.every((check) => !check.passed)) {
    status = "DRAFT";
  } else if (
    failedChecks.some((check) =>
      ["yelp-leads", "yelp-ads", "yelp-reporting", "worker"].includes(check.id),
    )
  ) {
    status = "CONNECTING";
  } else {
    status = "REVIEW_REQUIRED";
  }

  return {
    status,
    canActivate,
    checks: params.checks,
    failedChecks,
  };
}
