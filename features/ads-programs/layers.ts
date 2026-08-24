export const campaignLayers = [
  "GENERAL",
  "MAIN",
  "AUGUST_PLUMBING_TEMP",
  "AUGUST_COMMERCIAL_HVAC_TEMP",
] as const;

export type CampaignLayer = (typeof campaignLayers)[number];

export const campaignLayerLabels: Record<CampaignLayer, string> = {
  GENERAL: "Standard campaign",
  MAIN: "Main campaign",
  AUGUST_PLUMBING_TEMP: "Plumbing temporary · through Aug 31",
  AUGUST_COMMERCIAL_HVAC_TEMP: "Commercial HVAC temporary · through Aug 31",
};

export const temporaryAugustCampaigns = {
  AUGUST_PLUMBING_TEMP: {
    categoryAlias: "plumbing",
    dailyBudgetDollars: "230",
    monthlyBudgetDollars: "6900",
    endDate: "2026-08-31",
  },
  AUGUST_COMMERCIAL_HVAC_TEMP: {
    categoryAlias: "hvac",
    dailyBudgetDollars: "200",
    monthlyBudgetDollars: "6000",
    endDate: "2026-08-31",
  },
} as const;

export function normalizeCampaignLayer(value: unknown): CampaignLayer {
  return campaignLayers.includes(value as CampaignLayer)
    ? (value as CampaignLayer)
    : "GENERAL";
}

export function getProgramCampaignLayer(configuration: unknown) {
  if (
    typeof configuration !== "object" ||
    configuration === null ||
    Array.isArray(configuration)
  ) {
    return "GENERAL" as const;
  }

  return normalizeCampaignLayer(
    (configuration as Record<string, unknown>).campaignLayer,
  );
}

export function isTemporaryAugustCampaignLayer(
  value: unknown,
): value is keyof typeof temporaryAugustCampaigns {
  return (
    value === "AUGUST_PLUMBING_TEMP" || value === "AUGUST_COMMERCIAL_HVAC_TEMP"
  );
}

export function areCompatibleOverlappingLayers(left: unknown, right: unknown) {
  const leftLayer = normalizeCampaignLayer(left);
  const rightLayer = normalizeCampaignLayer(right);

  return (
    leftLayer !== rightLayer &&
    (leftLayer === "AUGUST_COMMERCIAL_HVAC_TEMP" ||
      rightLayer === "AUGUST_COMMERCIAL_HVAC_TEMP")
  );
}
