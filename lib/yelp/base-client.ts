import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { fetchWithRetry } from "@/lib/utils/fetch";
import { logError, logInfo } from "@/lib/utils/logging";
import { normalizeYelpError, YelpApiError, YelpUpstreamUnavailableError } from "@/lib/yelp/errors";
import type { YelpCredentialConfig } from "@/lib/yelp/runtime";

type YelpRequestOptions<TSchema extends z.ZodTypeAny> = {
  credential: YelpCredentialConfig;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | Array<string | number | boolean> | undefined>;
  body?: unknown;
  schema?: TSchema;
  authType: "basic" | "bearer";
  correlationId?: string;
  headers?: HeadersInit;
};

function buildUrl(baseUrl: string, path: string, query?: YelpRequestOptions<z.ZodTypeAny>["query"]) {
  const url = new URL(path, baseUrl);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const entry of value) {
          url.searchParams.append(key, String(entry));
        }
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function buildAuthHeaders(authType: YelpRequestOptions<z.ZodTypeAny>["authType"], credential: YelpCredentialConfig) {
  if (authType === "basic") {
    if (!credential.username || !credential.secret) {
      throw new YelpUpstreamUnavailableError("Yelp Basic Auth credentials are incomplete.");
    }

    return {
      Authorization: `Basic ${Buffer.from(`${credential.username}:${credential.secret}`).toString("base64")}`
    };
  }

  if (!credential.secret) {
    throw new YelpUpstreamUnavailableError("Yelp API key is missing.");
  }

  return {
    Authorization: `Bearer ${credential.secret}`
  };
}

function resolveApiFamily(pathname: string) {
  if (
    pathname.startsWith("/v3/leads") ||
    /^\/v3\/businesses\/[^/]+\/lead_ids$/.test(pathname)
  ) {
    return "leads.api_requests";
  }

  if (pathname === "/v3/businesses/subscriptions" || /^\/v3\/businesses\/subscriptions\/[^/]+\/quota$/.test(pathname)) {
    return "business_subscriptions.api_requests";
  }

  if (pathname.startsWith("/v1/reporting") || pathname.startsWith("/v1/reports")) {
    return "reporting.api_requests";
  }

  return "yelp.api_requests";
}

export async function requestYelp<TSchema extends z.ZodTypeAny>({
  credential,
  method = "GET",
  path,
  query,
  body,
  schema,
  authType,
  correlationId = randomUUID(),
  headers
}: YelpRequestOptions<TSchema>) {
  const url = buildUrl(credential.baseUrl, path, query);
  const startedAt = Date.now();
  const apiFamily = resolveApiFamily(url.pathname);

  logInfo("yelp.request", {
    method,
    url: url.toString(),
    correlationId,
    apiFamily
  });

  const response = await fetchWithRetry(url, {
    method,
    headers: {
      Accept: "application/json",
      "X-Correlation-Id": correlationId,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...buildAuthHeaders(authType, credential),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    retries: 2,
    timeoutMs: 15_000
  });

  if (!response.ok) {
    const normalized = await normalizeYelpError(response);

    logError("yelp.request.failed", {
      method,
      url: url.toString(),
      correlationId,
      apiFamily,
      status: response.status,
      durationMs: Date.now() - startedAt,
      code: normalized.code,
      message: normalized.message
    });

    throw normalized;
  }

  logInfo("yelp.request.completed", {
    method,
    url: url.toString(),
    correlationId,
    apiFamily,
    status: response.status,
    durationMs: Date.now() - startedAt
  });

  if (!schema) {
    return {
      correlationId,
      data: null
    } as const;
  }

  const json = await response.json();
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    throw new YelpApiError("Yelp returned a response format this console could not parse.", "UPSTREAM_RESPONSE_INVALID", 502, {
      issues: parsed.error.issues,
      rawResponse: json
    });
  }

  return {
    correlationId,
    data: parsed.data
  } as const;
}
