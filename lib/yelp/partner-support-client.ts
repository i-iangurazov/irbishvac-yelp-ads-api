import "server-only";

import { z } from "zod";

import { requestYelp } from "@/lib/yelp/base-client";
import { DEFAULT_YELP_ENDPOINTS, resolveEndpoint } from "@/lib/yelp/endpoints";
import type { YelpCredentialConfig } from "@/lib/yelp/runtime";

const YELP_BUSINESS_MIGRATION_INFO_LIMIT = 200;

export class YelpPartnerSupportClient {
  constructor(private readonly credential: YelpCredentialConfig) {}

  async getBusinessMigrationInfo(businessIds: string[]) {
    const uniqueBusinessIds = [
      ...new Set(
        businessIds.map((businessId) => businessId.trim()).filter(Boolean),
      ),
    ];

    if (uniqueBusinessIds.length === 0) {
      return {
        correlationId: "",
        data: {},
      } as const;
    }

    if (uniqueBusinessIds.length > YELP_BUSINESS_MIGRATION_INFO_LIMIT) {
      throw new Error(
        `Yelp migration info accepts at most ${YELP_BUSINESS_MIGRATION_INFO_LIMIT} business IDs per request.`,
      );
    }

    return requestYelp({
      credential: this.credential,
      authType: "basic",
      method: "GET",
      path: resolveEndpoint(
        DEFAULT_YELP_ENDPOINTS.partnerSupport.businessMigrationInfo,
        {
          businessIds: uniqueBusinessIds.join(","),
        },
      ),
      schema: z.unknown(),
    });
  }
}
