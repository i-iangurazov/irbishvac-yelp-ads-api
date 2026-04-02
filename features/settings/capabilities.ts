export type CapabilityFlags = {
  hasAdsApi: boolean;
  hasLeadsApi: boolean;
  hasReportingApi: boolean;
  hasConversionsApi: boolean;
  hasPartnerSupportApi: boolean;
  hasCrmIntegration: boolean;
  adsApiEnabled: boolean;
  programFeatureApiEnabled: boolean;
  reportingApiEnabled: boolean;
  dataIngestionApiEnabled: boolean;
  businessMatchApiEnabled: boolean;
  demoModeEnabled: boolean;
};

type PartialCapabilityFlags = Partial<CapabilityFlags>;

export const capabilityFlagDefinitions: Array<{
  key: keyof CapabilityFlags;
  label: string;
  description: string;
}> = [
  {
    key: "hasAdsApi",
    label: "Ads API",
    description: "Yelp Ads program create, edit, terminate, and sync workflows."
  },
  {
    key: "hasLeadsApi",
    label: "Leads API",
    description: "Yelp lead ingestion, webhook handling, and lead activity visibility."
  },
  {
    key: "hasReportingApi",
    label: "Reporting API",
    description: "Batch-oriented Yelp reporting requests, polling, and snapshot persistence."
  },
  {
    key: "hasConversionsApi",
    label: "Conversions API",
    description: "Optional downstream conversion import capabilities when Yelp enables them."
  },
  {
    key: "hasPartnerSupportApi",
    label: "Partner Support API",
    description: "Partner support and business-access helper capabilities when the account has them."
  },
  {
    key: "hasCrmIntegration",
    label: "CRM Integration",
    description: "Internal CRM or ServiceTitan enrichment, status mapping, and service assignment."
  },
  {
    key: "programFeatureApiEnabled",
    label: "Program Features API",
    description: "Feature read/write endpoints for existing Yelp Ads programs."
  },
  {
    key: "demoModeEnabled",
    label: "Demo Mode",
    description: "Local fallback mode for exercising the console without live Yelp calls."
  }
];

export const capabilityFlagLabels = Object.fromEntries(
  capabilityFlagDefinitions.map((definition) => [definition.key, definition.label])
) as Record<keyof CapabilityFlags, string>;

const defaultCapabilities: CapabilityFlags = {
  hasAdsApi: false,
  hasLeadsApi: false,
  hasReportingApi: false,
  hasConversionsApi: false,
  hasPartnerSupportApi: false,
  hasCrmIntegration: false,
  adsApiEnabled: false,
  programFeatureApiEnabled: false,
  reportingApiEnabled: false,
  dataIngestionApiEnabled: false,
  businessMatchApiEnabled: false,
  demoModeEnabled: false
};

export function normalizeCapabilityFlags(stored?: PartialCapabilityFlags | null): CapabilityFlags {
  const next = {
    ...defaultCapabilities,
    ...(stored ?? {})
  };

  const hasAdsApi = next.hasAdsApi || next.adsApiEnabled;
  const hasLeadsApi = next.hasLeadsApi || next.dataIngestionApiEnabled;
  const hasReportingApi = next.hasReportingApi || next.reportingApiEnabled;
  const hasPartnerSupportApi = next.hasPartnerSupportApi || next.businessMatchApiEnabled;

  return {
    ...next,
    hasAdsApi,
    hasLeadsApi,
    hasReportingApi,
    hasPartnerSupportApi,
    adsApiEnabled: hasAdsApi,
    dataIngestionApiEnabled: hasLeadsApi,
    reportingApiEnabled: hasReportingApi,
    businessMatchApiEnabled: hasPartnerSupportApi
  };
}

export function getEnabledCapabilityLabels(flags: CapabilityFlags) {
  return capabilityFlagDefinitions
    .filter((definition) => flags[definition.key])
    .map((definition) => definition.label);
}
