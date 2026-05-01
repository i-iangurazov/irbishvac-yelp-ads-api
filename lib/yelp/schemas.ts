import { z } from "zod";

export const yelpProgramTypeSchema = z.enum([
  "BP",
  "EP",
  "CPC",
  "RCA",
  "CTA",
  "SLIDESHOW",
  "BH",
  "VL",
  "LOGO",
  "PORTFOLIO"
]);

const yelpDateInputSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const yelpPacingMethodSchema = z.enum(["paced", "unpaced"]);
export const yelpFeePeriodSchema = z.enum(["CALENDAR_MONTH", "ROLLING_MONTH"]);

export const yelpCreateProgramRequestSchema = z.object({
  business_id: z.string().min(1),
  program_name: yelpProgramTypeSchema,
  promotion_code: z.string().max(120).optional(),
  start: yelpDateInputSchema.optional(),
  end: yelpDateInputSchema.optional(),
  currency: z.string().min(3).max(3).default("USD"),
  budget: z.number().int().positive().optional(),
  is_autobid: z.boolean().optional(),
  max_bid: z.number().int().positive().optional(),
  pacing_method: yelpPacingMethodSchema.optional(),
  fee_period: yelpFeePeriodSchema.optional(),
  ad_categories: z.array(z.string().min(1)).optional()
});

export const yelpEditProgramRequestSchema = z.object({
  start: yelpDateInputSchema.optional(),
  end: yelpDateInputSchema.optional(),
  budget: z.number().int().positive().optional(),
  future_budget_date: yelpDateInputSchema.optional(),
  max_bid: z.number().int().positive().optional(),
  pacing_method: yelpPacingMethodSchema.optional(),
  ad_categories: z.array(z.string().min(1)).optional()
});

export const yelpTerminateProgramRequestSchema = z.object({}).default({});

export const yelpJobSubmissionResponseSchema = z
  .object({
    job_id: z.string()
  })
  .passthrough();

const yelpJobReceiptErrorSchema = z
  .object({
    code: z.string().optional(),
    message: z.string().optional()
  })
  .passthrough();

const yelpJobReceiptPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const yelpJobReceiptValueSchema = z
  .object({
    status: z.string().optional(),
    requested_value: z.unknown().optional(),
    error: yelpJobReceiptErrorSchema.optional()
  })
  .passthrough();

const yelpJobReceiptUpdateEntrySchema: z.ZodTypeAny = z.lazy(() =>
  z.union([yelpJobReceiptValueSchema, yelpJobReceiptPrimitiveSchema, z.array(yelpJobReceiptUpdateEntrySchema)])
);

const yelpJobReceiptUpdateGroupSchema = z
  .object({
    status: z.string().optional()
  })
  .catchall(yelpJobReceiptUpdateEntrySchema);

const yelpBusinessResultSchema = z
  .object({
    status: z.string(),
    identifier_type: z.string().optional(),
    identifier: z.string().optional(),
    error: yelpJobReceiptErrorSchema.optional(),
    update_results: z.record(z.string(), yelpJobReceiptUpdateGroupSchema).optional()
  })
  .passthrough();

export const yelpJobStatusResponseSchema = z
  .object({
    status: z.string(),
    created_at: z.string().optional().nullable(),
    completed_at: z.string().optional().nullable(),
    business_results: z.array(yelpBusinessResultSchema).default([])
  })
  .passthrough();

const yelpProgramMetricsSchema = z
  .object({
    budget: z.number().optional().nullable(),
    currency: z.string().optional().nullable(),
    is_autobid: z.boolean().optional().nullable(),
    max_bid: z.number().optional().nullable(),
    fee_period: z.string().optional().nullable(),
    billed_impressions: z.number().optional().nullable(),
    billed_clicks: z.number().optional().nullable(),
    ad_cost: z.number().optional().nullable()
  })
  .passthrough();

const yelpPageUpgradeInfoSchema = z
  .object({
    cost: z.number().optional().nullable(),
    monthly_rate: z.number().optional().nullable()
  })
  .passthrough();

export const yelpUpstreamProgramSchema = z
  .object({
    active_features: z.array(z.string()).default([]),
    available_features: z.array(z.string()).default([]),
    end_date: z.string().optional().nullable(),
    program_id: z.string(),
    program_pause_status: z.string().optional(),
    program_status: z.string(),
    program_type: z.string(),
    start_date: z.string().optional().nullable(),
    ad_campaign_id: z.string().optional().nullable(),
    ad_categories: z.array(z.string()).default([]),
    program_metrics: yelpProgramMetricsSchema.optional(),
    future_budget_changes: z.array(z.unknown()).default([]),
    yelp_business_id: z.string().optional().nullable(),
    partner_business_id: z.string().optional().nullable(),
    page_upgrade_info: yelpPageUpgradeInfoSchema.optional()
  })
  .passthrough();

const yelpProgramListBusinessSchema = z
  .object({
    yelp_business_id: z.string(),
    advertiser_status: z.string().optional().nullable(),
    partner_business_id: z.string().optional().nullable(),
    destination_yelp_business_id: z.string().optional().nullable(),
    programs: z.array(yelpUpstreamProgramSchema).default([])
  })
  .passthrough();

export const yelpProgramListResponseSchema = z
  .object({
    businesses: z.array(yelpProgramListBusinessSchema).default([]),
    errors: z.array(z.unknown()).default([])
  })
  .passthrough();

export const yelpProgramInfoResponseSchema = z
  .object({
    programs: z.array(yelpUpstreamProgramSchema).default([]),
    errors: z.array(z.unknown()).default([])
  })
  .passthrough();

export const yelpLegacyJobStatusResponseSchema = z.object({
  job_id: z.string(),
  status: z.string(),
  message: z.string().optional(),
  program_id: z.string().optional(),
  errors: z.array(z.record(z.unknown())).optional(),
  warnings: z.array(z.record(z.unknown())).optional(),
  updated_at: z.string().datetime().optional()
});

export const linkTrackingFeatureSchema = z.object({
  type: z.literal("LINK_TRACKING"),
  destinationUrl: z.string().url(),
  trackingTemplate: z.string().url().optional(),
  clickSuffix: z.string().max(200).optional()
});

export const negativeKeywordFeatureSchema = z.object({
  type: z.literal("NEGATIVE_KEYWORD_TARGETING"),
  keywords: z.array(z.string().min(1).max(80)).max(100)
});

export const strictCategoryFeatureSchema = z.object({
  type: z.literal("STRICT_CATEGORY_TARGETING"),
  enabled: z.boolean(),
  categories: z.array(z.string()).default([])
});

export const adSchedulingFeatureSchema = z.object({
  type: z.literal("AD_SCHEDULING"),
  schedule: z.array(
    z.object({
      dayOfWeek: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/)
    })
  )
});

export const customLocationFeatureSchema = z.object({
  type: z.literal("CUSTOM_LOCATION_TARGETING"),
  neighborhoods: z.array(z.string().min(1)).max(25)
});

export const adGoalFeatureSchema = z.object({
  type: z.literal("AD_GOAL"),
  goal: z.enum(["LEADS", "CALLS", "WEBSITE", "AWARENESS"])
});

export const callTrackingFeatureSchema = z.object({
  type: z.literal("CALL_TRACKING"),
  enabled: z.boolean()
});

export const businessHighlightsFeatureSchema = z.object({
  type: z.literal("BUSINESS_HIGHLIGHTS"),
  highlights: z.array(z.string().min(1).max(50)).max(10)
});

export const verifiedLicenseFeatureSchema = z.object({
  type: z.literal("VERIFIED_LICENSE"),
  licenseNumber: z.string().min(3).max(100),
  issuingState: z.string().min(2).max(50)
});

export const customRadiusFeatureSchema = z.object({
  type: z.literal("CUSTOM_RADIUS_TARGETING"),
  radiusMiles: z.number().min(1).max(100)
});

export const customAdTextFeatureSchema = z.object({
  type: z.literal("CUSTOM_AD_TEXT"),
  headline: z.string().max(30).optional(),
  description: z.string().max(90).optional(),
  callToAction: z.string().max(25).optional()
});

export const customAdPhotoFeatureSchema = z.object({
  type: z.literal("CUSTOM_AD_PHOTO"),
  photoId: z.string().min(1),
  caption: z.string().max(120).optional()
});

export const businessLogoFeatureSchema = z.object({
  type: z.literal("BUSINESS_LOGO"),
  logoUrl: z.string().url()
});

export const yelpPortfolioFeatureSchema = z.object({
  type: z.literal("YELP_PORTFOLIO"),
  itemIds: z.array(z.string().min(1)).min(1).max(50)
});

export const yelpProgramFeatureSchema = z.discriminatedUnion("type", [
  linkTrackingFeatureSchema,
  negativeKeywordFeatureSchema,
  strictCategoryFeatureSchema,
  adSchedulingFeatureSchema,
  customLocationFeatureSchema,
  adGoalFeatureSchema,
  callTrackingFeatureSchema,
  businessHighlightsFeatureSchema,
  verifiedLicenseFeatureSchema,
  customRadiusFeatureSchema,
  customAdTextFeatureSchema,
  customAdPhotoFeatureSchema,
  businessLogoFeatureSchema,
  yelpPortfolioFeatureSchema
]);

export const yelpProgramFeatureCollectionSchema = z.array(yelpProgramFeatureSchema);

export const yelpFeatureDeleteResponseSchema = z.object({
  success: z.boolean(),
  feature_type: z.string(),
  message: z.string().optional()
});

export const yelpReportRequestSchema = z.object({
  business_ids: z.array(z.string()).min(1).max(20),
  start_date: z.string().date(),
  end_date: z.string().date(),
  metrics: z.array(z.string()).default([]),
  filters: z.record(z.unknown()).optional()
});

export const yelpReportResponseSchema = z.object({
  report_id: z.string(),
  status: z.enum(["REQUESTED", "PROCESSING", "READY", "FAILED"]),
  granularity: z.enum(["DAILY", "MONTHLY"]),
  totals: z.record(z.union([z.number(), z.string(), z.null()])),
  rows: z.array(z.record(z.union([z.number(), z.string(), z.null()]))),
  message: z.string().optional()
});

export const yelpBusinessMatchResultSchema = z.object({
  encrypted_business_id: z.string(),
  name: z.string(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  categories: z
    .array(
      z.union([
        z.string(),
        z
          .object({
            label: z.string().optional(),
            title: z.string().optional(),
            name: z.string().optional(),
            alias: z.string().optional()
          })
          .passthrough()
      ])
    )
    .default([]),
  about_text_present: z.boolean().optional(),
  readiness: z
    .object({
      hasAboutText: z.boolean().optional(),
      hasCategories: z.boolean().optional(),
      missingItems: z.array(z.string()).default([])
    })
    .optional()
});

export const yelpBusinessMatchResponseSchema = z.object({
  matches: z.array(yelpBusinessMatchResultSchema)
});

export const yelpLeadWebhookUpdateSchema = z
  .object({
    event_type: z.string().min(1),
    event_id: z.string().optional(),
    lead_id: z.string().min(1),
    interaction_time: z.string().optional()
  })
  .passthrough();

export const yelpLeadWebhookPayloadSchema = z
  .object({
    time: z.string().optional(),
    object: z.string().optional(),
    data: z
      .object({
        id: z.string().min(1),
        updates: z.array(yelpLeadWebhookUpdateSchema).default([])
      })
      .passthrough()
  })
  .passthrough();

const yelpLeadPersonSchema = z
  .object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    phone_number: z.string().optional(),
    temporary_phone_number: z.string().optional(),
    masked_phone_number: z.string().optional(),
    temporary_email_address: z.string().optional()
  })
  .partial()
  .passthrough();

export const yelpLeadDetailSchema = z
  .object({
    id: z.string().optional(),
    lead_id: z.string().optional(),
    business_id: z.string().optional(),
    conversation_id: z.string().optional(),
    time_created: z.string().optional(),
    interaction_time: z.string().optional(),
    last_activity_time: z.string().optional(),
    latest_interaction_at: z.string().optional(),
    reply_state: z.string().optional(),
    is_read: z.boolean().optional(),
    is_replied: z.boolean().optional(),
    customer_name: z.string().optional(),
    customer_email: z.string().optional(),
    customer_phone: z.string().optional(),
    phone_number: z.string().optional(),
    temporary_phone_number: z.string().optional(),
    phone_number_expires_at: z.string().optional(),
    phone_number_expiry: z.string().optional(),
    temporary_phone_number_expires_at: z.string().optional(),
    temporary_phone_number_expiry: z.string().optional(),
    temporary_phone_number_expiration: z.string().optional(),
    masked_phone_number: z.string().optional(),
    temporary_email_address: z.string().optional(),
    customer: yelpLeadPersonSchema.optional(),
    consumer: yelpLeadPersonSchema.optional(),
    user: yelpLeadPersonSchema.optional(),
    lead: z.record(z.unknown()).optional(),
    data: z.record(z.unknown()).optional()
  })
  .passthrough();

export const yelpLeadEventSchema = z
  .object({
    id: z.string().optional(),
    cursor: z.string().optional(),
    event_id: z.string().optional(),
    event_type: z.string().optional(),
    type: z.string().optional(),
    interaction_time: z.string().optional(),
    time_created: z.string().optional(),
    created_at: z.string().optional(),
    timestamp: z.string().optional(),
    message: z.string().optional(),
    text: z.string().optional()
  })
  .passthrough();

export const yelpLeadEventsResponseSchema = z.union([
  z
    .object({
      events: z.array(yelpLeadEventSchema).default([])
    })
    .passthrough(),
  z.array(yelpLeadEventSchema)
]);

export const yelpBusinessLeadIdsResponseSchema = z.union([
  z
    .object({
      lead_ids: z.array(z.string()).default([]),
      has_more: z.boolean().optional()
    })
    .passthrough(),
  z.array(z.string())
]);

export const yelpBusinessSubscriptionTypeSchema = z.enum(["WEBHOOK", "YELP_KNOWLEDGE", "LISTING_MANAGEMENT"]);

export const yelpBusinessSubscriptionRequestSchema = z.object({
  subscription_types: z.array(yelpBusinessSubscriptionTypeSchema).min(1),
  business_ids: z.array(z.string().min(1)).min(1).max(1000)
});

export const yelpBusinessSubscriptionsResponseSchema = z
  .object({
    total: z.number().int().nonnegative().default(0),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().positive().default(100),
    subscription_type: yelpBusinessSubscriptionTypeSchema,
    subscriptions: z
      .array(
        z
          .object({
            business_id: z.string(),
            subscribed_at: z.string().optional().nullable()
          })
          .passthrough()
      )
      .default([])
  })
  .passthrough();

export const yelpWriteLeadEventRequestSchema = z.object({
  request_content: z.string().trim().min(1),
  request_type: z.literal("TEXT").default("TEXT")
});

export const yelpMarkLeadEventAsReadRequestSchema = z.object({
  event_id: z.string().trim().min(1),
  time_read: z.string().datetime()
});

export const yelpMarkLeadAsRepliedRequestSchema = z.object({
  reply_type: z.enum(["EMAIL", "PHONE"])
});

export type YelpCreateProgramRequestDto = z.infer<typeof yelpCreateProgramRequestSchema>;
export type YelpEditProgramRequestDto = z.infer<typeof yelpEditProgramRequestSchema>;
export type YelpTerminateProgramRequestDto = z.infer<typeof yelpTerminateProgramRequestSchema>;
export type YelpJobSubmissionResponseDto = z.infer<typeof yelpJobSubmissionResponseSchema>;
export type YelpJobStatusResponseDto = z.infer<typeof yelpJobStatusResponseSchema>;
export type YelpProgramListResponseDto = z.infer<typeof yelpProgramListResponseSchema>;
export type YelpProgramInfoResponseDto = z.infer<typeof yelpProgramInfoResponseSchema>;
export type YelpUpstreamProgramDto = z.infer<typeof yelpUpstreamProgramSchema>;
export type YelpProgramFeatureDto = z.infer<typeof yelpProgramFeatureSchema>;
export type YelpReportRequestDto = z.infer<typeof yelpReportRequestSchema>;
export type YelpReportResponseDto = z.infer<typeof yelpReportResponseSchema>;
export type YelpBusinessMatchResponseDto = z.infer<typeof yelpBusinessMatchResponseSchema>;
export type YelpLeadWebhookPayloadDto = z.infer<typeof yelpLeadWebhookPayloadSchema>;
export type YelpLeadWebhookUpdateDto = z.infer<typeof yelpLeadWebhookUpdateSchema>;
export type YelpLeadDetailDto = z.infer<typeof yelpLeadDetailSchema>;
export type YelpLeadEventsResponseDto = z.infer<typeof yelpLeadEventsResponseSchema>;
export type YelpBusinessLeadIdsResponseDto = z.infer<typeof yelpBusinessLeadIdsResponseSchema>;
export type YelpBusinessSubscriptionTypeDto = z.infer<typeof yelpBusinessSubscriptionTypeSchema>;
export type YelpBusinessSubscriptionRequestDto = z.infer<typeof yelpBusinessSubscriptionRequestSchema>;
export type YelpBusinessSubscriptionsResponseDto = z.infer<typeof yelpBusinessSubscriptionsResponseSchema>;
export type YelpWriteLeadEventRequestDto = z.infer<typeof yelpWriteLeadEventRequestSchema>;
export type YelpMarkLeadEventAsReadRequestDto = z.infer<typeof yelpMarkLeadEventAsReadRequestSchema>;
export type YelpMarkLeadAsRepliedRequestDto = z.infer<typeof yelpMarkLeadAsRepliedRequestSchema>;
