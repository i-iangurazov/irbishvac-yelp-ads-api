import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchWithRetry } = vi.hoisted(() => ({ fetchWithRetry: vi.fn() }));

vi.mock("@/lib/utils/fetch", () => ({ fetchWithRetry }));

import { YelpFeaturesClient } from "@/lib/yelp/features-client";

const credential = {
  label: "test ads",
  baseUrl: "https://partner-api.yelp.com",
  isEnabled: true,
  username: "partner-user",
  secret: "partner-password",
};

function providerResponse(blockedKeywords = ["hvac jobs"]) {
  return {
    features: {
      NEGATIVE_KEYWORD_TARGETING: {
        suggested_keywords: ["hvac repair", "hvac jobs"],
        blocked_keywords: blockedKeywords,
      },
      STRICT_CATEGORY_TARGETING: { enabled: true },
    },
    program_id: "upstream-program-1",
    program_type: "CPC",
  };
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("YelpFeaturesClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retrieves live program features from the official v1 endpoint", async () => {
    fetchWithRetry.mockResolvedValue(jsonResponse(providerResponse()));

    const result = await new YelpFeaturesClient(credential).getProgramFeatures(
      "upstream-program-1",
    );

    expect(
      result.data.features.NEGATIVE_KEYWORD_TARGETING?.blocked_keywords,
    ).toEqual(["hvac jobs"]);
    expect(fetchWithRetry).toHaveBeenCalledWith(
      new URL(
        "https://partner-api.yelp.com/program/upstream-program-1/features/v1",
      ),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("posts only the negative-keyword feature subset", async () => {
    fetchWithRetry.mockResolvedValue(
      jsonResponse(providerResponse(["jobs", "free hvac"])),
    );

    await new YelpFeaturesClient(credential).updateNegativeKeywords(
      "upstream-program-1",
      ["jobs", "free hvac"],
    );

    expect(fetchWithRetry).toHaveBeenCalledWith(
      new URL(
        "https://partner-api.yelp.com/program/upstream-program-1/features/v1",
      ),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          NEGATIVE_KEYWORD_TARGETING: {
            blocked_keywords: ["jobs", "free hvac"],
          },
        }),
      }),
    );
  });

  it("uses Yelp's DELETE body contract when clearing the feature", async () => {
    fetchWithRetry.mockResolvedValue(jsonResponse(providerResponse([])));

    await new YelpFeaturesClient(credential).deleteProgramFeatures(
      "upstream-program-1",
      ["NEGATIVE_KEYWORD_TARGETING"],
    );

    expect(fetchWithRetry).toHaveBeenCalledWith(
      new URL(
        "https://partner-api.yelp.com/program/upstream-program-1/features/v1",
      ),
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ features: ["NEGATIVE_KEYWORD_TARGETING"] }),
      }),
    );
  });
});
