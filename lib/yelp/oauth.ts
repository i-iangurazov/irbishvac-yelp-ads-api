import "server-only";

import { z } from "zod";

import { toJsonValue } from "@/lib/db/json";
import { fetchWithRetry } from "@/lib/utils/fetch";
import { YelpApiError, YelpAuthFailureError } from "@/lib/yelp/errors";

const yelpOAuthTokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.string().optional(),
    expires_in: z.number().optional(),
    expires_on: z.string().optional(),
    refresh_token: z.string().optional(),
    refresh_token_expires_in: z.number().optional(),
    refresh_token_expires_on: z.string().optional(),
  })
  .passthrough();

export type YelpOAuthRefreshResult = {
  accessToken: string;
  tokenType: string;
  accessTokenExpiresAt: string | null;
  refreshToken?: string;
  refreshTokenExpiresAt?: string | null;
  rawResponse: unknown;
};

async function readResponsePayload(response: Response) {
  try {
    return await response.clone().json();
  } catch {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
}

function resolveExpiresAt(
  expiresOn: string | undefined,
  expiresIn: number | undefined,
) {
  if (expiresOn) {
    const parsed = Date.parse(expiresOn);

    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  if (
    typeof expiresIn === "number" &&
    Number.isFinite(expiresIn) &&
    expiresIn > 0
  ) {
    return new Date(Date.now() + expiresIn * 1000).toISOString();
  }

  return null;
}

export async function refreshYelpOAuthAccessToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  baseUrl: string;
  tokenPath?: "/oauth2/token" | "/oauth2/token/v3";
}) {
  const url = new URL(params.tokenPath ?? "/oauth2/token/v3", params.baseUrl);
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  });

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    retries: 1,
    timeoutMs: 15_000,
  });

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw new YelpAuthFailureError({
      oauthRefreshFailed: true,
      status: response.status,
      payload,
    });
  }

  const parsed = yelpOAuthTokenResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new YelpApiError(
      "Yelp returned an invalid OAuth token response.",
      "UPSTREAM_RESPONSE_INVALID",
      502,
      {
        issues: parsed.error.issues,
        rawResponse: toJsonValue(payload),
      },
    );
  }

  return {
    accessToken: parsed.data.access_token,
    tokenType: parsed.data.token_type ?? "Bearer",
    accessTokenExpiresAt: resolveExpiresAt(
      parsed.data.expires_on,
      parsed.data.expires_in,
    ),
    refreshToken: parsed.data.refresh_token,
    refreshTokenExpiresAt: resolveExpiresAt(
      parsed.data.refresh_token_expires_on,
      parsed.data.refresh_token_expires_in,
    ),
    rawResponse: toJsonValue({
      token_type: parsed.data.token_type,
      expires_in: parsed.data.expires_in,
      expires_on: parsed.data.expires_on,
      refresh_token_expires_in: parsed.data.refresh_token_expires_in,
      refresh_token_expires_on: parsed.data.refresh_token_expires_on,
    }),
  } satisfies YelpOAuthRefreshResult;
}
