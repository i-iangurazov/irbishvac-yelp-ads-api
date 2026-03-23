import "server-only";

import { DEFAULT_YELP_ENDPOINTS, resolveEndpoint } from "@/lib/yelp/endpoints";
import { requestYelp } from "@/lib/yelp/base-client";
import type { YelpCredentialConfig } from "@/lib/yelp/runtime";

export class YelpDataIngestionClient {
  constructor(private readonly credential: YelpCredentialConfig) {}

  async patchBusinessReadinessFields(
    encryptedBusinessId: string,
    payload: {
      specialties?: string;
      categories?: string[];
      aboutThisBusiness?: string;
    }
  ) {
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      method: "PATCH",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.dataIngestion.patchBusinessReadinessFields, {
        encryptedBusinessId
      }),
      body: payload
    });
  }

  async testConnection(path: string = DEFAULT_YELP_ENDPOINTS.dataIngestion.testConnection) {
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      path
    });
  }
}
