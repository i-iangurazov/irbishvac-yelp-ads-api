import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { fetchWithRetry } from "@/lib/utils/fetch";
import { logInfo } from "@/lib/utils/logging";
import { normalizeYelpError, YelpUpstreamUnavailableError } from "@/lib/yelp/errors";
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

  logInfo("yelp.request", {
    method,
    url: url.toString(),
    correlationId
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
    throw await normalizeYelpError(response);
  }

  if (!schema) {
    return {
      correlationId,
      data: null
    } as const;
  }

  const json = await response.json();

  return {
    correlationId,
    data: schema.parse(json)
  } as const;
}
