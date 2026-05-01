import "server-only";

import type { CredentialKind } from "@prisma/client";

import { normalizeCapabilityFlags, type CapabilityFlags as YelpCapabilityFlags } from "@/features/settings/capabilities";
import { getCredentialSet } from "@/lib/db/credentials-repository";
import { getSystemSetting } from "@/lib/db/settings-repository";
import { decryptSecret } from "@/lib/utils/crypto";
import { getServerEnv } from "@/lib/utils/env";
import { YelpMissingAccessError } from "@/lib/yelp/errors";

export type YelpCredentialConfig = {
  label: string;
  baseUrl: string;
  isEnabled: boolean;
  username?: string;
  secret?: string;
  metadata?: Record<string, unknown> | null;
};

export async function getCapabilityFlags(tenantId: string) {
  const stored = await getSystemSetting<Partial<YelpCapabilityFlags>>(tenantId, "yelpCapabilities");
  return normalizeCapabilityFlags(stored);
}

export async function getCredentialConfig(tenantId: string, kind: CredentialKind): Promise<YelpCredentialConfig | null> {
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
    username: credential.usernameEncrypted ? decryptSecret(credential.usernameEncrypted) : undefined,
    secret: credential.secretEncrypted ? decryptSecret(credential.secretEncrypted) : undefined,
    metadata: (credential.metadataJson as Record<string, unknown> | null) ?? null
  };
}

export async function ensureYelpAccess(params: {
  tenantId: string;
  capabilityKey: keyof YelpCapabilityFlags;
  credentialKind: CredentialKind;
}) {
  const capabilities = await getCapabilityFlags(params.tenantId);
  const credential = await getCredentialConfig(params.tenantId, params.credentialKind);

  if (!capabilities[params.capabilityKey]) {
    throw new YelpMissingAccessError("Not enabled by Yelp / missing capability flag.");
  }

  if (!credential?.isEnabled || !credential.secret) {
    throw new YelpMissingAccessError("Not enabled by Yelp / missing credentials.");
  }

  return { capabilities, credential };
}

export async function ensureYelpLeadsAccess(tenantId: string) {
  const capabilities = await getCapabilityFlags(tenantId);

  if (!capabilities.hasLeadsApi) {
    throw new YelpMissingAccessError("Yelp Leads is not enabled for this tenant.");
  }

  const reportingCredential = await getCredentialConfig(tenantId, "REPORTING_FUSION");
  const env = getServerEnv();
  const secret =
    (reportingCredential?.isEnabled && reportingCredential.secret ? reportingCredential.secret : undefined) ||
    env.YELP_ACCESS_TOKEN ||
    env.YELP_API_KEY;

  if (!secret) {
    throw new YelpMissingAccessError(
      "A Yelp bearer token is required for Leads API reads. Save the Yelp API bearer token in Settings, or configure YELP_ACCESS_TOKEN."
    );
  }

  return {
    capabilities,
    credential: {
      label: reportingCredential?.label ?? "Yelp Leads bearer token",
      baseUrl: reportingCredential?.baseUrl || env.YELP_REPORTING_BASE_URL,
      isEnabled: true,
      secret,
      metadata: reportingCredential?.metadata ?? null
    } satisfies YelpCredentialConfig
  };
}

export async function ensureYelpBusinessSubscriptionsAccess(tenantId: string) {
  const reportingCredential = await getCredentialConfig(tenantId, "REPORTING_FUSION");
  const env = getServerEnv();
  const secret =
    (reportingCredential?.isEnabled && reportingCredential.secret ? reportingCredential.secret : undefined) ||
    env.YELP_API_KEY ||
    env.YELP_ACCESS_TOKEN;

  if (!secret) {
    throw new YelpMissingAccessError(
      "A Yelp Places API key is required for Business Subscriptions. Configure YELP_API_KEY or save a bearer token in Settings."
    );
  }

  return {
    credential: {
      label: reportingCredential?.label ?? "Yelp Business Subscriptions bearer token",
      baseUrl: reportingCredential?.baseUrl || env.YELP_REPORTING_BASE_URL,
      isEnabled: true,
      secret,
      metadata: reportingCredential?.metadata ?? null
    } satisfies YelpCredentialConfig
  };
}
