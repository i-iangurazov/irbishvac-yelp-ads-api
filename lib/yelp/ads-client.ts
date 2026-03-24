import "server-only";

import { DEFAULT_YELP_ENDPOINTS, resolveEndpoint } from "@/lib/yelp/endpoints";
import {
  yelpCreateProgramRequestSchema,
  yelpEditProgramRequestSchema,
  yelpJobSubmissionResponseSchema,
  yelpJobStatusResponseSchema,
  yelpProgramInfoResponseSchema,
  yelpProgramListResponseSchema,
  yelpTerminateProgramRequestSchema,
  type YelpCreateProgramRequestDto,
  type YelpEditProgramRequestDto,
  type YelpTerminateProgramRequestDto
} from "@/lib/yelp/schemas";
import { requestYelp } from "@/lib/yelp/base-client";
import type { YelpCredentialConfig } from "@/lib/yelp/runtime";

export class YelpAdsClient {
  constructor(private readonly credential: YelpCredentialConfig) {}

  async createProgram(payload: YelpCreateProgramRequestDto) {
    const query = yelpCreateProgramRequestSchema.parse(payload);
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      method: "POST",
      path: DEFAULT_YELP_ENDPOINTS.ads.createProgram,
      query,
      schema: yelpJobSubmissionResponseSchema
    });
  }

  async editProgram(programId: string, payload: YelpEditProgramRequestDto) {
    const query = yelpEditProgramRequestSchema.parse(payload);
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      method: "POST",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.ads.editProgram, { programId }),
      query,
      schema: yelpJobSubmissionResponseSchema
    });
  }

  async endProgram(programId: string, payload: YelpTerminateProgramRequestDto) {
    yelpTerminateProgramRequestSchema.parse(payload);
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      method: "POST",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.ads.endProgram, { programId }),
      schema: yelpJobSubmissionResponseSchema
    });
  }

  async getJobStatus(jobId: string) {
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      method: "GET",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.ads.jobStatus, { jobId }),
      schema: yelpJobStatusResponseSchema
    });
  }

  async listPrograms(businessId: string, options?: { start?: number; limit?: number }) {
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      method: "GET",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.ads.listPrograms, { businessId }),
      query: {
        start: options?.start ?? 0,
        limit: options?.limit ?? 20
      },
      schema: yelpProgramListResponseSchema
    });
  }

  async getProgramInfo(programId: string) {
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      method: "GET",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.ads.getProgramInfo, { programId }),
      schema: yelpProgramInfoResponseSchema
    });
  }

  async testConnection(path?: string) {
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      method: "GET",
      path: path ?? DEFAULT_YELP_ENDPOINTS.ads.testConnection
    });
  }
}
