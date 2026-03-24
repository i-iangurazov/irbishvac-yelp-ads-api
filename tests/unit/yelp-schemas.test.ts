import { describe, expect, it } from "vitest";

import { yelpJobStatusResponseSchema, yelpProgramInfoResponseSchema, yelpProgramListResponseSchema } from "@/lib/yelp/schemas";

describe("yelp job status schema", () => {
  it("accepts array-shaped ad_categories entries in program_added update results", () => {
    const result = yelpJobStatusResponseSchema.safeParse({
      status: "PROCESSING",
      created_at: "2026-03-23T17:18:55+00:00",
      completed_at: null,
      business_results: [
        {
          status: "PROCESSING",
          identifier: "ys4FVTHxbSepIkvCLHYxCA",
          identifier_type: "BUSINESS",
          update_results: {
            program_added: {
              start: { status: "PROCESSING", requested_value: "2026-03-23" },
              ad_categories: [
                {
                  status: "PROCESSING",
                  requested_value: "electricians"
                }
              ]
            }
          }
        }
      ]
    });

    expect(result.success).toBe(true);
  });
});

describe("yelp live inventory schemas", () => {
  it("accepts program list responses with page-upgrade info and active feature arrays", () => {
    const result = yelpProgramListResponseSchema.safeParse({
      businesses: [
        {
          yelp_business_id: "ys4FVTHxbSepIkvCLHYxCA",
          advertiser_status: "ADVERTISER",
          programs: [
            {
              active_features: ["AD_GOAL", "CALL_TRACKING"],
              available_features: ["AD_GOAL", "CALL_TRACKING", "STRICT_CATEGORY_TARGETING"],
              end_date: "9999-12-31",
              program_id: "JjhIENbS68b2Wkomkbu6Jw",
              program_pause_status: "NOT_PAUSED",
              program_status: "ACTIVE",
              program_type: "CPC",
              start_date: "2026-03-23",
              ad_campaign_id: "9X8qqMwFmxibJVmvg1b-Sw",
              ad_categories: ["plumbing"],
              program_metrics: {
                budget: 1000000,
                currency: "USD",
                is_autobid: true,
                fee_period: "Calendar Month"
              },
              future_budget_changes: []
            },
            {
              active_features: [],
              available_features: [],
              end_date: "9999-12-31",
              program_id: "kWDutUAzwQVj5BMdz80R-Q",
              program_pause_status: "NOT_PAUSED",
              program_status: "ACTIVE",
              program_type: "LOGO",
              start_date: "2026-03-23",
              page_upgrade_info: {
                cost: 8.24,
                monthly_rate: 30
              }
            }
          ]
        }
      ],
      errors: []
    });

    expect(result.success).toBe(true);
  });

  it("accepts program info responses used to derive enabled feature types", () => {
    const result = yelpProgramInfoResponseSchema.safeParse({
      programs: [
        {
          active_features: ["AD_GOAL", "CALL_TRACKING", "CUSTOM_AD_TEXT"],
          available_features: ["AD_GOAL", "CALL_TRACKING", "CUSTOM_AD_TEXT", "STRICT_CATEGORY_TARGETING"],
          end_date: "9999-12-31",
          program_id: "JjhIENbS68b2Wkomkbu6Jw",
          program_pause_status: "NOT_PAUSED",
          program_status: "ACTIVE",
          program_type: "CPC",
          start_date: "2026-03-23",
          ad_categories: ["plumbing"],
          program_metrics: {
            budget: 1000000,
            currency: "USD",
            is_autobid: true
          },
          future_budget_changes: [],
          yelp_business_id: "ys4FVTHxbSepIkvCLHYxCA"
        }
      ],
      errors: []
    });

    expect(result.success).toBe(true);
  });
});
