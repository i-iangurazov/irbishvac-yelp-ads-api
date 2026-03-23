import "server-only";

import { DEFAULT_YELP_ENDPOINTS, resolveEndpoint } from "@/lib/yelp/endpoints";
import {
  yelpReportRequestSchema,
  yelpReportResponseSchema,
  type YelpReportRequestDto
} from "@/lib/yelp/schemas";
import { requestYelp } from "@/lib/yelp/base-client";
import type { YelpCredentialConfig } from "@/lib/yelp/runtime";

export class YelpReportingClient {
  constructor(private readonly credential: YelpCredentialConfig) {}

  async requestDailyReport(payload: YelpReportRequestDto) {
    const body = yelpReportRequestSchema.parse(payload);
    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      method: "POST",
      path: DEFAULT_YELP_ENDPOINTS.reporting.requestDailyReport,
      body,
      schema: yelpReportResponseSchema
    });
  }

  async getDailyReport(reportId: string) {
    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      method: "GET",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.reporting.getDailyReport, { reportId }),
      schema: yelpReportResponseSchema
    });
  }

  async requestMonthlyReport(payload: YelpReportRequestDto) {
    const body = yelpReportRequestSchema.parse(payload);
    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      method: "POST",
      path: DEFAULT_YELP_ENDPOINTS.reporting.requestMonthlyReport,
      body,
      schema: yelpReportResponseSchema
    });
  }

  async getMonthlyReport(reportId: string) {
    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      method: "GET",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.reporting.getMonthlyReport, { reportId }),
      schema: yelpReportResponseSchema
    });
  }

  async testConnection(path: string = DEFAULT_YELP_ENDPOINTS.reporting.testConnection) {
    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      path
    });
  }
}
