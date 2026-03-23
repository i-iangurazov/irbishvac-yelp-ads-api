import { z } from "zod";

import { yelpProgramFeatureSchema } from "@/lib/yelp/schemas";

export const featureFormSchema = yelpProgramFeatureSchema;

export type FeatureFormValues = z.infer<typeof featureFormSchema>;

export const featureCatalog = {
  LINK_TRACKING: {
    label: "Link Tracking",
    description: "Attach tracking templates and destination URLs for click attribution.",
    example: "https://tracking.example/click?src=yelp"
  },
  NEGATIVE_KEYWORD_TARGETING: {
    label: "Negative Keywords",
    description: "Block search terms that should never trigger ads.",
    example: "jobs, careers, free"
  },
  STRICT_CATEGORY_TARGETING: {
    label: "Strict Category Targeting",
    description: "Restrict targeting to selected categories only.",
    example: "Use when a business serves distinct high-value categories."
  },
  AD_SCHEDULING: {
    label: "Ad Scheduling",
    description: "Choose which days and times ads may serve.",
    example: "Weekdays from 08:00 to 18:00"
  },
  CUSTOM_LOCATION_TARGETING: {
    label: "Custom Location Targeting",
    description: "Target specific neighborhoods or local geographies.",
    example: "SoMa, Mission, Pacific Heights"
  },
  AD_GOAL: {
    label: "Ad Goal",
    description: "Tell Yelp which business outcome should be optimized.",
    example: "Calls or website leads"
  },
  CALL_TRACKING: {
    label: "Call Tracking",
    description: "Enable call measurement for ad-driven leads.",
    example: "Track inbound calls without changing the visible business number."
  },
  BUSINESS_HIGHLIGHTS: {
    label: "Business Highlights",
    description: "Surface key selling points in the ad experience.",
    example: "24/7 emergency service"
  },
  VERIFIED_LICENSE: {
    label: "Verified License",
    description: "Associate a verified professional license to the program.",
    example: "CA #1234567"
  },
  CUSTOM_RADIUS_TARGETING: {
    label: "Custom Radius Targeting",
    description: "Specify a target radius around the business.",
    example: "15 miles"
  },
  CUSTOM_AD_TEXT: {
    label: "Custom Ad Text",
    description: "Override headline or body text when permitted.",
    example: "Same-day HVAC repair"
  },
  CUSTOM_AD_PHOTO: {
    label: "Custom Ad Photo",
    description: "Use an approved photo asset in the ad.",
    example: "Photo ID from the Yelp business gallery"
  },
  BUSINESS_LOGO: {
    label: "Business Logo",
    description: "Attach a logo asset for eligible placements.",
    example: "https://assets.example/logo.png"
  },
  YELP_PORTFOLIO: {
    label: "Yelp Portfolio",
    description: "Highlight portfolio items tied to the business.",
    example: "Portfolio item IDs"
  }
} as const;
