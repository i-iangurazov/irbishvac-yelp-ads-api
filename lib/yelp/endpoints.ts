export const DEFAULT_YELP_ENDPOINTS = {
  ads: {
    createProgram: "/v1/reseller/program/create",
    editProgram: "/v1/reseller/program/{programId}/edit",
    endProgram: "/v1/reseller/program/{programId}/end",
    jobStatus: "/v1/reseller/status/{jobId}",
    listPrograms: "/v1/programs/list/{businessId}",
    getProgramInfo: "/v1/programs/info/{programId}",
    testConnection: ""
  },
  features: {
    getProgramFeatures: "/ads/programs/{programId}/features",
    updateProgramFeatures: "/ads/programs/{programId}/features",
    deleteProgramFeatures: "/ads/programs/{programId}/features/{featureType}",
    testConnection: "/"
  },
  reporting: {
    requestDailyReport: "/reporting/daily",
    getDailyReport: "/reporting/daily/{reportId}",
    requestMonthlyReport: "/reporting/monthly",
    getMonthlyReport: "/reporting/monthly/{reportId}",
    testConnection: "/"
  },
  leads: {
    getLead: "/v3/leads/{leadId}",
    getLeadEvents: "/v3/leads/{leadId}/events",
    writeLeadEvent: "/v3/leads/{leadId}/events",
    markLeadEventAsRead: "/v3/leads/{leadId}/events/mark_as_read",
    markLeadAsReplied: "/v3/leads/{leadId}/mark_as_replied",
    getBusinessLeadIds: "/v3/businesses/{businessId}/lead_ids",
    businessSubscriptions: "/v3/businesses/subscriptions"
  },
  businessMatch: {
    matchBusiness: "/businesses/match",
    testConnection: "/"
  },
  dataIngestion: {
    patchBusinessReadinessFields: "/businesses/{encryptedBusinessId}",
    testConnection: "/"
  }
} as const;

export function resolveEndpoint(
  template: string,
  params: Record<string, string | number | undefined> = {}
) {
  return Object.entries(params).reduce(
    (path, [key, value]) => path.replace(`{${key}}`, value === undefined ? "" : String(value)),
    template
  );
}
