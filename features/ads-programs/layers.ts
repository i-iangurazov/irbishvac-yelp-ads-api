export const campaignLayers = [
  "GENERAL",
  "MAIN",
  "SEPTEMBER_HVAC_INSTALLATION",
  "SEPTEMBER_HVAC_REPAIR",
  "SEPTEMBER_HVAC_MAINTENANCE",
  "SEPTEMBER_COMMERCIAL_HVAC",
  "SEPTEMBER_PLUMBING",
  "SEPTEMBER_END_OF_MONTH_BOOST",
  "AUGUST_PLUMBING_TEMP",
  "AUGUST_COMMERCIAL_HVAC_TEMP",
] as const;

export type CampaignLayer = (typeof campaignLayers)[number];

export const campaignLayerLabels: Record<CampaignLayer, string> = {
  GENERAL: "Standard campaign",
  MAIN: "Main campaign",
  SEPTEMBER_HVAC_INSTALLATION: "IRBIS HVAC Installation layer",
  SEPTEMBER_HVAC_REPAIR: "IRBIS HVAC Repair layer",
  SEPTEMBER_HVAC_MAINTENANCE: "IRBIS HVAC Maintenance layer",
  SEPTEMBER_COMMERCIAL_HVAC: "IRBIS Commercial HVAC layer",
  SEPTEMBER_PLUMBING: "IRBIS Plumbing layer",
  SEPTEMBER_END_OF_MONTH_BOOST: "IRBIS End-of-Month Boost layer",
  AUGUST_PLUMBING_TEMP: "Plumbing temporary · through Aug 31",
  AUGUST_COMMERCIAL_HVAC_TEMP: "Commercial HVAC temporary · through Aug 31",
};

export const selectableCampaignLayers = campaignLayers.filter(
  (layer) =>
    !layer.startsWith("SEPTEMBER_") &&
    layer !== "AUGUST_PLUMBING_TEMP" &&
    layer !== "AUGUST_COMMERCIAL_HVAC_TEMP",
);

export const septemberCampaigns = {
  SEPTEMBER_HVAC_INSTALLATION: {
    categoryAliases: ["hvac"],
    monthlyBudgetDollars: "12000",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    requiresServiceTargeting: true,
    applyEnabled: true,
  },
  SEPTEMBER_HVAC_REPAIR: {
    categoryAliases: ["hvac"],
    monthlyBudgetDollars: "12000",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    requiresServiceTargeting: true,
    applyEnabled: true,
  },
  SEPTEMBER_HVAC_MAINTENANCE: {
    categoryAliases: ["hvac"],
    monthlyBudgetDollars: "3000",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    requiresServiceTargeting: true,
    applyEnabled: true,
  },
  SEPTEMBER_COMMERCIAL_HVAC: {
    categoryAliases: ["hvac"],
    monthlyBudgetDollars: "3000",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    requiresServiceTargeting: true,
    applyEnabled: true,
  },
  SEPTEMBER_PLUMBING: {
    categoryAliases: ["plumbing"],
    monthlyBudgetDollars: "15000",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    requiresServiceTargeting: false,
    applyEnabled: true,
  },
  SEPTEMBER_END_OF_MONTH_BOOST: {
    categoryAliases: [],
    monthlyBudgetDollars: "5000",
    startDate: "2026-09-25",
    endDate: "2026-09-30",
    requiresServiceTargeting: false,
    applyEnabled: false,
    blocker:
      "Caitlyn must confirm the approved trade scope before this layer can be submitted.",
  },
} as const;

export type SeptemberCampaignLayer = keyof typeof septemberCampaigns;

export function isSeptemberCampaignLayer(
  value: unknown,
): value is SeptemberCampaignLayer {
  return typeof value === "string" && value in septemberCampaigns;
}

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

  if (leftLayer === rightLayer) {
    return false;
  }

  if (
    leftLayer === "AUGUST_COMMERCIAL_HVAC_TEMP" ||
    rightLayer === "AUGUST_COMMERCIAL_HVAC_TEMP"
  ) {
    return true;
  }

  return leftLayer !== "GENERAL" && rightLayer !== "GENERAL";
}
