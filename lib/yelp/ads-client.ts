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

const YELP_PROGRAM_LIST_PAGE_SIZE = 40;
const YELP_PROGRAM_LIST_MAX_PAGES = 25;

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

  private async listProgramsPage(businessId: string, options?: { start?: number; limit?: number }) {
    return requestYelp({
      credential: this.credential,
      authType: "basic",
      method: "GET",
      path: resolveEndpoint(DEFAULT_YELP_ENDPOINTS.ads.listPrograms, { businessId }),
      query: {
        start: options?.start ?? 0,
        limit: options?.limit ?? YELP_PROGRAM_LIST_PAGE_SIZE
      },
      schema: yelpProgramListResponseSchema
    });
  }

  async listPrograms(
    businessId: string,
    options?: {
      pageSize?: number;
      maxPages?: number;
    }
  ) {
    const pageSize = Math.min(Math.max(options?.pageSize ?? YELP_PROGRAM_LIST_PAGE_SIZE, 1), YELP_PROGRAM_LIST_PAGE_SIZE);
    const maxPages = Math.max(options?.maxPages ?? YELP_PROGRAM_LIST_MAX_PAGES, 1);
    const aggregatedBusinesses = new Map<string, NonNullable<Awaited<ReturnType<typeof this.listProgramsPage>>["data"]["businesses"][number]>>();
    const aggregatedErrors: Awaited<ReturnType<typeof this.listProgramsPage>>["data"]["errors"] = [];
    let correlationId = "";

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      const start = pageIndex * pageSize;
      const response = await this.listProgramsPage(businessId, {
        start,
        limit: pageSize
      });
      const pageBusinesses = response.data.businesses;
      const currentBusiness = pageBusinesses.find(
        (entry: (typeof pageBusinesses)[number]) => entry.yelp_business_id === businessId
      );
      const pagePrograms = currentBusiness?.programs ?? [];

      correlationId = response.correlationId;
      aggregatedErrors.push(...response.data.errors);

      for (const business of pageBusinesses) {
        const existing = aggregatedBusinesses.get(business.yelp_business_id);

        if (!existing) {
          aggregatedBusinesses.set(business.yelp_business_id, {
            ...business,
            programs: [...business.programs]
          });
          continue;
        }

        existing.programs.push(...business.programs);
      }

      if (pagePrograms.length < pageSize) {
        break;
      }
    }

    return {
      correlationId,
      data: {
        businesses: [...aggregatedBusinesses.values()],
        errors: aggregatedErrors
      }
    } as const;
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
