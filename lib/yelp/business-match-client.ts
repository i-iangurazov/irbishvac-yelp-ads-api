import "server-only";

import { DEFAULT_YELP_ENDPOINTS } from "@/lib/yelp/endpoints";
import { requestYelp } from "@/lib/yelp/base-client";
import { yelpBusinessMatchResponseSchema } from "@/lib/yelp/schemas";
import type { YelpCredentialConfig } from "@/lib/yelp/runtime";

export class YelpBusinessMatchClient {
  constructor(private readonly credential: YelpCredentialConfig) {}

  async matchBusiness(query: { name: string; location?: string }) {
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      method: "GET",
      path: DEFAULT_YELP_ENDPOINTS.businessMatch.matchBusiness,
      query,
      schema: yelpBusinessMatchResponseSchema
    });
  }

  async testConnection(path: string = DEFAULT_YELP_ENDPOINTS.businessMatch.testConnection) {
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      path,
      schema: yelpBusinessMatchResponseSchema.optional()
    });
  }
}
