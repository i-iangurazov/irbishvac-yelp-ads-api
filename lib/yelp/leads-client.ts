import "server-only";

import { DEFAULT_YELP_ENDPOINTS, resolveEndpoint } from "@/lib/yelp/endpoints";
import {
  yelpBusinessLeadIdsResponseSchema,
  yelpLeadDetailSchema,
  yelpLeadEventsResponseSchema,
  yelpMarkLeadAsRepliedRequestSchema,
  yelpMarkLeadEventAsReadRequestSchema,
  yelpWriteLeadEventRequestSchema
} from "@/lib/yelp/schemas";
import { requestYelp } from "@/lib/yelp/base-client";
import type { YelpCredentialConfig } from "@/lib/yelp/runtime";

export class YelpLeadsClient {
  constructor(private readonly credential: YelpCredentialConfig) {}

  async getLead(leadId: string) {
    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.leads.getLead, {
        leadId
      }),
      schema: yelpLeadDetailSchema
    });
  }

  async getLeadEvents(leadId: string) {
    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.leads.getLeadEvents, {
        leadId
      }),
      schema: yelpLeadEventsResponseSchema
    });
  }

  async writeLeadEvent(
    leadId: string,
    input: Parameters<typeof yelpWriteLeadEventRequestSchema.parse>[0]
  ) {
    const body = yelpWriteLeadEventRequestSchema.parse(input);

    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      method: "POST",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.leads.writeLeadEvent, {
        leadId
      }),
      body
    });
  }

  async markLeadEventAsRead(
    leadId: string,
    input: Parameters<typeof yelpMarkLeadEventAsReadRequestSchema.parse>[0]
  ) {
    const body = yelpMarkLeadEventAsReadRequestSchema.parse(input);

    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      method: "POST",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.leads.markLeadEventAsRead, {
        leadId
      }),
      body
    });
  }

  async markLeadAsReplied(
    leadId: string,
    input: Parameters<typeof yelpMarkLeadAsRepliedRequestSchema.parse>[0]
  ) {
    const body = yelpMarkLeadAsRepliedRequestSchema.parse(input);

    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      method: "POST",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.leads.markLeadAsReplied, {
        leadId
      }),
      body
    });
  }

  async getBusinessLeadIds(businessId: string, options?: { limit?: number }) {
    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.leads.getBusinessLeadIds, {
        businessId
      }),
      query: {
        ...(options?.limit ? { limit: options.limit } : {})
      },
      schema: yelpBusinessLeadIdsResponseSchema
    });
  }
}
