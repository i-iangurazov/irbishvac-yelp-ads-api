import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/yelp/base-client", () => ({
  requestYelp: vi.fn()
}));

import { YelpAdsClient } from "@/lib/yelp/ads-client";
import { requestYelp } from "@/lib/yelp/base-client";

const mockedRequestYelp = vi.mocked(requestYelp);

describe("YelpAdsClient.listPrograms", () => {
  beforeEach(() => {
    mockedRequestYelp.mockReset();
  });

  it("paginates through all business program pages and merges them", async () => {
    mockedRequestYelp
      .mockResolvedValueOnce({
        correlationId: "corr-1",
        data: {
          businesses: [
            {
              yelp_business_id: "biz-1",
              advertiser_status: "ADVERTISER",
              partner_business_id: null,
              destination_yelp_business_id: null,
              programs: Array.from({ length: 40 }, (_, index) => ({
                program_id: `program-${index + 1}`,
                program_type: "CPC",
                program_status: "INACTIVE",
                program_pause_status: "NOT_PAUSED",
                active_features: [],
                available_features: [],
                ad_categories: [],
                future_budget_changes: []
              }))
            }
          ],
          errors: []
        }
      })
      .mockResolvedValueOnce({
        correlationId: "corr-2",
        data: {
          businesses: [
            {
              yelp_business_id: "biz-1",
              advertiser_status: "ADVERTISER",
              partner_business_id: null,
              destination_yelp_business_id: null,
              programs: [
                {
                  program_id: "program-41",
                  program_type: "CPC",
                  program_status: "ACTIVE",
                  program_pause_status: "NOT_PAUSED",
                  active_features: ["AD_GOAL"],
                  available_features: ["AD_GOAL"],
                  ad_categories: ["plumbing"],
                  future_budget_changes: []
                }
              ]
            }
          ],
          errors: []
        }
      });

    const client = new YelpAdsClient({
      label: "Test ads",
      baseUrl: "https://partner-api.yelp.com",
      isEnabled: true,
      username: "user",
      secret: "secret"
    });
    const response = await client.listPrograms("biz-1");

    expect(mockedRequestYelp).toHaveBeenCalledTimes(2);
    expect(mockedRequestYelp).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        query: {
          start: 0,
          limit: 40
        }
      })
    );
    expect(mockedRequestYelp).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        query: {
          start: 40,
          limit: 40
        }
      })
    );
    expect(response.correlationId).toBe("corr-2");
    expect(response.data.businesses).toHaveLength(1);
    expect(response.data.businesses[0]?.programs).toHaveLength(41);
    expect(response.data.businesses[0]?.programs.at(-1)?.program_id).toBe("program-41");
  });

  it("stops after the first page when Yelp returns fewer than the max page size", async () => {
    mockedRequestYelp.mockResolvedValueOnce({
      correlationId: "corr-single",
      data: {
        businesses: [
          {
            yelp_business_id: "biz-2",
            advertiser_status: "ADVERTISER",
            partner_business_id: null,
            destination_yelp_business_id: null,
            programs: [
              {
                program_id: "single-program",
                program_type: "LOGO",
                program_status: "ACTIVE",
                program_pause_status: "NOT_PAUSED",
                active_features: [],
                available_features: [],
                ad_categories: [],
                future_budget_changes: []
              }
            ]
          }
        ],
        errors: []
      }
    });

    const client = new YelpAdsClient({
      label: "Test ads",
      baseUrl: "https://partner-api.yelp.com",
      isEnabled: true,
      username: "user",
      secret: "secret"
    });
    const response = await client.listPrograms("biz-2");

    expect(mockedRequestYelp).toHaveBeenCalledTimes(1);
    expect(response.correlationId).toBe("corr-single");
    expect(response.data.businesses[0]?.programs).toHaveLength(1);
  });
});
