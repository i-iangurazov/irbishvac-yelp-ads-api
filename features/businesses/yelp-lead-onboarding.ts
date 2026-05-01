export type YelpLeadOnboardingStepStatus =
  | "READY"
  | "ACTIVE"
  | "PROCESSING"
  | "PARTIAL"
  | "UNKNOWN"
  | "FAILED"
  | "INACTIVE";

type ForwarderAllowlistProof = {
  status: "READY" | "FAILED" | "UNKNOWN";
  label: string;
  detail: string;
};

export type YelpLeadOnboardingStep = {
  id: string;
  label: string;
  status: YelpLeadOnboardingStepStatus;
  value: string;
  detail: string;
  href?: string;
};

export type YelpLeadOnboardingState = {
  status: YelpLeadOnboardingStepStatus;
  label: string;
  detail: string;
  nextAction: string;
  steps: YelpLeadOnboardingStep[];
};

type LeadProof = {
  latestWebhookReceivedAt?: Date | null;
  latestWebhookStatus?: string | null;
  lastSyncedAt?: Date | null;
  latestInteractionAt?: Date | null;
} | null;

type LeadSyncProof = {
  type?: string | null;
  status?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  lastSuccessfulSyncAt?: Date | null;
  errorSummary?: string | null;
} | null;

type BuildYelpLeadOnboardingStateParams = {
  encryptedYelpBusinessId?: string | null;
  hasLeadsApi: boolean;
  readinessJson?: unknown;
  latestLead?: LeadProof;
  latestLeadSyncRun?: LeadSyncProof;
  leadCount: number;
  autoresponderEnabled: boolean;
  conversationAutomationEnabled: boolean;
  hasBusinessOverride: boolean;
  forwarderAllowlist?: ForwarderAllowlistProof;
};

function asReadinessRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readBooleanFlag(record: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => record[key] === true);
}

function formatSyncStatus(syncRun: LeadSyncProof, leadCount: number) {
  if (!syncRun) {
    return leadCount > 0 ? "Lead records exist locally." : "No Yelp lead sync run has been recorded yet.";
  }

  const type = syncRun.type?.replaceAll("_", " ").toLowerCase() ?? "Yelp lead sync";
  const status = syncRun.status?.toLowerCase() ?? "unknown";

  return `${type} ended with ${status} status.`;
}

export function buildYelpLeadOnboardingState(params: BuildYelpLeadOnboardingStateParams): YelpLeadOnboardingState {
  const readiness = asReadinessRecord(params.readinessJson);
  const hasYelpBusinessId = Boolean(params.encryptedYelpBusinessId);
  const latestLead = params.latestLead ?? null;
  const latestLeadSyncRun = params.latestLeadSyncRun ?? null;
  const hasWebhookProof = Boolean(latestLead?.latestWebhookReceivedAt && latestLead.latestWebhookStatus !== "FAILED");
  const hasFailedWebhookProof = latestLead?.latestWebhookStatus === "FAILED";
  const hasLeadSyncProof = Boolean(
    latestLead?.lastSyncedAt ||
      latestLeadSyncRun?.lastSuccessfulSyncAt ||
      latestLeadSyncRun?.status === "COMPLETED" ||
      latestLeadSyncRun?.status === "PARTIAL" ||
      params.leadCount > 0
  );
  const hasManualAdminProof = readBooleanFlag(readiness, [
    "yelpBusinessAdminConfirmed",
    "snowLeopardBusinessAdminConfirmed",
    "leadsBusinessAdminConfirmed"
  ]);
  const hasManualSubscriptionProof = readBooleanFlag(readiness, [
    "yelpLeadSubscriptionConfirmed",
    "leadsSubscriptionConfirmed",
    "webhookSubscriptionConfirmed"
  ]);
  const subscriptionStatus =
    typeof readiness.yelpLeadSubscriptionStatus === "string" ? readiness.yelpLeadSubscriptionStatus : null;
  const hasSubscriptionRequest = subscriptionStatus === "REQUESTED";
  const hasAdminOrTrafficProof = hasManualAdminProof || hasWebhookProof || hasLeadSyncProof;
  const hasSubscriptionOrTrafficProof = hasManualSubscriptionProof || hasWebhookProof;
  const forwarderAllowlist = params.forwarderAllowlist ?? {
    status: "UNKNOWN",
    label: "Manual check",
    detail: "Forwarder allowlist state was not provided."
  };

  const syncStatus: YelpLeadOnboardingStepStatus =
    latestLeadSyncRun?.status === "FAILED"
      ? "FAILED"
      : latestLeadSyncRun?.status === "PARTIAL"
        ? "PARTIAL"
        : hasLeadSyncProof
          ? "READY"
          : "UNKNOWN";

  const steps: YelpLeadOnboardingStep[] = [
    {
      id: "local-yelp-business",
      label: "Local Yelp business",
      status: hasYelpBusinessId ? "READY" : "FAILED",
      value: hasYelpBusinessId ? "Mapped" : "Missing",
      detail: hasYelpBusinessId
        ? "This console has the Yelp encrypted business ID needed for intake and thread replies."
        : "Save the Yelp encrypted business ID before subscribing or reconciling leads."
    },
    {
      id: "leads-api-access",
      label: "Leads API access",
      status: params.hasLeadsApi ? "READY" : "FAILED",
      value: params.hasLeadsApi ? "Credential available" : "Credential missing",
      detail: params.hasLeadsApi
        ? "The tenant has Yelp Leads capability enabled in app settings."
        : "Set and verify the Yelp Leads credential before relying on intake or replies."
    },
    {
      id: "business-admin-access",
      label: "Yelp admin access",
      status: hasAdminOrTrafficProof ? "READY" : "UNKNOWN",
      value: hasManualAdminProof ? "Confirmed manually" : hasAdminOrTrafficProof ? "Traffic proof" : "Manual check",
      detail: hasAdminOrTrafficProof
        ? "Admin/subscription access is supported by recorded lead traffic or manual readiness proof."
        : "Confirm the Snow Leopard/Yelp integration user is a business admin for this location."
    },
    {
      id: "webhook-forwarder-allowlist",
      label: "Forwarder allowlist",
      status: forwarderAllowlist.status,
      value: forwarderAllowlist.label,
      detail: hasWebhookProof
        ? "Live webhook proof exists for this business. Forwarder allowlist is effectively proven by traffic."
        : forwarderAllowlist.detail
    },
    {
      id: "webhook-subscription",
      label: "Webhook subscription",
      status: hasFailedWebhookProof ? "FAILED" : hasSubscriptionOrTrafficProof ? "READY" : hasSubscriptionRequest ? "PROCESSING" : "UNKNOWN",
      value: hasWebhookProof
        ? "Webhook seen"
        : hasManualSubscriptionProof
          ? "Confirmed"
          : hasSubscriptionRequest
            ? "Requested"
            : "Needs proof",
      detail: hasFailedWebhookProof
        ? "The latest recorded webhook for this business failed. Review intake errors before rollout."
        : hasSubscriptionOrTrafficProof
          ? "Webhook or manual subscription proof exists for this Yelp business."
          : hasSubscriptionRequest
            ? "Yelp accepted an async webhook subscription request. Check again after processing or confirm with live traffic."
          : "Subscribe this business in Yelp and confirm live webhook delivery reaches the platform."
    },
    {
      id: "reconcile-proof",
      label: "Lead reconcile",
      status: syncStatus,
      value:
        syncStatus === "READY"
          ? `${params.leadCount} lead${params.leadCount === 1 ? "" : "s"} local`
          : syncStatus === "FAILED"
            ? "Failed"
            : syncStatus === "PARTIAL"
              ? "Partial"
              : "Not proven",
      detail:
        latestLeadSyncRun?.status === "FAILED"
          ? latestLeadSyncRun.errorSummary ?? "Latest Yelp lead reconcile failed."
          : formatSyncStatus(latestLeadSyncRun, params.leadCount)
    },
    {
      id: "autoresponder-scope",
      label: "Autoresponder scope",
      status: params.autoresponderEnabled ? "READY" : "INACTIVE",
      value: params.autoresponderEnabled
        ? params.hasBusinessOverride
          ? "Business override"
          : "Tenant default"
        : "Off",
      detail: params.autoresponderEnabled
        ? params.conversationAutomationEnabled
          ? "This business is covered for initial response and conversation automation."
          : "This business is covered for initial response. Conversation automation is off."
        : "Autoresponder is not active for this business under the effective scope."
    }
  ];

  if (!hasYelpBusinessId) {
    return {
      status: "FAILED",
      label: "Business setup incomplete",
      detail: "Yelp lead automation cannot be trusted until the business ID is saved.",
      nextAction: "Save the Yelp encrypted business ID.",
      steps
    };
  }

  if (!params.hasLeadsApi) {
    return {
      status: "FAILED",
      label: "Yelp Leads access missing",
      detail: "The business is mapped, but the tenant does not have usable Yelp Leads access.",
      nextAction: "Verify Yelp Leads credentials in production settings.",
      steps
    };
  }

  if (hasFailedWebhookProof) {
    return {
      status: "FAILED",
      label: "Webhook intake failed",
      detail: "Yelp webhook traffic reached this business, but the latest recorded intake status failed.",
      nextAction: "Review the failed webhook event and reconcile logs before enabling automation.",
      steps
    };
  }

  if (forwarderAllowlist.status === "FAILED" && !hasWebhookProof) {
    return {
      status: "FAILED",
      label: "Forwarder allowlist missing",
      detail: "This business may be subscribed in Yelp, but webhook delivery can still be blocked by the standalone forwarder.",
      nextAction: "Add this Yelp business ID to YELP_ALLOWED_BUSINESS_IDS in the webhook forwarder and redeploy it.",
      steps
    };
  }

  if (!hasSubscriptionOrTrafficProof) {
    return {
      status: "UNKNOWN",
      label: "Subscription proof needed",
      detail: "The business can be configured locally, but webhook delivery has not been proven.",
      nextAction: "Subscribe the business in Yelp, then confirm a webhook or reconcile proof.",
      steps
    };
  }

  if (!hasLeadSyncProof) {
    return {
      status: "PROCESSING",
      label: "Waiting on reconcile",
      detail: "Webhook proof exists, but local lead sync proof is still missing.",
      nextAction: "Run reconcile and confirm the lead appears in the queue.",
      steps
    };
  }

  if (!params.autoresponderEnabled) {
    return {
      status: "INACTIVE",
      label: "Intake ready, automation off",
      detail: "Yelp intake is proven, but autoresponder is not active for this business.",
      nextAction: "Enable this business in tenant defaults or add a business override.",
      steps
    };
  }

  return {
    status: hasWebhookProof ? "ACTIVE" : "READY",
    label: hasWebhookProof ? "Ready for live Yelp traffic" : "Ready with sync proof",
    detail: params.conversationAutomationEnabled
      ? "Yelp intake, reconcile, and autoresponder scope are aligned for this business."
      : "Initial autoresponder scope is aligned. Conversation automation is intentionally off.",
    nextAction: hasWebhookProof ? "Send a test Yelp thread message and verify the reply audit trail." : "Confirm live webhook delivery next.",
    steps
  };
}
