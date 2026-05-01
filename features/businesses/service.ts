import "server-only";

import { isCurrentLocalProgramStatus, isCurrentUpstreamProgramStatus } from "@/features/ads-programs/status";
import {
  deleteBusinessRecord,
  findBusinessByEncryptedYelpBusinessId,
  getBusinessById,
  getBusinessDeleteImpact,
  listBusinesses,
  updateBusinessRecord,
  upsertBusiness
} from "@/lib/db/businesses-repository";
import { ensureYelpAccess, ensureYelpBusinessSubscriptionsAccess, ensureYelpLeadsAccess, getCapabilityFlags } from "@/lib/yelp/runtime";
import { normalizeYelpCategories } from "@/lib/yelp/categories";
import { YelpAdsClient } from "@/lib/yelp/ads-client";
import { YelpBusinessMatchClient } from "@/lib/yelp/business-match-client";
import { YelpDataIngestionClient } from "@/lib/yelp/data-ingestion-client";
import { YelpLeadsClient } from "@/lib/yelp/leads-client";
import { yelpBusinessMatchResponseSchema, type YelpUpstreamProgramDto } from "@/lib/yelp/schemas";
import {
  businessSearchSchema,
  deleteBusinessFormSchema,
  readinessPatchSchema,
  yelpBusinessSubscriptionActionSchema
} from "@/features/businesses/schemas";
import { getLeadAutomationScopeConfig } from "@/features/autoresponder/config";
import { buildYelpForwarderAllowlistState, parseYelpAllowedBusinessIds } from "@/features/businesses/yelp-forwarder-allowlist";
import { buildYelpLeadOnboardingState } from "@/features/businesses/yelp-lead-onboarding";
import { extractLeadIdsResponse } from "@/features/leads/yelp-sync";
import { recordAuditEvent } from "@/features/audit/service";
import { getServerEnv } from "@/lib/utils/env";
import { normalizeUnknownError, YelpValidationError } from "@/lib/yelp/errors";

type ReadinessState = {
  hasAboutText: boolean;
  hasCategories: boolean;
  missingItems: string[];
  isReadyForCpc: boolean;
  adsEligibilityStatus: "UNKNOWN" | "ELIGIBLE" | "BLOCKED";
  adsEligibilityMessage?: string;
};

type LiveProgramInventoryState = {
  enabled: boolean;
  message: string | null;
  programs: Array<
    YelpUpstreamProgramDto & {
      localProgramId: string | null;
      localProgramStatus: string | null;
    }
  >;
};

type OperationalPostureItem = {
  id: string;
  label: string;
  status: string;
  value: string;
  detail: string;
  href?: string;
};

type OperationalWarning = {
  id: string;
  status: string;
  title: string;
  detail: string;
  href?: string;
};

type YelpConnectionProof = {
  id: string;
  label: string;
  status: string;
  value: string;
  detail: string;
  occurredAt: Date | null;
};

const LIVE_PROGRAM_DISPLAY_LIMIT = 10;
const YELP_WEBHOOK_SUBSCRIPTION_TYPE = "WEBHOOK" as const;
const liveProgramStatusOrder = new Map([
  ["ACTIVE", 0],
  ["SCHEDULED", 1],
  ["QUEUED", 2],
  ["PROCESSING", 3],
  ["PARTIAL", 4],
  ["FAILED", 5],
  ["INACTIVE", 6],
  ["ENDED", 7]
]);

function sortProgramsByMostRecentActivity(programs: YelpUpstreamProgramDto[]) {
  return [...programs].sort((left, right) => {
    const leftDate = left.end_date && left.end_date !== "9999-12-31" ? left.end_date : left.start_date ?? "";
    const rightDate = right.end_date && right.end_date !== "9999-12-31" ? right.end_date : right.start_date ?? "";
    const dateRank = String(rightDate).localeCompare(String(leftDate));

    if (dateRank !== 0) {
      return dateRank;
    }

    const statusRank = (liveProgramStatusOrder.get(left.program_status) ?? 99) - (liveProgramStatusOrder.get(right.program_status) ?? 99);

    if (statusRank !== 0) {
      return statusRank;
    }

    return right.program_id.localeCompare(left.program_id);
  });
}

function countJsonArray(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function asReadinessRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readDateValue(record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readStringValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumberValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBooleanValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function summarizeReportRecipients(schedule: Awaited<ReturnType<typeof getBusinessById>>["reportSchedules"][number]) {
  const accountRecipients = countJsonArray(schedule.recipientEmailsJson);
  const locationOverrides = countJsonArray(schedule.locationRecipientOverridesJson);
  const recipientLabel = accountRecipients === 1 ? "1 account recipient" : `${accountRecipients} account recipients`;

  return locationOverrides > 0 ? `${recipientLabel}, ${locationOverrides} location routes` : recipientLabel;
}

function buildBusinessOperationalSummary(params: {
  business: Awaited<ReturnType<typeof getBusinessById>>;
  capabilities: Awaited<ReturnType<typeof getCapabilityFlags>>;
  automationScope: Awaited<ReturnType<typeof getLeadAutomationScopeConfig>>;
  currentPrograms: Awaited<ReturnType<typeof getBusinessById>>["programs"];
  readiness: ReadinessState;
  liveProgramInventory: LiveProgramInventoryState;
}) {
  const { business, capabilities, automationScope, currentPrograms, readiness, liveProgramInventory } = params;
  const latestLead = business.yelpLeads[0] ?? null;
  const override = automationScope.override ?? business.leadAutomationOverrides[0] ?? null;
  const effectiveAutomation = automationScope.effectiveSettings;
  const activeReportSchedules = business.reportSchedules.filter((schedule) => schedule.isEnabled);
  const openIssues = business.operatorIssues;
  const activePrograms = currentPrograms.filter((program) => program.status === "ACTIVE" || program.status === "SCHEDULED");
  const inFlightPrograms = currentPrograms.filter((program) => program.status === "QUEUED" || program.status === "PROCESSING");
  const failedPrograms = currentPrograms.filter((program) => program.status === "FAILED" || program.status === "PARTIAL");
  const latestSync = business.syncRuns.find((run) => run.status === "COMPLETED" || run.status === "PARTIAL" || run.status === "FAILED") ?? null;
  const yelpProofAt = latestLead?.latestWebhookReceivedAt ?? latestLead?.lastSyncedAt ?? latestLead?.latestInteractionAt ?? null;
  const yelpConnectionStatus =
    !business.encryptedYelpBusinessId || !capabilities.hasLeadsApi
      ? "FAILED"
      : latestLead?.latestWebhookStatus === "FAILED"
        ? "FAILED"
        : yelpProofAt
          ? "READY"
          : "UNKNOWN";
  const yelpConnectionDetail =
    yelpConnectionStatus === "READY"
      ? latestLead?.latestWebhookReceivedAt
        ? "Webhook proof exists for this business."
        : "Lead sync proof exists for this business."
      : yelpConnectionStatus === "FAILED"
        ? capabilities.hasLeadsApi
          ? "Yelp lead proof is missing or failed."
          : "Yelp Leads access is not enabled for this tenant."
        : "Configured, but no lead traffic proof yet.";
  const automationStatus = effectiveAutomation.isEnabled ? "READY" : "INACTIVE";
  const automationDetail = override
    ? override.isEnabled
      ? `${override.defaultChannel}; ${override.followUp24hEnabled || override.followUp7dEnabled ? "follow-ups enabled" : "follow-ups off"}; AI ${override.aiAssistEnabled ? "on" : "off"}.`
      : "Business override exists and autoresponder is disabled."
    : effectiveAutomation.isEnabled
      ? `${effectiveAutomation.defaultChannel}; tenant default covers this business; ${effectiveAutomation.followUp24hEnabled || effectiveAutomation.followUp7dEnabled ? "follow-ups enabled" : "follow-ups off"}; AI ${effectiveAutomation.aiAssistEnabled ? "on" : "off"}.`
      : automationScope.defaults.isEnabled
        ? "Tenant defaults are enabled, but this business is outside the selected scope."
        : "Tenant default autoresponder is off.";
  const conversationStatus = effectiveAutomation.conversationAutomationEnabled ? effectiveAutomation.conversationMode : "INACTIVE";
  const programStatus =
    failedPrograms.length > 0 ? "FAILED" : inFlightPrograms.length > 0 ? "PROCESSING" : activePrograms.length > 0 ? "ACTIVE" : "INACTIVE";
  const connectorStatus =
    !capabilities.hasCrmIntegration
      ? "INACTIVE"
      : business.location?.externalCrmLocationId
        ? "READY"
        : business.location
          ? "UNMAPPED"
          : "UNMAPPED";
  const reportStatus = activeReportSchedules.length > 0 ? "READY" : "UNKNOWN";
  const issueStatus = openIssues.length > 0 ? "OPEN" : "READY";
  const reportDetail =
    activeReportSchedules.length > 0
      ? summarizeReportRecipients(activeReportSchedules[0])
      : business.reportRequests.length > 0
        ? "Manual reports exist; no recurring delivery is enabled."
        : "No recurring report delivery configured.";
  const items: OperationalPostureItem[] = [
    {
      id: "yelp",
      label: "Yelp connection",
      status: yelpConnectionStatus,
      value: yelpConnectionStatus === "READY" ? "Proof found" : yelpConnectionStatus === "FAILED" ? "Needs setup" : "No traffic yet",
      detail: yelpConnectionDetail
    },
    {
      id: "automation",
      label: "Autoresponder",
      status: automationStatus,
      value: override
        ? override.isEnabled
          ? "Enabled here"
          : "Disabled here"
        : effectiveAutomation.isEnabled
          ? "Tenant default"
          : "Off",
      detail: automationDetail,
      href: "/autoresponder"
    },
    {
      id: "conversation",
      label: "Conversation mode",
      status: conversationStatus,
      value: effectiveAutomation.conversationAutomationEnabled ? effectiveAutomation.conversationMode.replaceAll("_", " ") : "Off",
      detail: effectiveAutomation.conversationAutomationEnabled
        ? override
          ? "Conversation policy is controlled by the business override."
          : "Conversation policy is controlled by tenant defaults for this business."
        : "Conversation automation is not enabled for this business.",
      href: "/autoresponder"
    },
    {
      id: "programs",
      label: "Programs",
      status: programStatus,
      value: `${currentPrograms.length} current`,
      detail:
        currentPrograms.length > 0
          ? `${activePrograms.length} active or scheduled, ${inFlightPrograms.length} in flight.`
          : readiness.isReadyForCpc
            ? "Ready for a new CPC request."
            : readiness.missingItems[0] ?? "No current programs.",
      href: currentPrograms[0] ? `/programs/${currentPrograms[0].id}` : `/programs/new?businessId=${business.id}`
    },
    {
      id: "servicetitan",
      label: "ServiceTitan mapping",
      status: connectorStatus,
      value: business.location?.name ?? "No location",
      detail: business.location?.externalCrmLocationId
        ? `External location ${business.location.externalCrmLocationId}.`
        : capabilities.hasCrmIntegration
          ? "Assign a mapped location before relying on downstream lifecycle sync."
          : "CRM connector is not enabled.",
      href: "/integrations"
    },
    {
      id: "reports",
      label: "Report delivery",
      status: reportStatus,
      value: activeReportSchedules.length > 0 ? `${activeReportSchedules.length} enabled` : "Not scheduled",
      detail: reportDetail,
      href: "/reporting"
    },
    {
      id: "issues",
      label: "Open issues",
      status: issueStatus,
      value: String(openIssues.length),
      detail: openIssues[0]?.title ?? "No open operator issues for this business.",
      href: "/audit"
    }
  ];
  const warnings: OperationalWarning[] = [];

  if (business._count.yelpLeads > 0 && !override && !automationScope.defaultsApplyToBusiness) {
    warnings.push({
      id: "automation-outside-scope",
      status: "UNKNOWN",
      title: "Leads exist outside autoresponder scope",
      detail: "This business has Yelp leads, but effective autoresponder settings do not cover it.",
      href: "/autoresponder"
    });
  }

  if (effectiveAutomation.isEnabled && yelpConnectionStatus !== "READY") {
    warnings.push({
      id: "automation-without-yelp-proof",
      status: "FAILED",
      title: "Automation is enabled before Yelp proof is strong",
      detail: "Confirm webhook or backfill proof before relying on automatic replies.",
      href: "/autoresponder"
    });
  }

  if (capabilities.hasCrmIntegration && business._count.yelpLeads > 0 && !business.location?.externalCrmLocationId) {
    warnings.push({
      id: "missing-servicetitan-location",
      status: "UNMAPPED",
      title: "ServiceTitan location mapping is incomplete",
      detail: "Leads can arrive, but downstream lifecycle sync may not route cleanly.",
      href: "/integrations"
    });
  }

  if (currentPrograms.some((program) => program.status !== "DRAFT" && !program.upstreamProgramId)) {
    warnings.push({
      id: "program-without-upstream-id",
      status: "UNKNOWN",
      title: "A local program has no confirmed Yelp ID",
      detail: "Open the program and review the latest Yelp job before treating it as settled."
    });
  }

  if (latestSync?.status === "FAILED" || latestSync?.status === "PARTIAL") {
    warnings.push({
      id: "latest-sync-not-clean",
      status: latestSync.status,
      title: "Latest sync did not complete cleanly",
      detail: latestSync.errorSummary ?? `${latestSync.type} ended with ${latestSync.status.toLowerCase()}.`,
      href: "/audit"
    });
  }

  if (openIssues.length > 0) {
    warnings.push({
      id: "open-issues",
      status: "OPEN",
      title: "Open operator issues need review",
      detail: `${openIssues.length} issue${openIssues.length === 1 ? "" : "s"} currently linked to this business.`,
      href: "/audit"
    });
  }

  return {
    items,
    warnings,
    counts: {
      leads: business._count.yelpLeads,
      programs: business._count.programs,
      reports: business._count.reportSchedules,
      openIssues: openIssues.length,
      mappings: business._count.mappings
    }
  };
}

function buildYelpConnectionProofTrail(params: {
  business: Awaited<ReturnType<typeof getBusinessById>>;
  forwarderAllowlist: ReturnType<typeof buildYelpForwarderAllowlistState>;
  latestLeadSyncRun: Awaited<ReturnType<typeof getBusinessById>>["syncRuns"][number] | null;
}): YelpConnectionProof[] {
  const { business, forwarderAllowlist, latestLeadSyncRun } = params;
  const readiness = asReadinessRecord(business.readinessJson);
  const latestLead = business.yelpLeads[0] ?? null;
  const latestSend = business.leadAutomationAttempts[0] ?? null;
  const leadReadStatus = readStringValue(readiness, "yelpLeadReadinessCheckStatus");
  const leadReadCheckedAt = readDateValue(readiness, "yelpLeadReadinessCheckedAt");
  const leadReadCorrelationId = readStringValue(readiness, "yelpLeadReadinessCheckCorrelationId");
  const leadReadReturnedLeadIds = readNumberValue(readiness, "yelpLeadReadinessReturnedLeadIds");
  const leadReadHasMore = readBooleanValue(readiness, "yelpLeadReadinessHasMore");
  const leadReadErrorMessage = readStringValue(readiness, "yelpLeadReadinessCheckErrorMessage");
  const subscriptionRequestedAt = readDateValue(readiness, "yelpLeadSubscriptionRequestedAt");
  const subscriptionVerifiedAt = readDateValue(readiness, "yelpLeadSubscriptionVerifiedAt");
  const subscriptionStatus = readStringValue(readiness, "yelpLeadSubscriptionStatus");
  const subscriptionRequestCorrelationId = readStringValue(readiness, "yelpLeadSubscriptionRequestCorrelationId");
  const subscriptionVerificationCorrelationId = readStringValue(readiness, "yelpLeadSubscriptionVerificationCorrelationId");
  const subscribedAt = readDateValue(readiness, "yelpLeadSubscriptionSubscribedAt");
  const webhookProofAt = latestLead?.latestWebhookReceivedAt ?? null;
  const reconcileProofAt = latestLeadSyncRun?.lastSuccessfulSyncAt ?? latestLeadSyncRun?.finishedAt ?? latestLead?.lastSyncedAt ?? null;
  const sendProofAt = latestSend?.completedAt ?? latestSend?.triggeredAt ?? null;

  return [
    {
      id: "forwarder-allowlist",
      label: "Forwarder allowlist",
      status: forwarderAllowlist.status,
      value: forwarderAllowlist.label,
      detail: forwarderAllowlist.detail,
      occurredAt: null
    },
    {
      id: "leads-api-read",
      label: "Leads API read",
      status: leadReadStatus === "READY" ? "READY" : leadReadStatus === "FAILED" ? "FAILED" : "UNKNOWN",
      value:
        leadReadStatus === "READY"
          ? "Read verified"
          : leadReadStatus === "FAILED"
            ? "Read failed"
            : "Not checked",
      detail:
        leadReadStatus === "READY"
          ? `Yelp returned ${leadReadReturnedLeadIds ?? 0} recent lead ID${leadReadReturnedLeadIds === 1 ? "" : "s"}${leadReadHasMore ? " and more are available" : ""}${leadReadCorrelationId ? ` (${leadReadCorrelationId})` : ""}.`
          : leadReadStatus === "FAILED"
            ? leadReadErrorMessage ?? "The last Leads API read check failed."
            : "Run Check Leads API to verify this business is readable by the configured Yelp token.",
      occurredAt: leadReadCheckedAt
    },
    {
      id: "subscription-request",
      label: "Subscription request",
      status: subscriptionRequestedAt ? "REQUESTED" : "UNKNOWN",
      value: subscriptionRequestedAt ? "Requested" : "Not requested here",
      detail: subscriptionRequestedAt
        ? `Async Yelp WEBHOOK subscription request accepted${subscriptionRequestCorrelationId ? ` (${subscriptionRequestCorrelationId})` : ""}.`
        : "No in-app Yelp webhook subscription request is recorded for this business.",
      occurredAt: subscriptionRequestedAt
    },
    {
      id: "subscription-verification",
      label: "Subscription verification",
      status: subscriptionStatus === "CONFIRMED" ? "READY" : subscriptionStatus === "NOT_FOUND" ? "UNKNOWN" : "UNKNOWN",
      value:
        subscriptionStatus === "CONFIRMED"
          ? "Confirmed"
          : subscriptionStatus === "NOT_FOUND"
            ? "Not found"
            : "Not checked",
      detail:
        subscriptionStatus === "CONFIRMED"
          ? `Yelp returned this business in the WEBHOOK subscription list${subscriptionVerificationCorrelationId ? ` (${subscriptionVerificationCorrelationId})` : ""}.`
          : subscriptionStatus === "NOT_FOUND"
            ? "Yelp did not return this business in the WEBHOOK subscription list at the last check."
            : "Run Check subscription after Yelp has had time to process the async request.",
      occurredAt: subscriptionStatus === "CONFIRMED" ? subscribedAt ?? subscriptionVerifiedAt : subscriptionVerifiedAt
    },
    {
      id: "webhook-proof",
      label: "Webhook proof",
      status: latestLead?.latestWebhookStatus ?? "UNKNOWN",
      value: webhookProofAt ? "Webhook received" : "No webhook yet",
      detail: webhookProofAt
        ? `Latest recorded webhook status is ${latestLead?.latestWebhookStatus?.toLowerCase() ?? "unknown"}.`
        : "No live webhook receipt is recorded for this business yet.",
      occurredAt: webhookProofAt
    },
    {
      id: "reconcile-proof",
      label: "Reconcile proof",
      status: latestLeadSyncRun?.status ?? (latestLead?.lastSyncedAt ? "READY" : "UNKNOWN"),
      value: reconcileProofAt ? "Lead fetch completed" : "No reconcile proof",
      detail: latestLeadSyncRun
        ? `${latestLeadSyncRun.type.replaceAll("_", " ").toLowerCase()} ended with ${latestLeadSyncRun.status.toLowerCase()} status.`
        : latestLead?.lastSyncedAt
          ? "A local lead sync timestamp exists for this business."
          : "Run reconcile after webhook/subscription setup and confirm leads update locally.",
      occurredAt: reconcileProofAt
    },
    {
      id: "thread-send-proof",
      label: "Thread send proof",
      status: latestSend ? "SENT" : "UNKNOWN",
      value: latestSend ? "Send recorded" : "No send yet",
      detail: latestSend
        ? `${latestSend.cadence.replaceAll("_", " ").toLowerCase()} sent by ${latestSend.channel?.replaceAll("_", " ").toLowerCase() ?? "unknown channel"}${latestSend.providerMessageId ? ` (${latestSend.providerMessageId})` : ""}.`
        : "No successful autoresponder/thread send is recorded for this business yet.",
      occurredAt: sendProofAt
    }
  ];
}

export function buildCpcReadiness(readinessJson: unknown, categoriesJson: unknown): ReadinessState {
  const categories = normalizeYelpCategories(categoriesJson);
  const readiness = typeof readinessJson === "object" && readinessJson !== null ? readinessJson : {};
  const persistedEligibilityStatus =
    typeof (readiness as Record<string, unknown>).adsEligibilityStatus === "string"
      ? ((readiness as Record<string, unknown>).adsEligibilityStatus as string)
      : undefined;
  const adsEligibilityBlocked =
    Boolean((readiness as Record<string, unknown>).adsEligibilityBlocked) || persistedEligibilityStatus === "INELIGIBLE";
  const adsEligibilityMessage =
    typeof (readiness as Record<string, unknown>).adsEligibilityMessage === "string"
      ? ((readiness as Record<string, unknown>).adsEligibilityMessage as string)
      : undefined;
  const adsEligibilityStatus =
    persistedEligibilityStatus === "ELIGIBLE" ? "ELIGIBLE" : adsEligibilityBlocked ? "BLOCKED" : "UNKNOWN";
  const hasAboutText = Boolean(
    (readiness as Record<string, unknown>).hasAboutText ?? (readiness as Record<string, unknown>).aboutThisBusiness
  );
  const hasCategories = categories.length > 0 || Boolean((readiness as Record<string, unknown>).hasCategories);
  const missingItems = [
    ...(adsEligibilityBlocked
      ? [adsEligibilityMessage ?? "This business is not eligible for Yelp Ads because Yelp marked it as an advertising-restricted category."]
      : []),
    ...(hasAboutText ? [] : ["Add specialties/about-this-business text"]),
    ...(hasCategories ? [] : ["Add at least one category"])
  ];

  return {
    hasAboutText,
    hasCategories,
    missingItems,
    isReadyForCpc: missingItems.length === 0,
    adsEligibilityStatus,
    adsEligibilityMessage
  };
}

export async function getBusinessesIndex(tenantId: string, search?: string) {
  const [businesses, capabilities] = await Promise.all([listBusinesses(tenantId, search), getCapabilityFlags(tenantId)]);

  return businesses.map((business) => ({
    ...business,
    categories: normalizeYelpCategories(business.categoriesJson),
    readiness: buildCpcReadiness(business.readinessJson, business.categoriesJson),
    capabilityState: {
      businessMatchApiEnabled: capabilities.businessMatchApiEnabled,
      dataIngestionApiEnabled: capabilities.dataIngestionApiEnabled
    }
  }));
}

export async function getBusinessDetail(tenantId: string, businessId: string) {
  const [business, deleteImpact] = await Promise.all([getBusinessById(businessId, tenantId), getBusinessDeleteImpact(businessId, tenantId)]);
  const [capabilities, automationScope] = await Promise.all([
    getCapabilityFlags(tenantId),
    getLeadAutomationScopeConfig(tenantId, businessId)
  ]);
  const currentPrograms = business.programs.filter(
    (program: (typeof business.programs)[number]) => isCurrentLocalProgramStatus(program.status)
  );
  const readiness = buildCpcReadiness(business.readinessJson, business.categoriesJson);
  const latestLeadSyncRun =
    business.syncRuns.find((run) => run.type === "YELP_LEADS_WEBHOOK" || run.type === "YELP_LEADS_BACKFILL") ?? null;
  const forwarderAllowlist = buildYelpForwarderAllowlistState({
    encryptedYelpBusinessId: business.encryptedYelpBusinessId,
    allowedBusinessIds: parseYelpAllowedBusinessIds(getServerEnv().YELP_ALLOWED_BUSINESS_IDS)
  });
  const yelpConnectionProofTrail = buildYelpConnectionProofTrail({
    business,
    forwarderAllowlist,
    latestLeadSyncRun
  });
  const yelpLeadOnboarding = buildYelpLeadOnboardingState({
    encryptedYelpBusinessId: business.encryptedYelpBusinessId,
    hasLeadsApi: capabilities.hasLeadsApi,
    readinessJson: business.readinessJson,
    latestLead: business.yelpLeads[0] ?? null,
    latestLeadSyncRun,
    leadCount: business._count.yelpLeads,
    autoresponderEnabled: automationScope.effectiveSettings.isEnabled,
    conversationAutomationEnabled: automationScope.effectiveSettings.conversationAutomationEnabled,
    hasBusinessOverride: Boolean(automationScope.override),
    forwarderAllowlist
  });
  let liveProgramInventory: LiveProgramInventoryState = {
    enabled: capabilities.adsApiEnabled,
    message: capabilities.adsApiEnabled ? null : "Not enabled by Yelp / missing credentials.",
    programs: []
  };

  if (capabilities.adsApiEnabled) {
    try {
      const { credential } = await ensureYelpAccess({
        tenantId,
        capabilityKey: "adsApiEnabled",
        credentialKind: "ADS_BASIC_AUTH"
      });
      const client = new YelpAdsClient(credential);
      const response = await client.listPrograms(business.encryptedYelpBusinessId);
      const upstreamPrograms =
        response.data.businesses.find(
          (entry: (typeof response.data.businesses)[number]) => entry.yelp_business_id === business.encryptedYelpBusinessId
        )?.programs ?? [];
      const localProgramMap = new Map(
        business.programs
          .filter((program) => Boolean(program.upstreamProgramId))
          .map((program) => [program.upstreamProgramId as string, program])
      );
      const currentUpstreamPrograms = sortProgramsByMostRecentActivity(
        upstreamPrograms.filter((program: (typeof upstreamPrograms)[number]) => isCurrentUpstreamProgramStatus(program.program_status))
      );

      liveProgramInventory = {
        enabled: true,
        message:
          currentUpstreamPrograms.length === 0
            ? upstreamPrograms.length > 0
              ? "No active Yelp programs."
              : null
            : currentUpstreamPrograms.length > LIVE_PROGRAM_DISPLAY_LIMIT
              ? `Showing the latest ${LIVE_PROGRAM_DISPLAY_LIMIT} of ${currentUpstreamPrograms.length} active Yelp programs.`
            : null,
        programs: currentUpstreamPrograms
          .slice(0, LIVE_PROGRAM_DISPLAY_LIMIT)
          .map((program) => {
            const localProgram = localProgramMap.get(program.program_id);
            return {
              ...program,
              localProgramId: localProgram?.id ?? null,
              localProgramStatus: localProgram?.status ?? null
            };
          })
      };
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      liveProgramInventory = {
        enabled: false,
        message: normalized.message,
        programs: []
      };
    }
  }

  return {
    ...business,
    currentPrograms,
    categories: normalizeYelpCategories(business.categoriesJson),
    readiness,
    yelpLeadOnboarding,
    yelpConnectionProofTrail,
    liveProgramInventory,
    operationalSummary: buildBusinessOperationalSummary({
      business,
      capabilities,
      automationScope,
      currentPrograms,
      readiness,
      liveProgramInventory
    }),
    deleteImpact: {
      mappings: deleteImpact._count.mappings,
      programs: deleteImpact._count.programs,
      programJobs: deleteImpact._count.programJobs,
      featureSnapshots: deleteImpact._count.featureSnapshots,
      reportRequests: deleteImpact._count.reportRequests,
      reportResults: deleteImpact._count.reportResults,
      auditEvents: deleteImpact._count.auditEvents
    }
  };
}

export async function searchBusinessesForOnboarding(tenantId: string, input: unknown) {
  const data = businessSearchSchema.parse(input);
  const local = await listBusinesses(tenantId, data.query);

  try {
    const { credential } = await ensureYelpAccess({
      tenantId,
      capabilityKey: "businessMatchApiEnabled",
      credentialKind: "BUSINESS_MATCH"
    });
    const client = new YelpBusinessMatchClient(credential);
    const remote = await client.matchBusiness({
      name: data.query,
      location: data.location
    });
    const parsed = yelpBusinessMatchResponseSchema.parse(remote.data);

    return {
      local,
      remote: parsed.matches
    };
  } catch (error) {
    return {
      local,
      remote: [],
      remoteState: {
        message: error instanceof Error ? error.message : "Business Match API is unavailable."
      }
    };
  }
}

export async function saveBusinessRecord(
  tenantId: string,
  actorId: string,
  match: {
    source?: "manual" | "match";
    encrypted_business_id: string;
    name: string;
    city?: string;
    state?: string;
    country?: string;
    categories?: Array<string | { label: string; alias?: string }>;
    readiness?: {
      hasAboutText?: boolean;
      hasCategories?: boolean;
      missingItems?: string[];
    };
  }
) {
  const existing = await findBusinessByEncryptedYelpBusinessId(tenantId, match.encrypted_business_id);
  const existingReadiness =
    typeof existing?.readinessJson === "object" && existing.readinessJson !== null
      ? (existing.readinessJson as Record<string, unknown>)
      : {};
  const incomingReadiness = typeof match.readiness === "object" && match.readiness !== null ? match.readiness : {};

  const business = await upsertBusiness(tenantId, match.encrypted_business_id, {
    name: match.name,
    city: match.city ?? null,
    state: match.state ?? null,
    country: match.country ?? null,
    categoriesJson: normalizeYelpCategories(match.categories ?? []),
    readinessJson: {
      ...existingReadiness,
      ...incomingReadiness
    }
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: business.id,
    actionType: match.source === "match" ? "business.match.save" : "business.manual.save",
    status: "SUCCESS",
    after: business as never
  });

  return business;
}

export async function patchBusinessReadinessFields(tenantId: string, actorId: string, input: unknown) {
  const data = readinessPatchSchema.parse(input);
  const business = await getBusinessById(data.businessId, tenantId);
  const { credential } = await ensureYelpAccess({
    tenantId,
    capabilityKey: "dataIngestionApiEnabled",
    credentialKind: "DATA_INGESTION"
  });
  const client = new YelpDataIngestionClient(credential);

  await client.patchBusinessReadinessFields(business.encryptedYelpBusinessId, {
    specialties: data.specialties,
    categories: data.categories,
    aboutThisBusiness: data.aboutThisBusiness
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: business.id,
    actionType: "business.readiness.patch",
    status: "SUCCESS",
    requestSummary: data as never
  });
}

async function findYelpWebhookSubscription(client: YelpLeadsClient, encryptedYelpBusinessId: string) {
  const limit = 100;
  let offset = 0;
  let lastCorrelationId: string | null = null;

  for (let page = 0; page < 50; page += 1) {
    const response = await client.getBusinessSubscriptions(YELP_WEBHOOK_SUBSCRIPTION_TYPE, { limit, offset });
    lastCorrelationId = response.correlationId;
    const subscriptions: Array<{ business_id: string; subscribed_at?: string | null }> = response.data.subscriptions;
    const match = subscriptions.find((subscription) => subscription.business_id === encryptedYelpBusinessId) ?? null;

    if (match) {
      return {
        found: true,
        subscription: match,
        correlationId: response.correlationId
      };
    }

    const nextOffset = offset + response.data.limit;

    if (nextOffset >= response.data.total || response.data.subscriptions.length === 0) {
      break;
    }

    offset = nextOffset;
  }

  return {
    found: false,
    subscription: null,
    correlationId: lastCorrelationId
  };
}

function mergeReadinessPatch(currentValue: unknown, patch: Record<string, unknown>) {
  return {
    ...asReadinessRecord(currentValue),
    ...patch
  };
}

export async function runBusinessYelpLeadsReadinessCheck(tenantId: string, actorId: string, businessId: string) {
  const business = await getBusinessById(businessId, tenantId);

  if (!business.encryptedYelpBusinessId) {
    throw new YelpValidationError("Save the Yelp encrypted business ID before checking Leads API access.");
  }

  const now = new Date().toISOString();

  try {
    const { credential } = await ensureYelpLeadsAccess(tenantId);
    const client = new YelpLeadsClient(credential);
    const response = await client.getBusinessLeadIds(business.encryptedYelpBusinessId, { limit: 1, offset: 0 });
    const parsed = extractLeadIdsResponse(response.data);
    const readinessJson = mergeReadinessPatch(business.readinessJson, {
      yelpLeadReadinessCheckStatus: "READY",
      yelpLeadReadinessBusinessId: business.encryptedYelpBusinessId,
      yelpLeadReadinessCheckedAt: now,
      yelpLeadReadinessCheckCorrelationId: response.correlationId,
      yelpLeadReadinessReturnedLeadIds: parsed.leadIds.length,
      yelpLeadReadinessHasMore: parsed.hasMore,
      yelpLeadReadinessCheckErrorCode: null,
      yelpLeadReadinessCheckErrorMessage: null
    });

    await updateBusinessRecord(business.id, tenantId, { readinessJson });
    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: business.id,
      actionType: "business.yelp-leads-readiness.check",
      status: "SUCCESS",
      correlationId: response.correlationId,
      requestSummary: {
        businessId: business.encryptedYelpBusinessId,
        limit: 1
      },
      responseSummary: {
        status: "READY",
        returnedLeadIds: parsed.leadIds.length,
        hasMore: parsed.hasMore
      } as never
    });

    return {
      status: "READY",
      message:
        parsed.leadIds.length > 0
          ? "Yelp Leads API can read this business."
          : "Yelp Leads API accepted the business, but no recent lead ID was returned.",
      returnedLeadIds: parsed.leadIds.length,
      hasMore: parsed.hasMore,
      correlationId: response.correlationId
    };
  } catch (error) {
    const normalized = normalizeUnknownError(error);
    const readinessJson = mergeReadinessPatch(business.readinessJson, {
      yelpLeadReadinessCheckStatus: "FAILED",
      yelpLeadReadinessBusinessId: business.encryptedYelpBusinessId,
      yelpLeadReadinessCheckedAt: now,
      yelpLeadReadinessCheckCorrelationId: null,
      yelpLeadReadinessReturnedLeadIds: 0,
      yelpLeadReadinessHasMore: false,
      yelpLeadReadinessCheckErrorCode: normalized.code,
      yelpLeadReadinessCheckErrorMessage: normalized.message
    });

    await updateBusinessRecord(business.id, tenantId, { readinessJson });
    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: business.id,
      actionType: "business.yelp-leads-readiness.check",
      status: "FAILED",
      requestSummary: {
        businessId: business.encryptedYelpBusinessId,
        limit: 1
      },
      responseSummary: {
        code: normalized.code,
        message: normalized.message
      } as never,
      rawPayloadSummary: normalized.details as never
    });

    throw normalized;
  }
}

export async function runBusinessYelpWebhookSubscriptionAction(
  tenantId: string,
  actorId: string,
  businessId: string,
  input: unknown
) {
  const data = yelpBusinessSubscriptionActionSchema.parse(input);
  const business = await getBusinessById(businessId, tenantId);

  if (!business.encryptedYelpBusinessId) {
    throw new YelpValidationError("Save the Yelp encrypted business ID before managing webhook subscriptions.");
  }

  const { credential } = await ensureYelpBusinessSubscriptionsAccess(tenantId);
  const client = new YelpLeadsClient(credential);
  const now = new Date().toISOString();

  if (data.action === "REQUEST_WEBHOOK") {
    try {
      const response = await client.subscribeBusinesses({
        subscriptionTypes: [YELP_WEBHOOK_SUBSCRIPTION_TYPE],
        businessIds: [business.encryptedYelpBusinessId]
      });
      const readinessJson = mergeReadinessPatch(business.readinessJson, {
        yelpLeadSubscriptionStatus: "REQUESTED",
        yelpLeadSubscriptionType: YELP_WEBHOOK_SUBSCRIPTION_TYPE,
        yelpLeadSubscriptionBusinessId: business.encryptedYelpBusinessId,
        yelpLeadSubscriptionRequestedAt: now,
        yelpLeadSubscriptionRequestCorrelationId: response.correlationId
      });

      await updateBusinessRecord(business.id, tenantId, { readinessJson });
      await recordAuditEvent({
        tenantId,
        actorId,
        businessId: business.id,
        actionType: "business.yelp-webhook-subscription.request",
        status: "SUCCESS",
        correlationId: response.correlationId,
        requestSummary: {
          subscriptionTypes: [YELP_WEBHOOK_SUBSCRIPTION_TYPE],
          businessIds: [business.encryptedYelpBusinessId]
        },
        responseSummary: {
          status: "REQUESTED",
          note: "Yelp accepted the async subscription request. Verification still requires a later subscription check or live webhook proof."
        } as never
      });

      return {
        action: data.action,
        status: "REQUESTED",
        message: "Yelp accepted the webhook subscription request. Check again after Yelp processes it.",
        correlationId: response.correlationId
      };
    } catch (error) {
      const normalized = normalizeUnknownError(error);

      await recordAuditEvent({
        tenantId,
        actorId,
        businessId: business.id,
        actionType: "business.yelp-webhook-subscription.request",
        status: "FAILED",
        requestSummary: {
          subscriptionTypes: [YELP_WEBHOOK_SUBSCRIPTION_TYPE],
          businessIds: [business.encryptedYelpBusinessId]
        },
        responseSummary: {
          message: normalized.message
        } as never,
        rawPayloadSummary: normalized.details as never
      });

      throw normalized;
    }
  }

  try {
    const result = await findYelpWebhookSubscription(client, business.encryptedYelpBusinessId);
    const readinessJson = mergeReadinessPatch(business.readinessJson, {
      yelpLeadSubscriptionStatus: result.found ? "CONFIRMED" : "NOT_FOUND",
      yelpLeadSubscriptionType: YELP_WEBHOOK_SUBSCRIPTION_TYPE,
      yelpLeadSubscriptionBusinessId: business.encryptedYelpBusinessId,
      yelpLeadSubscriptionConfirmed: result.found,
      yelpLeadSubscriptionVerifiedAt: now,
      yelpLeadSubscriptionSubscribedAt: result.subscription?.subscribed_at ?? null,
      yelpLeadSubscriptionVerificationCorrelationId: result.correlationId
    });

    await updateBusinessRecord(business.id, tenantId, { readinessJson });
    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: business.id,
      actionType: "business.yelp-webhook-subscription.verify",
      status: "SUCCESS",
      correlationId: result.correlationId,
      requestSummary: {
        subscriptionType: YELP_WEBHOOK_SUBSCRIPTION_TYPE,
        businessId: business.encryptedYelpBusinessId
      },
      responseSummary: {
        status: result.found ? "CONFIRMED" : "NOT_FOUND",
        subscribedAt: result.subscription?.subscribed_at ?? null
      } as never
    });

    return {
      action: data.action,
      status: result.found ? "CONFIRMED" : "NOT_FOUND",
      message: result.found
        ? "Yelp webhook subscription is confirmed for this business."
        : "Yelp did not return this business in the webhook subscription list yet.",
      correlationId: result.correlationId,
      subscribedAt: result.subscription?.subscribed_at ?? null
    };
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: business.id,
      actionType: "business.yelp-webhook-subscription.verify",
      status: "FAILED",
      requestSummary: {
        subscriptionType: YELP_WEBHOOK_SUBSCRIPTION_TYPE,
        businessId: business.encryptedYelpBusinessId
      },
      responseSummary: {
        message: normalized.message
      } as never,
      rawPayloadSummary: normalized.details as never
    });

    throw normalized;
  }
}

const blockingBusinessDeletionStatuses = new Set(["ACTIVE", "SCHEDULED", "QUEUED", "PROCESSING"]);

export async function deleteBusinessWorkflow(tenantId: string, actorId: string, input: unknown) {
  const data = deleteBusinessFormSchema.parse(input);
  const [business, deleteImpact] = await Promise.all([getBusinessById(data.businessId, tenantId), getBusinessDeleteImpact(data.businessId, tenantId)]);
  const normalizedConfirmation = data.confirmationText.trim();

  if (normalizedConfirmation !== business.name) {
    throw new YelpValidationError(`Type the exact business name "${business.name}" to confirm deletion.`);
  }

  const blockingPrograms = business.programs.filter((program) => blockingBusinessDeletionStatuses.has(program.status));

  if (blockingPrograms.length > 0) {
    throw new YelpValidationError(
      "This business still has active or pending programs. End or resolve those programs before deleting the business from the console."
    );
  }

  const deleteSummary = {
    deletedBusinessId: business.id,
    deletedBusinessName: business.name,
    deletedPrograms: deleteImpact._count.programs,
    deletedProgramJobs: deleteImpact._count.programJobs,
    deletedFeatureSnapshots: deleteImpact._count.featureSnapshots,
    deletedMappings: deleteImpact._count.mappings,
    detachedReportRequests: deleteImpact._count.reportRequests,
    detachedReportResults: deleteImpact._count.reportResults,
    detachedAuditEvents: deleteImpact._count.auditEvents
  };

  try {
    const result = await deleteBusinessRecord(business.id, tenantId);

    if (result.count !== 1) {
      throw new YelpValidationError("The selected business could not be deleted.");
    }

    await recordAuditEvent({
      tenantId,
      actorId,
      actionType: "business.delete",
      status: "SUCCESS",
      requestSummary: {
        businessId: business.id,
        businessName: business.name,
        confirmation: "matched"
      },
      responseSummary: deleteSummary as never,
      before: {
        id: business.id,
        name: business.name,
        encryptedYelpBusinessId: business.encryptedYelpBusinessId,
        location: [business.city, business.state, business.country].filter(Boolean).join(", "),
        deleteImpact: deleteSummary
      } as never
    });

    return {
      deleted: true,
      businessId: business.id,
      summary: deleteSummary
    };
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await recordAuditEvent({
      tenantId,
      actorId,
      actionType: "business.delete",
      status: "FAILED",
      requestSummary: {
        businessId: business.id,
        businessName: business.name
      },
      responseSummary: {
        message: normalized.message
      } as never,
      rawPayloadSummary: normalized.details as never
    });

    throw normalized;
  }
}
