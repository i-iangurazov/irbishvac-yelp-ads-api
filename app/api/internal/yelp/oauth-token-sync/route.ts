import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditEvent } from "@/features/audit/service";
import {
  getCredentialSet,
  upsertCredentialSet,
} from "@/lib/db/credentials-repository";
import { toJsonValue } from "@/lib/db/json";
import { getDefaultTenant } from "@/lib/db/tenant";
import { encryptSecret } from "@/lib/utils/crypto";
import { getServerEnv } from "@/lib/utils/env";
import { handleRouteError } from "@/lib/utils/http";

const tokenSyncSchema = z.object({
  accessToken: z.string().min(1).max(4000),
  refreshToken: z.string().min(1).max(4000),
  tokenType: z.string().min(1).max(100).default("Bearer"),
  expiresOn: z.string().datetime({ offset: true }),
  scope: z.string().max(4000).nullable().optional(),
});

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function secretsMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export async function POST(request: Request) {
  try {
    const env = getServerEnv();
    const expectedSecret =
      env.MAIN_PLATFORM_WEBHOOK_SHARED_SECRET?.trim() ?? "";

    if (!expectedSecret) {
      return NextResponse.json(
        {
          ok: false,
          error: "OAuth token sync authentication is not configured.",
        },
        { status: 503 },
      );
    }

    const providedSecret =
      request.headers.get("x-irbis-forward-secret")?.trim() ?? "";

    if (!providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized." },
        { status: 401 },
      );
    }

    const data = tokenSyncSchema.parse(await request.json());
    const expiresAt = Date.parse(data.expiresOn);

    if (expiresAt <= Date.now() + 5 * 60 * 1000) {
      return NextResponse.json(
        {
          ok: false,
          error: "The supplied Yelp access token is expired or near expiry.",
        },
        { status: 422 },
      );
    }

    const tenant = await getDefaultTenant();
    const existing = await getCredentialSet(tenant.id, "REPORTING_FUSION");
    const metadata = asRecord(existing?.metadataJson);
    const existingOauth = asRecord(metadata.oauth);
    const clientId = env.YELP_CLIENT_ID?.trim();
    const clientSecret = env.YELP_CLIENT_SECRET?.trim();

    if (!existing?.usernameEncrypted && !clientId) {
      throw new Error("YELP_CLIENT_ID is required for durable OAuth refresh.");
    }

    if (!existingOauth.clientSecretEncrypted && !clientSecret) {
      throw new Error(
        "YELP_CLIENT_SECRET is required for durable OAuth refresh.",
      );
    }

    const syncedAt = new Date().toISOString();
    const nextOauth: Record<string, unknown> = {
      ...existingOauth,
      tokenPath: "/oauth2/token/v3",
      tokenType: data.tokenType,
      accessTokenExpiresAt: new Date(expiresAt).toISOString(),
      refreshTokenEncrypted: encryptSecret(data.refreshToken),
      tokenSource: "webhook-oauth-callback",
      lastSyncedAt: syncedAt,
    };

    if (clientSecret) {
      nextOauth.clientSecretEncrypted = encryptSecret(clientSecret);
    }

    if (data.scope) {
      nextOauth.scope = data.scope;
    }

    delete nextOauth.lastRefreshErrorAt;
    delete nextOauth.lastRefreshErrorMessage;

    await upsertCredentialSet(tenant.id, "REPORTING_FUSION", {
      tenantId: tenant.id,
      kind: "REPORTING_FUSION",
      label: existing?.label ?? "Yelp API Bearer Token",
      usernameEncrypted: clientId
        ? encryptSecret(clientId)
        : (existing?.usernameEncrypted ?? null),
      secretEncrypted: encryptSecret(data.accessToken),
      baseUrl: existing?.baseUrl ?? env.YELP_REPORTING_BASE_URL,
      isEnabled: true,
      lastTestStatus: "UNTESTED",
      lastTestedAt: null,
      lastErrorMessage: null,
      metadataJson: toJsonValue({ ...metadata, oauth: nextOauth }),
    });

    await recordAuditEvent({
      tenantId: tenant.id,
      actionType: "settings.credential.reporting_fusion.webhook_oauth_sync",
      status: "SUCCESS",
      requestSummary: {
        source: "webhook-oauth-callback",
        tokenType: data.tokenType,
        accessTokenExpiresAt: new Date(expiresAt).toISOString(),
        scopeConfigured: Boolean(data.scope),
      },
      after: {
        credentialKind: "REPORTING_FUSION",
        enabled: true,
        accessTokenConfigured: true,
        refreshTokenConfigured: true,
        syncedAt,
      },
    });

    return NextResponse.json({
      ok: true,
      credentialKind: "REPORTING_FUSION",
      accessTokenExpiresAt: new Date(expiresAt).toISOString(),
      refreshTokenConfigured: true,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
