export type YelpForwarderAllowlistState =
  | {
      status: "READY";
      isConfigured: true;
      isAllowed: true;
      allowedBusinessIds: string[];
      label: string;
      detail: string;
    }
  | {
      status: "FAILED";
      isConfigured: true;
      isAllowed: false;
      allowedBusinessIds: string[];
      label: string;
      detail: string;
    }
  | {
      status: "UNKNOWN";
      isConfigured: false;
      isAllowed: null;
      allowedBusinessIds: string[];
      label: string;
      detail: string;
    };

export function parseYelpAllowedBusinessIds(value: string | null | undefined) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

export function buildYelpForwarderAllowlistState(params: {
  encryptedYelpBusinessId?: string | null;
  allowedBusinessIds: string[];
}): YelpForwarderAllowlistState {
  if (params.allowedBusinessIds.length === 0) {
    return {
      status: "UNKNOWN",
      isConfigured: false,
      isAllowed: null,
      allowedBusinessIds: [],
      label: "Manual check",
      detail:
        "This app does not have a mirrored YELP_ALLOWED_BUSINESS_IDS value. If the standalone webhook forwarder is used, verify its allowlist before expecting live webhooks."
    };
  }

  const isAllowed = Boolean(
    params.encryptedYelpBusinessId && params.allowedBusinessIds.includes(params.encryptedYelpBusinessId)
  );

  if (isAllowed) {
    return {
      status: "READY",
      isConfigured: true,
      isAllowed: true,
      allowedBusinessIds: params.allowedBusinessIds,
      label: "Allowed",
      detail: "This Yelp business ID is present in the mirrored webhook forwarder allowlist."
    };
  }

  return {
    status: "FAILED",
    isConfigured: true,
    isAllowed: false,
    allowedBusinessIds: params.allowedBusinessIds,
    label: "Not allowed",
    detail:
      "This Yelp business ID is not present in YELP_ALLOWED_BUSINESS_IDS. The standalone forwarder may reject this business before it reaches the main platform."
  };
}
