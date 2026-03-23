import { describe, expect, it } from "vitest";

import { mapCreateProgramFormToDto, mapYelpJobStatusReceipt } from "@/lib/yelp/mappers";
import { yelpJobStatusResponseSchema } from "@/lib/yelp/schemas";

describe("Yelp mappers", () => {
  it("maps CPC form values into documented Yelp Ads request fields", () => {
    const payload = mapCreateProgramFormToDto(
      {
        businessId: "business_1",
        programType: "CPC",
        currency: "USD",
        startDate: "2026-03-20",
        monthlyBudgetDollars: "650.50",
        isAutobid: false,
        maxBidDollars: "24.75",
        pacingMethod: "paced",
        feePeriod: "CALENDAR_MONTH",
        adCategories: ["HVAC"],
        scheduledBudgetEffectiveDate: "",
        scheduledBudgetDollars: "",
        notes: "Upgrade budget"
      },
      "enc_business_1"
    );

    expect(payload.business_id).toBe("enc_business_1");
    expect(payload.program_name).toBe("CPC");
    expect(payload.start).toBe("2026-03-20");
    expect(payload.budget).toBe(65050);
    expect(payload.max_bid).toBe(2475);
    expect(payload.fee_period).toBe("CALENDAR_MONTH");
  });

  it("maps Yelp job receipt responses into local job and program states", () => {
    expect(
      mapYelpJobStatusReceipt(
        {
          status: "COMPLETED",
          business_results: [
            {
              status: "COMPLETED",
              identifier_type: "PROGRAM",
              identifier: "program_123"
            }
          ]
        },
        "CREATE_PROGRAM",
        "2026-03-10"
      )
    ).toEqual({
      jobStatus: "COMPLETED",
      programStatus: "ACTIVE",
      isTerminal: true,
      upstreamProgramId: "program_123"
    });
  });

  it("accepts Yelp status receipts where update_results groups expose a top-level status string", () => {
    const receipt = yelpJobStatusResponseSchema.parse({
      status: "COMPLETED",
      business_results: [
        {
          status: "COMPLETED",
          identifier_type: "BUSINESS",
          identifier: "business_123",
          update_results: {
            program_added: {
              status: "COMPLETED",
              program_id: {
                requested_value: "program_456"
              }
            }
          }
        }
      ]
    });

    expect(mapYelpJobStatusReceipt(receipt, "CREATE_PROGRAM", "2026-03-10")).toEqual({
      jobStatus: "COMPLETED",
      programStatus: "ACTIVE",
      isTerminal: true,
      upstreamProgramId: "program_456"
    });
  });
});
