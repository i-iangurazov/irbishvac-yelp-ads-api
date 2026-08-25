import "server-only";

import { isAnthropicConfigured } from "@/features/autoresponder/anthropic-client";
import { leadAutoresponderSettingsSchema } from "@/features/autoresponder/schemas";
import { getAnthropicMonthlySpendState } from "@/features/autoresponder/anthropic-budget";
import { readLeadAutoresponderSettings } from "@/features/autoresponder/config";
import { LEAD_AUTORESPONDER_SETTING_KEY } from "@/features/autoresponder/constants";
import { recordAuditEvent } from "@/features/audit/service";
import {
  buildClaudeRuntimeCheck,
  buildOnboardingActionTransition,
  deriveOnboardingReadiness,
  isOnboardingActionAllowed,
  type OnboardingCheck,
} from "@/features/onboarding/readiness";
import {
  onboardingActivationSchema,
  tenantOnboardingCreateSchema,
} from "@/features/onboarding/schemas";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { toJsonValue } from "@/lib/db/json";
import { getServerEnv } from "@/lib/utils/env";
import { YelpValidationError } from "@/lib/yelp/errors";

const WORKER_FRESHNESS_MS = 30 * 60 * 1000;
const RECENT_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function credentialConfigured(
  credential:
    | {
        isEnabled: boolean;
        secretEncrypted: string | null;
        usernameEncrypted: string | null;
      }
    | undefined,
  usernameRequired: boolean,
) {
  return Boolean(
    credential?.isEnabled &&
    credential.secretEncrypted &&
    (!usernameRequired || credential.usernameEncrypted),
  );
}

function isSuccessfulEvidenceDate(value: unknown) {
  return (
    (value instanceof Date && !Number.isNaN(value.getTime())) ||
    (typeof value === "string" && !Number.isNaN(Date.parse(value)))
  );
}

export async function getTenantOnboardingOverview(
  tenantId: string,
  now = new Date(),
) {
  const recentFailureSince = new Date(now.getTime() - RECENT_FAILURE_WINDOW_MS);
  const [
    tenant,
    businesses,
    clientAdminCount,
    credentials,
    rawSettings,
    worker,
    recentFailedWorkerCount,
  ] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true },
    }),
    prisma.business.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        encryptedYelpBusinessId: true,
        readinessJson: true,
        leadAutomationOverrides: {
          take: 1,
          select: {
            isEnabled: true,
            aiAssistEnabled: true,
            aiModel: true,
            conversationMode: true,
          },
        },
        leadAutomationRules: {
          where: { isEnabled: true },
          select: {
            id: true,
            onlyDuringWorkingHours: true,
            timezone: true,
            startMinute: true,
            endMinute: true,
          },
        },
        leadAutomationTemplates: {
          where: { isEnabled: true, channel: "YELP_THREAD" },
          select: { id: true },
        },
        programs: {
          where: {
            upstreamProgramId: { not: null },
            lastSyncedAt: { not: null },
          },
          orderBy: { lastSyncedAt: "desc" },
          take: 1,
          select: { lastSyncedAt: true },
        },
        reportResults: {
          where: {
            reportRequest: {
              status: "READY",
              upstreamRequestId: { not: null },
            },
          },
          orderBy: { fetchedAt: "desc" },
          take: 1,
          select: { fetchedAt: true },
        },
        yelpReportingSnapshots: {
          where: {
            freshnessState: "FINAL",
            lastSuccessfulSyncAt: { not: null },
          },
          orderBy: { lastSuccessfulSyncAt: "desc" },
          take: 1,
          select: { lastSuccessfulSyncAt: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    }),
    prisma.user.count({
      where: { tenantId, isActive: true, role: { code: "CLIENT_ADMIN" } },
    }),
    prisma.credentialSet.findMany({
      where: {
        tenantId,
        kind: {
          in: ["ADS_BASIC_AUTH", "REPORTING_FUSION"],
        },
      },
      select: {
        kind: true,
        isEnabled: true,
        lastTestStatus: true,
        lastTestedAt: true,
        secretEncrypted: true,
        usernameEncrypted: true,
      },
    }),
    prisma.systemSetting.findUnique({
      where: {
        tenantId_key: { tenantId, key: LEAD_AUTORESPONDER_SETTING_KEY },
      },
      select: { valueJson: true },
    }),
    prisma.workerJob.findFirst({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      orderBy: [{ lastHeartbeatAt: "desc" }, { updatedAt: "desc" }],
      select: {
        status: true,
        lastHeartbeatAt: true,
        updatedAt: true,
        lastErrorSummary: true,
      },
    }),
    prisma.workerJob.count({
      where: {
        OR: [{ tenantId }, { tenantId: null }],
        status: { in: ["FAILED", "DEAD_LETTERED"] },
        updatedAt: { gte: recentFailureSince },
      },
    }),
  ]);
  const settings = readLeadAutoresponderSettings(rawSettings?.valueJson);
  const usage = await getAnthropicMonthlySpendState({
    tenantId,
    limits: {
      monthlyBudgetUsd: settings.aiMonthlyBudgetUsd,
      monthlyMessageLimit: settings.aiMonthlyMessageLimit,
      monthlyTokenLimit: settings.aiMonthlyTokenLimit,
      warningPercent: settings.aiUsageWarningPercent,
      agencyMarkupPercent: settings.aiAgencyMarkupPercent,
    },
    now,
  });
  const credentialByKind = new Map(
    credentials.map((credential) => [credential.kind, credential]),
  );
  const latestWorkerActivity = worker?.lastHeartbeatAt ?? worker?.updatedAt;
  const workerFresh = Boolean(
    latestWorkerActivity &&
    now.getTime() - latestWorkerActivity.getTime() <= WORKER_FRESHNESS_MS,
  );
  const platformKillSwitch =
    getServerEnv().AUTORESPONDER_GLOBAL_KILL_SWITCH === "true";

  const businessStates = businesses.map((business) => {
    const readiness = asRecord(business.readinessJson);
    const override = business.leadAutomationOverrides[0] ?? null;
    const leadsReady =
      readiness.yelpLeadReadinessCheckStatus === "READY" &&
      isSuccessfulEvidenceDate(readiness.yelpLeadReadinessCheckedAt);
    const adsReady =
      credentialConfigured(credentialByKind.get("ADS_BASIC_AUTH"), true) &&
      isSuccessfulEvidenceDate(business.programs[0]?.lastSyncedAt);
    const reportingReady =
      credentialConfigured(credentialByKind.get("REPORTING_FUSION"), false) &&
      (isSuccessfulEvidenceDate(business.reportResults[0]?.fetchedAt) ||
        isSuccessfulEvidenceDate(
          business.yelpReportingSnapshots[0]?.lastSuccessfulSyncAt,
        ));
    const hasWorkingHours = business.leadAutomationRules.some(
      (rule) =>
        rule.onlyDuringWorkingHours &&
        Boolean(rule.timezone) &&
        rule.startMinute !== null &&
        rule.endMinute !== null &&
        rule.endMinute > rule.startMinute,
    );
    const checks: OnboardingCheck[] = [
      {
        id: "business",
        label: "Yelp business mapped",
        passed: Boolean(business.encryptedYelpBusinessId),
        detail: "A tenant-scoped Yelp business identifier is saved.",
        href: `/businesses/${business.id}`,
      },
      {
        id: "client-admin",
        label: "Client administrator assigned",
        passed: clientAdminCount > 0,
        detail: "At least one active Client administrator must own setup.",
        href: "/settings",
      },
      {
        id: "yelp-leads",
        label: "Yelp Leads connection passed",
        passed: leadsReady,
        detail:
          "A business-scoped read of Yelp /v3/businesses/{businessId}/lead_ids must succeed.",
        href: `/businesses/${business.id}`,
      },
      {
        id: "yelp-ads",
        label: "Yelp Ads connection passed",
        passed: adsReady,
        detail:
          "The Ads credential must be configured and a live program inventory must be synchronized for this business.",
        href: `/businesses/${business.id}`,
      },
      {
        id: "yelp-reporting",
        label: "Yelp reporting connection passed",
        passed: reportingReady,
        detail:
          "A provider-backed report result or current Yelp reporting snapshot must exist for this business.",
        href: "/reporting",
      },
      {
        id: "claude-plan",
        label: "Claude tier and usage plan assigned",
        passed: Boolean(
          rawSettings &&
          settings.aiAllowedModels.includes(settings.aiModel) &&
          settings.aiMonthlyBudgetUsd > 0 &&
          settings.aiMonthlyMessageLimit > 0 &&
          settings.aiMonthlyTokenLimit > 0,
        ),
        detail:
          "An operator-approved Claude tier, allowlist, warning and hard limits are required.",
        href: "/autoresponder",
      },
      buildClaudeRuntimeCheck(isAnthropicConfigured()),
      {
        id: "review-only",
        label: "Review-only business policy",
        passed: Boolean(
          override?.isEnabled &&
          override.aiAssistEnabled &&
          override.conversationMode === "REVIEW_ONLY" &&
          settings.aiAllowedModels.some((model) => model === override.aiModel),
        ),
        detail:
          "Every new external client starts with Claude drafts requiring human review.",
        href: `/autoresponder?overrideBusinessId=${business.id}`,
      },
      {
        id: "business-hours",
        label: "Business hours configured",
        passed: hasWorkingHours,
        detail:
          "An enabled business-scoped rule must include timezone and sending hours.",
        href: "/autoresponder",
      },
      {
        id: "fallback",
        label: "Deterministic fallback configured",
        passed: business.leadAutomationTemplates.length > 0,
        detail:
          "An enabled Yelp-thread template is required when Claude cannot be used.",
        href: "/autoresponder",
      },
      {
        id: "worker",
        label: "Background worker healthy",
        passed: workerFresh && recentFailedWorkerCount === 0,
        detail: workerFresh
          ? `${recentFailedWorkerCount} failed or dead-lettered jobs in the last 24 hours.`
          : "No worker heartbeat was observed in the last 30 minutes.",
        href: "/audit",
      },
      {
        id: "safety",
        label: "Safety controls clear",
        passed: Boolean(
          !platformKillSwitch &&
          !settings.tenantKillSwitchEnabled &&
          !usage.hardLimitReached,
        ),
        detail:
          "Platform/tenant kill switches must be off and the Claude hard limit must have capacity.",
        href: "/autoresponder",
      },
    ];
    const state = deriveOnboardingReadiness({
      checks,
      persistedStatus:
        typeof readiness.onboardingStatus === "string"
          ? readiness.onboardingStatus
          : null,
      emergencyDisabled: readiness.emergencyDisabled === true,
    });

    return {
      id: business.id,
      name: business.name,
      city: business.city,
      state: business.state,
      emergencyDisabled: readiness.emergencyDisabled === true,
      ...state,
    };
  });

  return {
    tenant,
    businessStates,
    summary: {
      total: businessStates.length,
      ready: businessStates.filter((state) => state.status === "READY").length,
      active: businessStates.filter((state) => state.status === "ACTIVE")
        .length,
      blocked: businessStates.filter((state) => state.status === "BLOCKED")
        .length,
    },
    diagnostics: {
      workerFresh,
      workerStatus: worker?.status ?? null,
      latestWorkerActivity: latestWorkerActivity ?? null,
      recentFailedWorkerCount,
      usageHardLimitReached: usage.hardLimitReached,
    },
  };
}

export async function applyBusinessOnboardingAction(
  tenantId: string,
  actorId: string,
  input: unknown,
) {
  const values = onboardingActivationSchema.parse(input);
  const business = await prisma.business.findFirstOrThrow({
    where: { id: values.businessId, tenantId },
    select: { id: true, readinessJson: true },
  });
  const overview = await getTenantOnboardingOverview(tenantId);
  const current = overview.businessStates.find(
    (state) => state.id === business.id,
  );

  if (!current) {
    throw new YelpValidationError(
      "The selected business is not available in the active tenant.",
    );
  }

  if (
    !isOnboardingActionAllowed({
      action: values.action,
      canActivate: current.canActivate,
    })
  ) {
    throw new YelpValidationError(
      `Activation blocked: ${current.failedChecks.map((check) => check.label).join(", ")}.`,
    );
  }

  const now = new Date().toISOString();
  const existing = asRecord(business.readinessJson);
  const transition = buildOnboardingActionTransition({
    action: values.action,
    currentStatus: current.status,
    nowIso: now,
  });
  const nextStatus = transition.nextStatus;
  const nextReadiness = {
    ...existing,
    onboardingManaged: true,
    onboardingStatus: nextStatus,
    onboardingLastCheckedAt: now,
    onboardingFailedChecks: current.failedChecks.map((check) => check.id),
    ...transition.statePatch,
    ...(values.action === "CLEAR_EMERGENCY"
      ? { emergencyClearedBy: actorId }
      : {}),
  };

  await prisma.business.updateMany({
    where: { id: business.id, tenantId },
    data: { readinessJson: toJsonValue(nextReadiness) },
  });
  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: business.id,
    actionType: `business.onboarding.${values.action.toLowerCase()}`,
    status: "SUCCESS",
    before: {
      onboardingStatus: existing.onboardingStatus ?? null,
      emergencyDisabled: existing.emergencyDisabled === true,
    },
    after: {
      onboardingStatus: nextStatus,
      emergencyDisabled: nextReadiness.emergencyDisabled === true,
      failedCheckIds: current.failedChecks.map((check) => check.id),
    },
  });

  return {
    businessId: business.id,
    status: nextStatus,
    canActivate: values.action === "ACTIVATE" || current.canActivate,
  };
}

export function buildNewTenantAutoresponderSettings() {
  return leadAutoresponderSettingsSchema.parse({
    isEnabled: false,
    tenantKillSwitchEnabled: true,
    conversationAutomationEnabled: false,
    conversationGlobalPauseEnabled: true,
    conversationMode: "REVIEW_ONLY",
  });
}

export async function createClientTenantWorkflow(
  actorId: string,
  input: unknown,
) {
  const values = tenantOnboardingCreateSchema.parse(input);
  const existing = await prisma.user.findUnique({
    where: { email: values.clientAdminEmail.toLowerCase() },
    select: { id: true },
  });

  if (existing) {
    throw new YelpValidationError("A user with this email already exists.");
  }

  const safeSettings = buildNewTenantAutoresponderSettings();
  const passwordHash = await hashPassword(values.temporaryPassword);
  const result = await prisma.$transaction(async (tx) => {
    const role = await tx.role.findUniqueOrThrow({
      where: { code: "CLIENT_ADMIN" },
    });
    const tenant = await tx.tenant.create({
      data: { name: values.tenantName, slug: values.tenantSlug },
    });
    const clientAdmin = await tx.user.create({
      data: {
        tenantId: tenant.id,
        roleId: role.id,
        name: values.clientAdminName,
        email: values.clientAdminEmail.toLowerCase(),
        passwordHash,
      },
      select: { id: true, name: true, email: true },
    });
    await tx.systemSetting.create({
      data: {
        tenantId: tenant.id,
        key: LEAD_AUTORESPONDER_SETTING_KEY,
        valueJson: toJsonValue(safeSettings),
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId: tenant.id,
        actorId,
        actionType: "tenant.onboarding.create",
        status: "SUCCESS",
        responseSummaryJson: toJsonValue({
          tenantId: tenant.id,
          clientAdminId: clientAdmin.id,
          roleCode: "CLIENT_ADMIN",
          defaultMode: "REVIEW_ONLY",
          activationState: "DRAFT",
        }),
      },
    });

    return { tenant, clientAdmin };
  });

  return {
    tenant: result.tenant,
    clientAdmin: result.clientAdmin,
    defaultMode: "REVIEW_ONLY" as const,
  };
}
