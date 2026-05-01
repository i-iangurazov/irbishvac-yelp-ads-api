import "server-only";

import { DEFAULT_YELP_ENDPOINTS, resolveEndpoint } from "@/lib/yelp/endpoints";
import {
  yelpBusinessSubscriptionRequestSchema,
  yelpBusinessSubscriptionTypeSchema,
  yelpBusinessSubscriptionsResponseSchema,
  yelpBusinessLeadIdsResponseSchema,
  yelpLeadDetailSchema,
  yelpLeadEventsResponseSchema,
  yelpMarkLeadAsRepliedRequestSchema,
  yelpMarkLeadEventAsReadRequestSchema,
  yelpWriteLeadEventRequestSchema,
  type YelpBusinessSubscriptionTypeDto
} from "@/lib/yelp/schemas";
import { requestYelp } from "@/lib/yelp/base-client";
import type { YelpCredentialConfig } from "@/lib/yelp/runtime";

const YELP_LEAD_IDS_MAX_LIMIT = 20;

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

  async getLeadEvents(
    leadId: string,
    options?: {
      limit?: number;
      olderThanCursor?: string;
      newerThanCursor?: string;
    }
  ) {
    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.leads.getLeadEvents, {
        leadId
      }),
      query: {
        ...(options?.limit ? { limit: Math.max(1, Math.min(Math.trunc(options.limit), YELP_LEAD_IDS_MAX_LIMIT)) } : {}),
        ...(options?.olderThanCursor ? { older_than_cursor: options.olderThanCursor } : {}),
        ...(options?.newerThanCursor ? { newer_than_cursor: options.newerThanCursor } : {})
      },
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

  async getBusinessLeadIds(businessId: string, options?: { limit?: number; offset?: number }) {
    const limit =
      typeof options?.limit === "number"
        ? Math.max(1, Math.min(Math.trunc(options.limit), YELP_LEAD_IDS_MAX_LIMIT))
        : undefined;

    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.leads.getBusinessLeadIds, {
        businessId
      }),
      query: {
        ...(limit ? { limit } : {}),
        ...(options?.offset ? { offset: options.offset } : {})
      },
      schema: yelpBusinessLeadIdsResponseSchema
    });
  }

  async subscribeBusinesses(input: {
    subscriptionTypes: YelpBusinessSubscriptionTypeDto[];
    businessIds: string[];
  }) {
    const body = yelpBusinessSubscriptionRequestSchema.parse({
      subscription_types: input.subscriptionTypes,
      business_ids: input.businessIds
    });

    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      method: "POST",
      path: DEFAULT_YELP_ENDPOINTS.leads.businessSubscriptions,
      body
    });
  }

  async unsubscribeBusinesses(input: {
    subscriptionTypes: YelpBusinessSubscriptionTypeDto[];
    businessIds: string[];
  }) {
    const body = yelpBusinessSubscriptionRequestSchema.parse({
      subscription_types: input.subscriptionTypes,
      business_ids: input.businessIds
    });

    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      method: "DELETE",
      path: DEFAULT_YELP_ENDPOINTS.leads.businessSubscriptions,
      body
    });
  }

  async getBusinessSubscriptions(
    subscriptionType: YelpBusinessSubscriptionTypeDto,
    options?: { limit?: number; offset?: number }
  ) {
    return requestYelp({
      credential: this.credential,
      authType: "bearer",
      path: DEFAULT_YELP_ENDPOINTS.leads.businessSubscriptions,
      query: {
        subscription_type: yelpBusinessSubscriptionTypeSchema.parse(subscriptionType),
        limit: options?.limit ?? 100,
        offset: options?.offset ?? 0
      },
      schema: yelpBusinessSubscriptionsResponseSchema
    });
  }
}
