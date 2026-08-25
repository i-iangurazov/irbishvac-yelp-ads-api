import "server-only";

import type {
  ConnectionTestStatus,
  CredentialKind,
  RoleCode,
} from "@prisma/client";

import { recordAuditEvent } from "@/features/audit/service";
import {
  normalizeCapabilityFlags,
  type CapabilityFlags,
} from "@/features/settings/capabilities";
import {
  capabilityFlagsSchema,
  credentialFormSchema,
  userCreateSchema,
} from "@/features/settings/schemas";
import {
  countActiveUsersByRole,
  countActiveUsersByRoleGlobally,
  createTenantUser,
  findUserByEmail,
  getTenantUserById,
  getUserById,
  listUsersByTenant,
  updateUserRole,
} from "@/lib/db/users-repository";
import {
  getCredentialSet,
  listCredentialSets,
  updateCredentialTestResult,
  upsertCredentialSet,
} from "@/lib/db/credentials-repository";
import { listLeadBusinessOptions } from "@/lib/db/leads-repository";
import {
  getSystemSetting,
  upsertSystemSetting,
} from "@/lib/db/settings-repository";
import { toJsonValue } from "@/lib/db/json";
import { hashPassword } from "@/lib/auth/password";
import { encryptSecret } from "@/lib/utils/crypto";
import { getServerEnv } from "@/lib/utils/env";
import { YelpAdsClient } from "@/lib/yelp/ads-client";
import { YelpBusinessMatchClient } from "@/lib/yelp/business-match-client";
import { YelpDataIngestionClient } from "@/lib/yelp/data-ingestion-client";
import { YelpFeaturesClient } from "@/lib/yelp/features-client";
import { YelpReportingClient } from "@/lib/yelp/reporting-client";
import {
  ensureYelpLeadsAccess,
  getCapabilityFlags,
  getCredentialConfig,
} from "@/lib/yelp/runtime";
import { YelpLeadsClient } from "@/lib/yelp/leads-client";
import { normalizeUnknownError, YelpValidationError } from "@/lib/yelp/errors";
import { ServiceTitanClient } from "@/lib/servicetitan/client";
import { getDefaultServiceTitanUrls } from "@/lib/servicetitan/runtime";
import { canAssignRole } from "@/features/settings/roles";

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

  if (kind === "CRM_SERVICETITAN") {
    return getDefaultServiceTitanUrls("PRODUCTION").apiBaseUrl;
  }

  return env.YELP_ADS_BASE_URL;
}

function getCapabilityKeysForCredential(
  kind: CredentialKind,
): Array<keyof CapabilityFlags> {
  switch (kind) {
    case "ADS_BASIC_AUTH":
      return ["adsApiEnabled", "hasAdsApi"];
    case "REPORTING_FUSION":
      return ["reportingApiEnabled", "hasReportingApi"];
    case "BUSINESS_MATCH":
      return ["businessMatchApiEnabled", "hasPartnerSupportApi"];
    case "DATA_INGESTION":
      return ["dataIngestionApiEnabled", "hasLeadsApi"];
    case "CRM_SERVICETITAN":
      return ["hasCrmIntegration"];
    default:
      return [];
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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function redactCredentialMetadata(value: unknown) {
  const metadata = asRecord(value);
  const oauth = asRecord(metadata.oauth);

  if (Object.keys(oauth).length === 0) {
    return value;
  }

  const redactedOauth = { ...oauth };

  if (typeof redactedOauth.clientSecretEncrypted === "string") {
    redactedOauth.clientSecretEncrypted = "configured";
  } else {
    delete redactedOauth.clientSecretEncrypted;
  }

  if (typeof redactedOauth.refreshTokenEncrypted === "string") {
    redactedOauth.refreshTokenEncrypted = "configured";
  } else {
    delete redactedOauth.refreshTokenEncrypted;
  }

  return {
    ...metadata,
    oauth: redactedOauth,
  };
}

export async function getSettingsOverview(tenantId: string) {
  const [credentials, capabilities, users] = await Promise.all([
    listCredentialSets(tenantId),
    getCapabilityFlags(tenantId),
    listUsersByTenant(tenantId),
  ]);

  return {
    credentials: credentials.map((credential) => ({
      ...credential,
      secretEncrypted: credential.secretEncrypted ? "configured" : null,
      usernameEncrypted: credential.usernameEncrypted ? "configured" : null,
      metadataJson: redactCredentialMetadata(credential.metadataJson),
    })),
    capabilities,
    users,
  };
}

export async function getDashboardSettingsOverview(tenantId: string) {
  const [credentials, capabilities] = await Promise.all([
    listCredentialSets(tenantId),
    getCapabilityFlags(tenantId),
  ]);

  return {
    credentials: credentials.map((credential) => ({
      ...credential,
      secretEncrypted: credential.secretEncrypted ? "configured" : null,
      usernameEncrypted: credential.usernameEncrypted ? "configured" : null,
      metadataJson: redactCredentialMetadata(credential.metadataJson),
    })),
    capabilities,
  };
}

export async function saveCredentialSet(
  tenantId: string,
  actorId: string,
  input: unknown,
) {
  const data = credentialFormSchema.parse(input);
  const existing = await getCredentialSet(tenantId, data.kind);
  const normalizedTestPath = normalizeTestPath(data.kind, data.testPath);
  const nextMetadata = {
    ...((existing?.metadataJson as Record<string, unknown> | null) ?? {}),
  };
  const oauthClientId =
    data.kind === "REPORTING_FUSION"
      ? data.oauthClientId?.trim()
      : data.username?.trim();
  const oauthClientSecret =
    data.kind === "REPORTING_FUSION"
      ? data.oauthClientSecret?.trim()
      : undefined;
  const oauthRefreshToken =
    data.kind === "REPORTING_FUSION"
      ? data.oauthRefreshToken?.trim()
      : undefined;

  if (normalizedTestPath) {
    nextMetadata.testPath = normalizedTestPath;
  } else {
    delete nextMetadata.testPath;
  }

  if (data.kind === "REPORTING_FUSION") {
    const nextOAuth = {
      ...asRecord(nextMetadata.oauth),
    };

    if (oauthClientSecret) {
      nextOAuth.clientSecretEncrypted = encryptSecret(oauthClientSecret);
    }

    if (oauthRefreshToken) {
      nextOAuth.refreshTokenEncrypted = encryptSecret(oauthRefreshToken);
    }

    if (
      oauthClientSecret ||
      oauthRefreshToken ||
      oauthClientId ||
      data.secret?.trim()
    ) {
      nextOAuth.tokenPath =
        typeof nextOAuth.tokenPath === "string"
          ? nextOAuth.tokenPath
          : "/oauth2/token/v3";
      delete nextOAuth.lastRefreshErrorAt;
      delete nextOAuth.lastRefreshErrorMessage;
    }

    if (
      (oauthClientSecret || oauthRefreshToken || oauthClientId) &&
      !data.secret?.trim()
    ) {
      delete nextOAuth.accessTokenExpiresAt;
    }

    if (Object.keys(nextOAuth).length > 0) {
      nextMetadata.oauth = nextOAuth;
    }
  }

  const credentialsChanged =
    Boolean(oauthClientId) ||
    Boolean(data.secret?.trim()) ||
    Boolean(oauthClientSecret) ||
    Boolean(oauthRefreshToken) ||
    (data.baseUrl || resolveFallbackBaseUrl(data.kind)) !==
      (existing?.baseUrl ?? resolveFallbackBaseUrl(data.kind)) ||
    ((typeof nextMetadata.testPath === "string"
      ? nextMetadata.testPath
      : undefined) ?? "") !==
      ((existing?.metadataJson as { testPath?: string } | null)?.testPath ??
        "");

  const nextRecord = await upsertCredentialSet(tenantId, data.kind, {
    tenantId,
    kind: data.kind,
    label: data.label,
    usernameEncrypted: oauthClientId
      ? encryptSecret(oauthClientId)
      : (existing?.usernameEncrypted ?? null),
    secretEncrypted: data.secret?.trim()
      ? encryptSecret(data.secret.trim())
      : (existing?.secretEncrypted ?? ""),
    baseUrl: data.baseUrl || resolveFallbackBaseUrl(data.kind),
    isEnabled: data.isEnabled,
    metadataJson: toJsonValue(nextMetadata),
    ...(credentialsChanged
      ? {
          lastTestStatus: "UNTESTED",
          lastErrorMessage: null,
          lastTestedAt: null,
        }
      : {}),
  });

  const capabilityKeys = getCapabilityKeysForCredential(data.kind);

  if (capabilityKeys.length > 0) {
    const currentCapabilities = await getCapabilityFlags(tenantId);
    const nextCapabilities: CapabilityFlags = { ...currentCapabilities };

    for (const key of capabilityKeys) {
      nextCapabilities[key] = nextRecord.isEnabled;
    }

    await upsertSystemSetting(
      tenantId,
      "yelpCapabilities",
      normalizeCapabilityFlags(nextCapabilities),
    );
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
      isEnabled: data.isEnabled,
      oauthClientIdProvided:
        data.kind === "REPORTING_FUSION" ? Boolean(oauthClientId) : undefined,
      oauthClientSecretProvided:
        data.kind === "REPORTING_FUSION"
          ? Boolean(oauthClientSecret)
          : undefined,
      oauthRefreshTokenProvided:
        data.kind === "REPORTING_FUSION"
          ? Boolean(oauthRefreshToken)
          : undefined,
    }),
    before: existing
      ? {
          ...existing,
          secretEncrypted: existing.secretEncrypted ? "configured" : null,
          usernameEncrypted: existing.usernameEncrypted ? "configured" : null,
        }
      : undefined,
    after: {
      ...nextRecord,
      secretEncrypted: nextRecord.secretEncrypted ? "configured" : null,
      usernameEncrypted: nextRecord.usernameEncrypted ? "configured" : null,
    },
  });

  return nextRecord;
}

export async function saveCapabilityFlags(
  tenantId: string,
  actorId: string,
  input: unknown,
) {
  const flags = normalizeCapabilityFlags(capabilityFlagsSchema.parse(input));
  const existing = await getSystemSetting(tenantId, "yelpCapabilities");

  const saved = await upsertSystemSetting(tenantId, "yelpCapabilities", flags);

  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: "settings.capabilities.save",
    status: "SUCCESS",
    before: existing as never,
    after: flags as never,
  });

  return saved;
}

function toSafeUserSummary(user: Awaited<ReturnType<typeof createTenantUser>>) {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    name: user.name,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    role: {
      code: user.role.code,
      name: user.role.name,
    },
  };
}

export async function createSettingsUser(
  tenantId: string,
  actorId: string,
  input: unknown,
) {
  const values = userCreateSchema.parse(input);
  const actor = await getUserById(actorId);

  if (!canAssignRole(actor.role.code, values.roleCode)) {
    throw new YelpValidationError("You are not allowed to assign this role.");
  }

  const existing = await findUserByEmail(values.email);

  if (existing) {
    throw new YelpValidationError("A user with this email already exists.");
  }

  const created = await createTenantUser({
    tenantId,
    name: values.name.trim(),
    email: values.email,
    roleCode: values.roleCode,
    passwordHash: await hashPassword(values.password),
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: "settings.user.create",
    status: "SUCCESS",
    requestSummary: {
      email: created.email,
      name: created.name,
      roleCode: created.role.code,
    },
    after: {
      id: created.id,
      email: created.email,
      name: created.name,
      roleCode: created.role.code,
      isActive: created.isActive,
    },
  });

  return toSafeUserSummary(created);
}

export async function saveUserRole(
  tenantId: string,
  actorId: string,
  userId: string,
  roleCode: RoleCode,
) {
  const actor = await getUserById(actorId);

  if (!canAssignRole(actor.role.code, roleCode)) {
    throw new YelpValidationError("You are not allowed to assign this role.");
  }

  const existing = await getTenantUserById(userId, tenantId);

  if (
    existing.role.code === "CLIENT_ADMIN" &&
    roleCode !== "CLIENT_ADMIN" &&
    existing.isActive
  ) {
    const activeAdminCount = await countActiveUsersByRole(
      tenantId,
      "CLIENT_ADMIN",
    );

    if (activeAdminCount <= 1) {
      throw new YelpValidationError(
        "At least one active Client administrator must remain assigned to this tenant.",
      );
    }
  }

  if (
    existing.role.code === "PLATFORM_ADMIN" &&
    roleCode !== "PLATFORM_ADMIN" &&
    existing.isActive
  ) {
    const activePlatformAdminCount =
      await countActiveUsersByRoleGlobally("PLATFORM_ADMIN");

    if (activePlatformAdminCount <= 1) {
      throw new YelpValidationError(
        "At least one active Platform administrator must remain assigned.",
      );
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
      roleCode,
    },
    after: {
      userId,
      roleCode: updated.role.code,
    },
    before: {
      userId,
      roleCode: existing.role.code,
    },
  });

  return toSafeUserSummary(updated);
}

async function getConnectionTester(
  tenantId: string,
  kind: CredentialKind,
): Promise<TestableConnectionClient> {
  const credential = await getCredentialConfig(tenantId, kind);

  if (!credential) {
    throw new YelpValidationError(
      "Save credentials first before testing the connection.",
    );
  }

  switch (kind) {
    case "ADS_BASIC_AUTH":
      return new YelpAdsClient(credential);
    case "REPORTING_FUSION": {
      const businesses = await listLeadBusinessOptions(tenantId);
      const business = businesses.find((entry) =>
        Boolean(entry.encryptedYelpBusinessId),
      );

      if (!business?.encryptedYelpBusinessId) {
        return new YelpReportingClient(credential);
      }

      const { credential: leadsCredential } =
        await ensureYelpLeadsAccess(tenantId);
      const leadsClient = new YelpLeadsClient(leadsCredential);

      return {
        testConnection: () =>
          leadsClient.getBusinessLeadIds(business.encryptedYelpBusinessId!, {
            limit: 1,
            offset: 0,
          }),
      };
    }
    case "BUSINESS_MATCH":
      return new YelpBusinessMatchClient(credential);
    case "DATA_INGESTION":
      return new YelpDataIngestionClient(credential);
    case "CRM_SERVICETITAN": {
      const metadata =
        (credential.metadata as Record<string, unknown> | null) ?? null;
      const environment =
        metadata?.environment === "INTEGRATION" ? "INTEGRATION" : "PRODUCTION";
      const defaults = getDefaultServiceTitanUrls(environment);

      return new ServiceTitanClient({
        label: credential.label,
        isEnabled: credential.isEnabled,
        environment,
        apiBaseUrl: credential.baseUrl || defaults.apiBaseUrl,
        authBaseUrl:
          typeof metadata?.authBaseUrl === "string" &&
          metadata.authBaseUrl.trim().length > 0
            ? metadata.authBaseUrl
            : defaults.authBaseUrl,
        tenantId:
          typeof metadata?.tenantId === "string" ? metadata.tenantId : "",
        appKey: typeof metadata?.appKey === "string" ? metadata.appKey : "",
        clientId: credential.username ?? "",
        clientSecret: credential.secret ?? "",
      });
    }
    default:
      return new YelpFeaturesClient(credential);
  }
}

export async function testCredentialConnection(
  tenantId: string,
  actorId: string,
  kind: CredentialKind,
) {
  const existing = await getCredentialSet(tenantId, kind);
  const credential = await getCredentialConfig(tenantId, kind);
  const testPath =
    typeof credential?.metadata?.testPath === "string" &&
    credential.metadata.testPath.trim().length > 0
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
        message: "Yelp Ads docs do not define a generic health-check path.",
      }),
    });

    return {
      status: "SUCCESS" as ConnectionTestStatus,
      message:
        "Credentials saved. Yelp Ads does not document a generic health-check endpoint. Add a safe readable endpoint only if you want live verification.",
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
        result: "Connection successful",
      }),
    });

    return {
      status: "SUCCESS" as ConnectionTestStatus,
      message: "Connection successful.",
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
        testPath,
      }),
      rawPayloadSummary: normalized.details as never,
    });

    return {
      status: "FAILED" as ConnectionTestStatus,
      message,
    };
  }
}
