import type { ConnectionTestStatus, CredentialKind } from "@prisma/client";

export {
  capabilityFlagDefinitions,
  capabilityFlagLabels,
  getEnabledCapabilityLabels
} from "@/features/settings/capabilities";

type CredentialHealthInput = {
  kind: CredentialKind;
  isEnabled: boolean;
  lastTestStatus: ConnectionTestStatus;
  lastErrorMessage: string | null;
  lastTestedAt: Date | null;
  secretEncrypted: string | null;
  usernameEncrypted: string | null;
  metadataJson?: unknown;
};

type BadgeVariant = "outline" | "secondary" | "success" | "warning" | "destructive";

function formatTimestamp(value: Date | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

function getSavedTestPath(metadataJson: unknown) {
  const value =
    typeof metadataJson === "object" && metadataJson !== null && "testPath" in metadataJson
      ? (metadataJson as { testPath?: unknown }).testPath
      : undefined;

  return typeof value === "string" ? value : undefined;
}

function getTestState(status: ConnectionTestStatus, lastErrorMessage: string | null) {
  if (status === "SUCCESS") {
    return {
      label: "Last test passed",
      variant: "success" as const
    };
  }

  if (
    status === "FAILED" &&
    (lastErrorMessage?.includes("returned 404 from Yelp") ||
      lastErrorMessage?.includes("The requested Yelp resource was not found."))
  ) {
    return {
      label: "Test path needs update",
      variant: "warning" as const
    };
  }

  if (status === "FAILED") {
    return {
      label: "Last test failed",
      variant: "destructive" as const
    };
  }

  return {
    label: "Not tested yet",
    variant: "secondary" as const
  };
}

export function getCredentialHealthViewModel(credential: CredentialHealthInput) {
  const requiresUsername = credential.kind !== "REPORTING_FUSION";
  const isConfigured = Boolean(credential.secretEncrypted && (!requiresUsername || credential.usernameEncrypted));
  const testState = getTestState(credential.lastTestStatus, credential.lastErrorMessage);
  const lastChecked = formatTimestamp(credential.lastTestedAt);
  const savedTestPath = getSavedTestPath(credential.metadataJson);
  const isNotFoundTestState = testState.label === "Test path needs update";

  return {
    setupLabel: isConfigured ? "Credentials saved" : "Credentials missing",
    setupVariant: (isConfigured ? "secondary" : "outline") as BadgeVariant,
    requestsLabel: credential.isEnabled ? "Requests enabled" : "Requests paused",
    requestsVariant: (credential.isEnabled ? "success" : "outline") as BadgeVariant,
    testLabel: testState.label,
    testVariant: testState.variant as BadgeVariant,
    detail: isNotFoundTestState
      ? `The saved verification path ${savedTestPath ? `"${savedTestPath}"` : '"/"'} returned 404 from Yelp. The credentials can still be valid. Add a safe readable endpoint in Settings if you want a live connection check.`
      : credential.lastTestStatus === "FAILED"
        ? credential.lastErrorMessage ?? "The last connection test failed."
        : lastChecked
          ? `Last checked ${lastChecked}.`
          : "Credentials are saved. Live verification is optional and can be configured in Settings."
  };
}
