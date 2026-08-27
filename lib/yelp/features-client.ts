import "server-only";

import { DEFAULT_YELP_ENDPOINTS, resolveEndpoint } from "@/lib/yelp/endpoints";
import {
  yelpNegativeKeywordUpdateRequestSchema,
  yelpProgramFeatureDeleteRequestSchema,
  yelpProgramFeaturesResponseSchema,
} from "@/lib/yelp/schemas";
import { requestYelp } from "@/lib/yelp/base-client";
import type { YelpCredentialConfig } from "@/lib/yelp/runtime";

export class YelpFeaturesClient {
  constructor(private readonly credential: YelpCredentialConfig) {}

  async getProgramFeatures(programId: string) {
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      path: resolveEndpoint(
        DEFAULT_YELP_ENDPOINTS.features.getProgramFeatures,
        { programId },
      ),
      schema: yelpProgramFeaturesResponseSchema,
    });
  }

  async updateNegativeKeywords(programId: string, blockedKeywords: string[]) {
    const body = yelpNegativeKeywordUpdateRequestSchema.parse({
      NEGATIVE_KEYWORD_TARGETING: {
        blocked_keywords: blockedKeywords,
      },
    });

    return requestYelp({
      credential: this.credential,
      authType: "basic",
      method: "POST",
      path: resolveEndpoint(
        DEFAULT_YELP_ENDPOINTS.features.updateProgramFeatures,
        { programId },
      ),
      body,
      schema: yelpProgramFeaturesResponseSchema,
    });
  }

  async deleteProgramFeatures(programId: string, featureTypes: string[]) {
    const body = yelpProgramFeatureDeleteRequestSchema.parse({
      features: featureTypes,
    });

    return requestYelp({
      credential: this.credential,
      authType: "basic",
      method: "DELETE",
      path: resolveEndpoint(
        DEFAULT_YELP_ENDPOINTS.features.deleteProgramFeatures,
        { programId },
      ),
      body,
      schema: yelpProgramFeaturesResponseSchema,
    });
  }

  async testConnection(
    path: string = DEFAULT_YELP_ENDPOINTS.features.testConnection,
  ) {
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      path,
    });
  }
}
