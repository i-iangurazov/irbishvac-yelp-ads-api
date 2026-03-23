import "server-only";

import { DEFAULT_YELP_ENDPOINTS, resolveEndpoint } from "@/lib/yelp/endpoints";
import {
  yelpFeatureDeleteResponseSchema,
  yelpProgramFeatureCollectionSchema,
  yelpProgramFeatureSchema,
  type YelpProgramFeatureDto
} from "@/lib/yelp/schemas";
import { requestYelp } from "@/lib/yelp/base-client";
import type { YelpCredentialConfig } from "@/lib/yelp/runtime";

export class YelpFeaturesClient {
  constructor(private readonly credential: YelpCredentialConfig) {}

  async getProgramFeatures(programId: string) {
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.features.getProgramFeatures, { programId }),
      schema: yelpProgramFeatureCollectionSchema
    });
  }

  async updateProgramFeatures(programId: string, features: YelpProgramFeatureDto[]) {
    const body = yelpProgramFeatureCollectionSchema.parse(features.map((feature) => yelpProgramFeatureSchema.parse(feature)));

    return requestYelp({
      credential: this.credential,
      authType: "basic",
      method: "PUT",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.features.updateProgramFeatures, { programId }),
      body,
      schema: yelpProgramFeatureCollectionSchema
    });
  }

  async deleteProgramFeatures(programId: string, featureType: YelpProgramFeatureDto["type"]) {
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      method: "DELETE",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.features.deleteProgramFeatures, { programId, featureType }),
      schema: yelpFeatureDeleteResponseSchema
    });
  }

  async testConnection(path: string = DEFAULT_YELP_ENDPOINTS.features.testConnection) {
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      path
    });
  }
}
