import "server-only";

import { decryptSecret } from "@/lib/utils/crypto";
import { getCredentialSet } from "@/lib/db/credentials-repository";

export type ServiceTitanEnvironment = "INTEGRATION" | "PRODUCTION";

export type ServiceTitanCredentialConfig = {
  label: string;
  isEnabled: boolean;
  environment: ServiceTitanEnvironment;
  apiBaseUrl: string;
  authBaseUrl: string;
  tenantId: string;
  appKey: string;
  clientId: string;
  clientSecret: string;
};

export function getDefaultServiceTitanUrls(environment: ServiceTitanEnvironment) {
  if (environment === "INTEGRATION") {
    return {
      apiBaseUrl: "https://api-integration.servicetitan.io",
      authBaseUrl: "https://auth-integration.servicetitan.io"
    };
  }

  return {
    apiBaseUrl: "https://api.servicetitan.io",
    authBaseUrl: "https://auth.servicetitan.io"
  };
}

export async function getServiceTitanCredentialConfig(tenantId: string): Promise<ServiceTitanCredentialConfig | null> {
  const credential = await getCredentialSet(tenantId, "CRM_SERVICETITAN");

  if (!credential) {
    return null;
  }

  const metadata = (credential.metadataJson as Record<string, unknown> | null) ?? null;
  const environment = metadata?.environment === "INTEGRATION" ? "INTEGRATION" : "PRODUCTION";
  const defaults = getDefaultServiceTitanUrls(environment);
  const clientId = credential.usernameEncrypted ? decryptSecret(credential.usernameEncrypted) : "";
  const clientSecret = credential.secretEncrypted ? decryptSecret(credential.secretEncrypted) : "";
  const tenantValue = typeof metadata?.tenantId === "string" ? metadata.tenantId.trim() : "";
  const appKeyValue = typeof metadata?.appKey === "string" ? metadata.appKey.trim() : "";
  const authBaseUrlValue =
    typeof metadata?.authBaseUrl === "string" && metadata.authBaseUrl.trim().length > 0
      ? metadata.authBaseUrl.trim()
      : defaults.authBaseUrl;

  return {
    label: credential.label,
    isEnabled: credential.isEnabled,
    environment,
    apiBaseUrl: credential.baseUrl || defaults.apiBaseUrl,
    authBaseUrl: authBaseUrlValue,
    tenantId: tenantValue,
    appKey: appKeyValue,
    clientId,
    clientSecret
  };
}

