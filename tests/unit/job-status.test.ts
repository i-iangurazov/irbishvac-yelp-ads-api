import { describe, expect, it } from "vitest";

import { summarizeYelpJobIssue } from "@/lib/yelp/job-status";

describe("job status summary", () => {
  it("maps business authorization failures into a plain-language operator message", () => {
    const result = summarizeYelpJobIssue({
      status: "REJECTED",
      business_results: [
        {
          error: {
            code: "BUSINESS_AUTHORIZATION_FAILED",
            message: "ValidationError: You are not authorized to change this business"
          },
          status: "REJECTED",
          identifier: "SNa1ugk6DNIuvIPu8-AiGA",
          identifier_type: "BUSINESS"
        }
      ]
    });

    expect(result?.code).toBe("BUSINESS_AUTHORIZATION_FAILED");
    expect(result?.title).toContain("not authorized");
  });

  it("maps inactive businesses into an eligibility message", () => {
    const result = summarizeYelpJobIssue({
      status: "REJECTED",
      business_results: [
        {
          error: {
            code: "BUSINESS_NOT_ACTIVE",
            message: "ValidationError: This business cannot be accessed because it is removed from search."
          },
          status: "REJECTED",
          identifier: "J9R1gG5xy7DpWsCWBup7DQ",
          identifier_type: "BUSINESS"
        }
      ]
    });

    expect(result?.code).toBe("BUSINESS_NOT_ACTIVE");
    expect(result?.title).toContain("removed it from search");
  });

  it("maps Yelp auth failures during status polling into an operator message", () => {
    const result = summarizeYelpJobIssue({
      error: {
        code: "401_UNAUTHORIZED",
        description:
          "This server could not verify that you are authorized to access the document requested."
      }
    });

    expect(result?.code).toBe("401_UNAUTHORIZED");
    expect(result?.title).toContain("status check credentials");
  });

  it("maps nested category alias validation failures into a CPC targeting message", () => {
    const result = summarizeYelpJobIssue({
      status: "REJECTED",
      business_results: [
        {
          status: "REJECTED",
          identifier: "e2JTWqyUwRHXjpG8TCZ7Ow",
          update_results: {
            program_added: {
              error: {
                code: "INVALID_OR_MISSING_REQUIRED_KEY",
                message: "ValidationError: Invalid or missing required key(s): ad_categories."
              },
              status: "REJECTED",
              requested_value: {
                ad_categories: {
                  error: {
                    code: "INVALID_LIST_INDEXES",
                    message: "ValidationError: The list expected all items to validate."
                  },
                  status: "REJECTED",
                  requested_value: [
                    {
                      error: {
                        code: "CATEGORY_ALIAS_NOT_RECOGNIZED",
                        message: "ValidationError: The provided category alias does not exist."
                      },
                      status: "REJECTED",
                      requested_value: "Plumbing"
                    }
                  ]
                }
              }
            }
          },
          identifier_type: "BUSINESS"
        }
      ]
    });

    expect(result?.code).toBe("CATEGORY_ALIAS_NOT_RECOGNIZED");
    expect(result?.title).toContain("ad categories");
  });

  it("maps unsupported categories into a business eligibility message", () => {
    const result = summarizeYelpJobIssue({
      status: "REJECTED",
      business_results: [
        {
          status: "REJECTED",
          error: {
            code: "UNSUPPORTED_CATEGORIES",
            message:
              "This business does not qualify for Yelp advertising because it is in an advertising restricted category."
          }
        }
      ]
    });

    expect(result?.code).toBe("UNSUPPORTED_CATEGORIES");
    expect(result?.title).toContain("not eligible");
  });
});
