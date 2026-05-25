import "server-only";

import type { CredentialKind } from "@prisma/client";

import {
  normalizeCapabilityFlags,
  type CapabilityFlags as YelpCapabilityFlags,
} from "@/features/settings/capabilities";
import {
  getCredentialSet,
  updateCredentialAuthMaterial,
} from "@/lib/db/credentials-repository";
import { toJsonValue } from "@/lib/db/json";
import { getSystemSetting } from "@/lib/db/settings-repository";
import { decryptSecret, encryptSecret } from "@/lib/utils/crypto";
import { getServerEnv } from "@/lib/utils/env";
import { YelpMissingAccessError } from "@/lib/yelp/errors";
import { refreshYelpOAuthAccessToken } from "@/lib/yelp/oauth";

export type YelpCredentialConfig = {
  label: string;
  baseUrl: string;
  isEnabled: boolean;
  username?: string;
  secret?: string;
  metadata?: Record<string, unknown> | null;
};

const OAUTH_REFRESH_SKEW_MS = 5 * 60 * 1000;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function getOAuthMetadata(
  metadata: Record<string, unknown> | null | undefined,
) {
  return asRecord(asRecord(metadata).oauth);
}

function shouldRefreshOAuthAccessToken(credential: YelpCredentialConfig) {
  const oauth = getOAuthMetadata(credential.metadata);
  const encryptedRefreshToken = getString(oauth.refreshTokenEncrypted);

  if (!encryptedRefreshToken) {
    return false;
  }

  if (!credential.secret) {
    return true;
  }

  const accessTokenExpiresAt = getString(oauth.accessTokenExpiresAt);

  if (!accessTokenExpiresAt) {
    return true;
  }

  const expiresAtMs = Date.parse(accessTokenExpiresAt);

  return (
    Number.isNaN(expiresAtMs) ||
    expiresAtMs <= Date.now() + OAUTH_REFRESH_SKEW_MS
  );
}

async function refreshSavedYelpOAuthCredential(
  tenantId: string,
  credential: YelpCredentialConfig,
) {
  if (!shouldRefreshOAuthAccessToken(credential)) {
    return credential;
  }

  const env = getServerEnv();
  const metadata = asRecord(credential.metadata);
  const oauth = getOAuthMetadata(metadata);
  const clientId = credential.username || env.YELP_CLIENT_ID;
  const encryptedClientSecret = getString(oauth.clientSecretEncrypted);
  const clientSecret = encryptedClientSecret
    ? decryptSecret(encryptedClientSecret)
    : env.YELP_CLIENT_SECRET;
  const encryptedRefreshToken = getString(oauth.refreshTokenEncrypted);
  const refreshToken = encryptedRefreshToken
    ? decryptSecret(encryptedRefreshToken)
    : undefined;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new YelpMissingAccessError(
      "Yelp OAuth refresh is configured, but the client ID, client secret, or refresh token is missing.",
    );
  }

  try {
    const refreshed = await refreshYelpOAuthAccessToken({
      clientId,
      clientSecret,
      refreshToken,
      baseUrl: credential.baseUrl || env.YELP_REPORTING_BASE_URL,
      tokenPath:
        getString(oauth.tokenPath) === "/oauth2/token"
          ? "/oauth2/token"
          : "/oauth2/token/v3",
    });
    const nextOauth: Record<string, unknown> = {
      ...oauth,
      tokenPath:
        getString(oauth.tokenPath) === "/oauth2/token"
          ? "/oauth2/token"
          : "/oauth2/token/v3",
      tokenType: refreshed.tokenType,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
      refreshTokenExpiresAt:
        refreshed.refreshTokenExpiresAt ??
        getString(oauth.refreshTokenExpiresAt),
      refreshTokenEncrypted: refreshed.refreshToken
        ? encryptSecret(refreshed.refreshToken)
        : encryptedRefreshToken,
      lastRefreshedAt: new Date().toISOString(),
    };
    delete nextOauth.lastRefreshErrorAt;
    delete nextOauth.lastRefreshErrorMessage;

    const nextMetadata = {
      ...metadata,
      oauth: nextOauth,
    };

    await updateCredentialAuthMaterial(tenantId, "REPORTING_FUSION", {
      secretEncrypted: encryptSecret(refreshed.accessToken),
      metadataJson: toJsonValue(nextMetadata),
      lastErrorMessage: null,
    });

    return {
      ...credential,
      secret: refreshed.accessToken,
      metadata: nextMetadata,
    } satisfies YelpCredentialConfig;
  } catch (error) {
    const nextMetadata = {
      ...metadata,
      oauth: {
        ...oauth,
        lastRefreshErrorAt: new Date().toISOString(),
        lastRefreshErrorMessage:
          error instanceof Error
            ? error.message
            : "Yelp OAuth token refresh failed.",
      },
    };

    await updateCredentialAuthMaterial(tenantId, "REPORTING_FUSION", {
      metadataJson: toJsonValue(nextMetadata),
    });

    throw error;
  }
}

export async function getCapabilityFlags(tenantId: string) {
  const stored = await getSystemSetting<Partial<YelpCapabilityFlags>>(
    tenantId,
    "yelpCapabilities",
  );
  return normalizeCapabilityFlags(stored);
}

export async function getCredentialConfig(
  tenantId: string,
  kind: CredentialKind,
): Promise<YelpCredentialConfig | null> {
  const credential = await getCredentialSet(tenantId, kind);

  if (!credential) {
    return null;
  }

  const env = getServerEnv();

  const fallbackBaseUrl =
    kind === "REPORTING_FUSION"
      ? env.YELP_REPORTING_BASE_URL
      : kind === "BUSINESS_MATCH"
        ? env.YELP_BUSINESS_MATCH_BASE_URL
        : kind === "DATA_INGESTION"
          ? env.YELP_DATA_INGESTION_BASE_URL
          : env.YELP_ADS_BASE_URL;

  return {
    label: credential.label,
    baseUrl: credential.baseUrl || fallbackBaseUrl,
    isEnabled: credential.isEnabled,
    username: credential.usernameEncrypted
      ? decryptSecret(credential.usernameEncrypted)
      : undefined,
    secret: credential.secretEncrypted
      ? decryptSecret(credential.secretEncrypted)
      : undefined,
    metadata:
      (credential.metadataJson as Record<string, unknown> | null) ?? null,
  };
}

export async function ensureYelpAccess(params: {
  tenantId: string;
  capabilityKey: keyof YelpCapabilityFlags;
  credentialKind: CredentialKind;
}) {
  const capabilities = await getCapabilityFlags(params.tenantId);
  const credential = await getCredentialConfig(
    params.tenantId,
    params.credentialKind,
  );

  if (!capabilities[params.capabilityKey]) {
    throw new YelpMissingAccessError(
      "Not enabled by Yelp / missing capability flag.",
    );
  }

  if (!credential?.isEnabled || !credential.secret) {
    throw new YelpMissingAccessError(
      "Not enabled by Yelp / missing credentials.",
    );
  }

  return { capabilities, credential };
}

export async function ensureYelpLeadsAccess(tenantId: string) {
  const capabilities = await getCapabilityFlags(tenantId);

  if (!capabilities.hasLeadsApi) {
    throw new YelpMissingAccessError(
      "Yelp Leads is not enabled for this tenant.",
    );
  }

  const reportingCredential = await getCredentialConfig(
    tenantId,
    "REPORTING_FUSION",
  );
  const savedCredential = reportingCredential?.isEnabled
    ? await refreshSavedYelpOAuthCredential(tenantId, reportingCredential)
    : reportingCredential;
  const env = getServerEnv();
  const secret =
    (savedCredential?.isEnabled && savedCredential.secret
      ? savedCredential.secret
      : undefined) ||
    env.YELP_ACCESS_TOKEN ||
    env.YELP_API_KEY;

  if (!secret) {
    throw new YelpMissingAccessError(
      "A Yelp bearer token is required for Leads API reads. Save the Yelp API bearer token in Settings, or configure YELP_ACCESS_TOKEN.",
    );
  }

  return {
    capabilities,
    credential: {
      label: savedCredential?.label ?? "Yelp Leads bearer token",
      baseUrl: savedCredential?.baseUrl || env.YELP_REPORTING_BASE_URL,
      isEnabled: true,
      secret,
      metadata: savedCredential?.metadata ?? null,
    } satisfies YelpCredentialConfig,
  };
}

export async function ensureYelpBusinessSubscriptionsAccess(tenantId: string) {
  const reportingCredential = await getCredentialConfig(
    tenantId,
    "REPORTING_FUSION",
  );
  const env = getServerEnv();
  const secret =
    (reportingCredential?.isEnabled && reportingCredential.secret
      ? reportingCredential.secret
      : undefined) ||
    env.YELP_API_KEY ||
    env.YELP_ACCESS_TOKEN;

  if (!secret) {
    throw new YelpMissingAccessError(
      "A Yelp Places API key is required for Business Subscriptions. Configure YELP_API_KEY or save a bearer token in Settings.",
    );
  }

  return {
    credential: {
      label:
        reportingCredential?.label ??
        "Yelp Business Subscriptions bearer token",
      baseUrl: reportingCredential?.baseUrl || env.YELP_REPORTING_BASE_URL,
      isEnabled: true,
      secret,
      metadata: reportingCredential?.metadata ?? null,
    } satisfies YelpCredentialConfig,
  };
}
