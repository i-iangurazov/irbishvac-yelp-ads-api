import "server-only";

import type { ConnectionTestStatus, CredentialKind, RoleCode } from "@prisma/client";

import { recordAuditEvent } from "@/features/audit/service";
import { capabilityFlagsSchema, credentialFormSchema } from "@/features/settings/schemas";
import { countActiveUsersByRole, getTenantUserById, updateUserRole } from "@/lib/db/users-repository";
import {
  getCredentialSet,
  listCredentialSets,
  updateCredentialTestResult,
  upsertCredentialSet
} from "@/lib/db/credentials-repository";
import { getSystemSetting, upsertSystemSetting } from "@/lib/db/settings-repository";
import { listUsersByTenant } from "@/lib/db/users-repository";
import { toJsonValue } from "@/lib/db/json";
import { encryptSecret } from "@/lib/utils/crypto";
import { getServerEnv } from "@/lib/utils/env";
import { YelpAdsClient } from "@/lib/yelp/ads-client";
import { YelpBusinessMatchClient } from "@/lib/yelp/business-match-client";
import { YelpDataIngestionClient } from "@/lib/yelp/data-ingestion-client";
import { YelpFeaturesClient } from "@/lib/yelp/features-client";
import { YelpReportingClient } from "@/lib/yelp/reporting-client";
import { getCapabilityFlags, getCredentialConfig } from "@/lib/yelp/runtime";
import { normalizeUnknownError, YelpValidationError } from "@/lib/yelp/errors";

type TestableConnectionClient = {
  testConnection: (path?: string) => Promise<unknown>;
};

function resolveFallbackBaseUrl(kind: CredentialKind) {
  const env = getServerEnv();

  if (kind === "REPORTING_FUSION") {
    return env.YELP_REPORTING_BASE_URL;
  }

  if (kind === "BUSINESS_MATCH") {
    return env.YELP_BUSINESS_MATCH_BASE_URL;
  }

  if (kind === "DATA_INGESTION") {
    return env.YELP_DATA_INGESTION_BASE_URL;
  }

  return env.YELP_ADS_BASE_URL;
}

function getCapabilityKeysForCredential(kind: CredentialKind) {
  switch (kind) {
    case "ADS_BASIC_AUTH":
      return ["adsApiEnabled"] as const;
    case "REPORTING_FUSION":
      return ["reportingApiEnabled"] as const;
    case "BUSINESS_MATCH":
      return ["businessMatchApiEnabled"] as const;
    case "DATA_INGESTION":
      return ["dataIngestionApiEnabled"] as const;
    default:
      return [] as const;
  }
}

function normalizeTestPath(kind: CredentialKind, testPath: string | undefined) {
  const trimmed = testPath?.trim();

  if (!trimmed) {
    return undefined;
  }

  if (kind === "ADS_BASIC_AUTH" && trimmed === "/") {
    return undefined;
  }

  return trimmed;
}

export async function getSettingsOverview(tenantId: string) {
  const [credentials, capabilities, users] = await Promise.all([
    listCredentialSets(tenantId),
    getCapabilityFlags(tenantId),
    listUsersByTenant(tenantId)
  ]);

  return {
    credentials: credentials.map((credential) => ({
      ...credential,
      secretEncrypted: credential.secretEncrypted ? "configured" : null,
      usernameEncrypted: credential.usernameEncrypted ? "configured" : null
    })),
    capabilities,
    users
  };
}

export async function saveCredentialSet(
  tenantId: string,
  actorId: string,
  input: unknown
) {
  const data = credentialFormSchema.parse(input);
  const existing = await getCredentialSet(tenantId, data.kind);
  const normalizedTestPath = normalizeTestPath(data.kind, data.testPath);
  const nextMetadata = {
    ...((existing?.metadataJson as Record<string, unknown> | null) ?? {})
  };

  if (normalizedTestPath) {
    nextMetadata.testPath = normalizedTestPath;
  } else {
    delete nextMetadata.testPath;
  }

  const credentialsChanged =
    Boolean(data.username?.trim()) ||
    Boolean(data.secret?.trim()) ||
    (data.baseUrl || resolveFallbackBaseUrl(data.kind)) !== (existing?.baseUrl ?? resolveFallbackBaseUrl(data.kind)) ||
    ((typeof nextMetadata.testPath === "string" ? nextMetadata.testPath : undefined) ?? "") !==
      ((existing?.metadataJson as { testPath?: string } | null)?.testPath ?? "");

  const nextRecord = await upsertCredentialSet(tenantId, data.kind, {
    tenantId,
    kind: data.kind,
    label: data.label,
    usernameEncrypted:
      data.username?.trim()
        ? encryptSecret(data.username.trim())
        : existing?.usernameEncrypted ?? null,
    secretEncrypted:
      data.secret?.trim()
        ? encryptSecret(data.secret.trim())
        : existing?.secretEncrypted ?? "",
    baseUrl: data.baseUrl || resolveFallbackBaseUrl(data.kind),
    isEnabled: data.isEnabled,
    metadataJson: toJsonValue(nextMetadata),
    ...(credentialsChanged
      ? {
          lastTestStatus: "UNTESTED",
          lastErrorMessage: null,
          lastTestedAt: null
        }
      : {})
  });

  const capabilityKeys = getCapabilityKeysForCredential(data.kind);

  if (capabilityKeys.length > 0) {
    const currentCapabilities = await getCapabilityFlags(tenantId);
    const nextCapabilities = { ...currentCapabilities };

    for (const key of capabilityKeys) {
      nextCapabilities[key] = nextRecord.isEnabled;
    }

    await upsertSystemSetting(tenantId, "yelpCapabilities", nextCapabilities);
  }

  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: `settings.credential.${data.kind.toLowerCase()}.save`,
    status: "SUCCESS",
    requestSummary: toJsonValue({
      kind: data.kind,
      label: data.label,
      baseUrl: data.baseUrl,
      isEnabled: data.isEnabled
    }),
    before: existing
      ? {
          ...existing,
          secretEncrypted: existing.secretEncrypted ? "configured" : null,
          usernameEncrypted: existing.usernameEncrypted ? "configured" : null
        }
      : undefined,
    after: {
      ...nextRecord,
      secretEncrypted: nextRecord.secretEncrypted ? "configured" : null,
      usernameEncrypted: nextRecord.usernameEncrypted ? "configured" : null
    }
  });

  return nextRecord;
}

export async function saveCapabilityFlags(tenantId: string, actorId: string, input: unknown) {
  const flags = capabilityFlagsSchema.parse(input);
  const existing = await getSystemSetting(tenantId, "yelpCapabilities");

  const saved = await upsertSystemSetting(tenantId, "yelpCapabilities", flags);

  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: "settings.capabilities.save",
    status: "SUCCESS",
    before: existing as never,
    after: flags as never
  });

  return saved;
}

export async function saveUserRole(tenantId: string, actorId: string, userId: string, roleCode: RoleCode) {
  const existing = await getTenantUserById(userId, tenantId);

  if (existing.role.code === "ADMIN" && roleCode !== "ADMIN" && existing.isActive) {
    const activeAdminCount = await countActiveUsersByRole(tenantId, "ADMIN");

    if (activeAdminCount <= 1) {
      throw new YelpValidationError("At least one active Admin must remain assigned to this tenant.");
    }
  }

  const updated = await updateUserRole(tenantId, userId, roleCode);

  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: "settings.user-role.save",
    status: "SUCCESS",
    requestSummary: {
      userId,
      roleCode
    },
    after: {
      userId,
      roleCode: updated.role.code
    },
    before: {
      userId,
      roleCode: existing.role.code
    }
  });

  return updated;
}

async function getConnectionTester(tenantId: string, kind: CredentialKind): Promise<TestableConnectionClient> {
  const credential = await getCredentialConfig(tenantId, kind);

  if (!credential) {
    throw new YelpValidationError("Save credentials first before testing the connection.");
  }

  switch (kind) {
    case "ADS_BASIC_AUTH":
      return new YelpAdsClient(credential);
    case "REPORTING_FUSION":
      return new YelpReportingClient(credential);
    case "BUSINESS_MATCH":
      return new YelpBusinessMatchClient(credential);
    case "DATA_INGESTION":
      return new YelpDataIngestionClient(credential);
    default:
      return new YelpFeaturesClient(credential);
  }
}

export async function testCredentialConnection(tenantId: string, actorId: string, kind: CredentialKind) {
  const existing = await getCredentialSet(tenantId, kind);
  const credential = await getCredentialConfig(tenantId, kind);
  const testPath =
    typeof credential?.metadata?.testPath === "string" && credential.metadata.testPath.trim().length > 0
      ? credential.metadata.testPath.trim()
      : "";

  if (kind === "ADS_BASIC_AUTH" && (!testPath || testPath === "/")) {
    await recordAuditEvent({
      tenantId,
      actorId,
      actionType: `settings.credential.${kind.toLowerCase()}.test`,
      status: "SUCCESS",
      responseSummary: toJsonValue({
        result: "Verification skipped",
        message: "Yelp Ads docs do not define a generic health-check path."
      })
    });

    return {
      status: "SUCCESS" as ConnectionTestStatus,
      message:
        "Credentials saved. Yelp Ads does not document a generic health-check endpoint. Add a safe readable endpoint only if you want live verification."
    };
  }

  try {
    const tester = await getConnectionTester(tenantId, kind);
    await tester.testConnection(testPath);
    if (existing) {
      await updateCredentialTestResult(tenantId, kind, "SUCCESS");
    }

    await recordAuditEvent({
      tenantId,
      actorId,
      actionType: `settings.credential.${kind.toLowerCase()}.test`,
      status: "SUCCESS",
      responseSummary: toJsonValue({
        result: "Connection successful"
      })
    });

    return {
      status: "SUCCESS" as ConnectionTestStatus,
      message: "Connection successful."
    };
  } catch (error) {
    const normalized = normalizeUnknownError(error);
    const message =
      normalized.code === "NOT_FOUND"
        ? `The test path "${testPath}" returned 404 from Yelp. The credentials may still be valid, but this path is not a valid connection check. Save a better test path and retry.`
        : normalized.message;

    if (existing) {
      await updateCredentialTestResult(tenantId, kind, "FAILED", message);
    }
    await recordAuditEvent({
      tenantId,
      actorId,
      actionType: `settings.credential.${kind.toLowerCase()}.test`,
      status: "FAILED",
      responseSummary: toJsonValue({
        result: "Connection failed",
        error: message,
        testPath
      }),
      rawPayloadSummary: normalized.details as never
    });

    return {
      status: "FAILED" as ConnectionTestStatus,
      message
    };
  }
}
