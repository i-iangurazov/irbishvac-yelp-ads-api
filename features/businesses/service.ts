import "server-only";

import { isCurrentLocalProgramStatus, isCurrentUpstreamProgramStatus } from "@/features/ads-programs/status";
import {
  deleteBusinessRecord,
  findBusinessByEncryptedYelpBusinessId,
  getBusinessById,
  getBusinessDeleteImpact,
  listBusinesses,
  upsertBusiness
} from "@/lib/db/businesses-repository";
import { ensureYelpAccess, getCapabilityFlags } from "@/lib/yelp/runtime";
import { normalizeYelpCategories } from "@/lib/yelp/categories";
import { YelpAdsClient } from "@/lib/yelp/ads-client";
import { YelpBusinessMatchClient } from "@/lib/yelp/business-match-client";
import { YelpDataIngestionClient } from "@/lib/yelp/data-ingestion-client";
import { yelpBusinessMatchResponseSchema, type YelpUpstreamProgramDto } from "@/lib/yelp/schemas";
import { businessSearchSchema, deleteBusinessFormSchema, readinessPatchSchema } from "@/features/businesses/schemas";
import { recordAuditEvent } from "@/features/audit/service";
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

const LIVE_PROGRAM_DISPLAY_LIMIT = 10;
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

function summarizeReportRecipients(schedule: Awaited<ReturnType<typeof getBusinessById>>["reportSchedules"][number]) {
  const accountRecipients = countJsonArray(schedule.recipientEmailsJson);
  const locationOverrides = countJsonArray(schedule.locationRecipientOverridesJson);
  const recipientLabel = accountRecipients === 1 ? "1 account recipient" : `${accountRecipients} account recipients`;

  return locationOverrides > 0 ? `${recipientLabel}, ${locationOverrides} location routes` : recipientLabel;
}

function buildBusinessOperationalSummary(params: {
  business: Awaited<ReturnType<typeof getBusinessById>>;
  capabilities: Awaited<ReturnType<typeof getCapabilityFlags>>;
  currentPrograms: Awaited<ReturnType<typeof getBusinessById>>["programs"];
  readiness: ReadinessState;
  liveProgramInventory: LiveProgramInventoryState;
}) {
  const { business, capabilities, currentPrograms, readiness, liveProgramInventory } = params;
  const latestLead = business.yelpLeads[0] ?? null;
  const override = business.leadAutomationOverrides[0] ?? null;
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
  const automationStatus = override ? (override.isEnabled ? "READY" : "INACTIVE") : "UNKNOWN";
  const automationDetail = override
    ? override.isEnabled
      ? `${override.defaultChannel}; ${override.followUp24hEnabled || override.followUp7dEnabled ? "follow-ups enabled" : "follow-ups off"}; AI ${override.aiAssistEnabled ? "on" : "off"}.`
      : "Business override exists and autoresponder is disabled."
    : "No business override. Tenant fallback settings apply.";
  const conversationStatus = override?.conversationAutomationEnabled ? override.conversationMode : "INACTIVE";
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
      value: override ? (override.isEnabled ? "Enabled here" : "Disabled here") : "Tenant fallback",
      detail: automationDetail,
      href: "/autoresponder"
    },
    {
      id: "conversation",
      label: "Conversation mode",
      status: conversationStatus,
      value: override?.conversationAutomationEnabled ? override.conversationMode.replaceAll("_", " ") : "Off",
      detail: override?.conversationAutomationEnabled
        ? `Max automation policy is controlled in the business override.`
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

  if (business._count.yelpLeads > 0 && !override) {
    warnings.push({
      id: "missing-override",
      status: "UNKNOWN",
      title: "Leads exist without a business override",
      detail: "Tenant fallback settings apply. Add a business override if this business should be explicitly controlled.",
      href: "/autoresponder"
    });
  }

  if (override?.isEnabled && yelpConnectionStatus !== "READY") {
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
  const capabilities = await getCapabilityFlags(tenantId);
  const currentPrograms = business.programs.filter(
    (program: (typeof business.programs)[number]) => isCurrentLocalProgramStatus(program.status)
  );
  const readiness = buildCpcReadiness(business.readinessJson, business.categoriesJson);
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
    liveProgramInventory,
    operationalSummary: buildBusinessOperationalSummary({
      business,
      capabilities,
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
