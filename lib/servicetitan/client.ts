import "server-only";

import { z } from "zod";

import { fetchWithRetry } from "@/lib/utils/fetch";
import { logError, logInfo } from "@/lib/utils/logging";
import { normalizeUnknownError, YelpApiError, YelpValidationError } from "@/lib/yelp/errors";
import type { ServiceTitanCredentialConfig } from "@/lib/servicetitan/runtime";
import {
  serviceTitanAppointmentSchema,
  createServiceTitanPagedResponseSchema,
  serviceTitanBusinessUnitSchema,
  serviceTitanCategorySchema,
  serviceTitanEmployeesProbeSchema,
  serviceTitanJobSchema,
  serviceTitanLeadSchema,
  serviceTitanTokenResponseSchema
} from "@/lib/servicetitan/schemas";

const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

function buildCacheKey(config: ServiceTitanCredentialConfig) {
  return `${config.environment}:${config.authBaseUrl}:${config.clientId}:${config.tenantId}`;
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, baseUrl);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

async function parseJsonResponse<TSchema extends z.ZodTypeAny>(response: Response, schema: TSchema) {
  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    throw new YelpApiError(
      "ServiceTitan returned a response this console could not parse.",
      "UPSTREAM_RESPONSE_INVALID",
      502,
      {
        issues: parsed.error.issues,
        payload
      }
    );
  }

  return parsed.data;
}

export class ServiceTitanClient {
  constructor(private readonly config: ServiceTitanCredentialConfig) {}

  private validateConfig() {
    if (!this.config.clientId || !this.config.clientSecret || !this.config.tenantId || !this.config.appKey) {
      throw new YelpValidationError(
        "ServiceTitan setup is incomplete. Save client ID, client secret, tenant ID, and app key before testing or syncing."
      );
    }
  }

  private async getAccessToken() {
    this.validateConfig();

    const cacheKey = buildCacheKey(this.config);
    const cached = accessTokenCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now() + 30_000) {
      return cached.token;
    }

    const tokenUrl = buildUrl(this.config.authBaseUrl, "/connect/token");
    const startedAt = Date.now();

    logInfo("servicetitan.auth.request", {
      authBaseUrl: this.config.authBaseUrl,
      environment: this.config.environment
    });

    const response = await fetchWithRetry(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      }).toString(),
      retries: 2,
      timeoutMs: 15_000
    });

    if (!response.ok) {
      const text = await response.text().catch(() => null);

      logError("servicetitan.auth.failed", {
        status: response.status,
        durationMs: Date.now() - startedAt
      });

      throw new YelpApiError(
        "ServiceTitan authentication failed. Check the saved client ID, client secret, tenant ID, and environment.",
        response.status === 401 || response.status === 403 ? "AUTH_FAILURE" : "UPSTREAM_UNAVAILABLE",
        response.status,
        text
      );
    }

    const parsed = await parseJsonResponse(response, serviceTitanTokenResponseSchema);
    const expiresAt = Date.now() + Math.max(60, parsed.expires_in - 60) * 1000;

    accessTokenCache.set(cacheKey, {
      token: parsed.access_token,
      expiresAt
    });

    return parsed.access_token;
  }

  private async request<TSchema extends z.ZodTypeAny>(params: {
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    schema: TSchema;
  }) {
    const accessToken = await this.getAccessToken();
    const url = buildUrl(this.config.apiBaseUrl, params.path, params.query);
    const startedAt = Date.now();

    logInfo("servicetitan.request", {
      path: params.path,
      environment: this.config.environment
    });

    const response = await fetchWithRetry(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "ST-App-Key": this.config.appKey
      },
      retries: 2,
      timeoutMs: 20_000
    });

    if (!response.ok) {
      const details = await response.text().catch(() => null);

      logError("servicetitan.request.failed", {
        path: params.path,
        status: response.status,
        durationMs: Date.now() - startedAt
      });

      throw new YelpApiError(
        response.status === 401 || response.status === 403
          ? "ServiceTitan rejected the current connector credentials."
          : response.status === 404
            ? "The requested ServiceTitan record was not found."
            : "ServiceTitan did not complete the request successfully.",
        response.status === 401 || response.status === 403
          ? "AUTH_FAILURE"
          : response.status === 404
            ? "UPSTREAM_NOT_FOUND"
          : response.status === 429
            ? "RATE_LIMIT"
            : "UPSTREAM_UNAVAILABLE",
        response.status,
        details
      );
    }

    return parseJsonResponse(response, params.schema);
  }

  async testConnection() {
    const response = await this.request({
      path: `/settings/v2/tenant/${this.config.tenantId}/employees`,
      query: {
        pageSize: 1
      },
      schema: createServiceTitanPagedResponseSchema(serviceTitanEmployeesProbeSchema)
    });

    return {
      totalCount: response.totalCount ?? response.data.length,
      employeeSampleCount: response.data.length
    };
  }

  async listBusinessUnits() {
    const response = await this.request({
      path: `/settings/v2/tenant/${this.config.tenantId}/business-units`,
      query: {
        pageSize: 200
      },
      schema: createServiceTitanPagedResponseSchema(serviceTitanBusinessUnitSchema)
    });

    return {
      totalCount: response.totalCount ?? response.data.length,
      hasMore: response.hasMore ?? false,
      rows: (response.data as Array<z.infer<typeof serviceTitanBusinessUnitSchema>>).map((row) => ({
        id: row.id,
        name: row.name,
        active: row.active ?? true,
        code: row.code ?? null,
        raw: row
      }))
    };
  }

  async listCategories() {
    const response = await this.request({
      path: `/pricebook/v2/tenant/${this.config.tenantId}/categories`,
      query: {
        pageSize: 200
      },
      schema: createServiceTitanPagedResponseSchema(serviceTitanCategorySchema)
    });

    return {
      totalCount: response.totalCount ?? response.data.length,
      hasMore: response.hasMore ?? false,
      rows: (response.data as Array<z.infer<typeof serviceTitanCategorySchema>>).map((row) => ({
        id: row.id,
        name: row.name,
        active: row.active ?? true,
        raw: row
      }))
    };
  }

  async getLeadById(leadId: string) {
    return this.request({
      path: `/crm/v2/tenant/${this.config.tenantId}/leads/${leadId}`,
      schema: serviceTitanLeadSchema
    });
  }

  async getJobById(jobId: string) {
    return this.request({
      path: `/jpm/v2/tenant/${this.config.tenantId}/jobs/${jobId}`,
      schema: serviceTitanJobSchema
    });
  }

  async listAppointmentsForJob(jobId: string) {
    const response = await this.request({
      path: `/dispatch/v2/tenant/${this.config.tenantId}/appointments`,
      query: {
        jobId,
        pageSize: 200
      },
      schema: createServiceTitanPagedResponseSchema(serviceTitanAppointmentSchema)
    });

    return {
      totalCount: response.totalCount ?? response.data.length,
      hasMore: response.hasMore ?? false,
      rows: response.data as Array<z.infer<typeof serviceTitanAppointmentSchema>>
    };
  }
}

export function normalizeServiceTitanError(error: unknown) {
  return normalizeUnknownError(error);
}
