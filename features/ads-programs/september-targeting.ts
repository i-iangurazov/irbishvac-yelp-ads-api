import type {
  SeptemberBoostScope,
  SeptemberCampaignLayer,
} from "@/features/ads-programs/layers";

export const septemberServiceKeywordPolicies = {
  SEPTEMBER_HVAC_REPAIR: [
    "bathtub inspection",
    "bathtub repair",
    "boiler services",
    "commercial services",
    "emergency services",
    "faucet inspection",
    "faucet repair",
    "flame sensor repair",
    "garbage disposal inspection",
    "garbage disposal repair",
    "portable ac",
    "propane furnace",
    "radiant heating installation",
    "radiant heating repair",
    "shower inspection",
    "shower repair",
    "sink inspection",
    "sink repair",
    "toilet inspection",
    "toilet repair",
    "air duct cleaning",
    "appliance repair",
    "asbestos removal",
    "central air conditioning installation",
    "chimney sweep",
    "dryer vent cleaning",
    "gas fireplace repair",
    "handyman",
    "heating oil",
    "humidifier",
    "hydronic cleaning",
    "insulation installation",
    "mini split",
    "mold remediation",
    "plumbing",
    "solar installation",
    "tankless water heater",
    "thermostat installation",
    "whole house fan installation",
  ],
  SEPTEMBER_HVAC_INSTALLATION: [
    "bathtub inspection",
    "bathtub repair",
    "boiler services",
    "commercial services",
    "emergency services",
    "faucet inspection",
    "faucet repair",
    "flame sensor repair",
    "garbage disposal inspection",
    "garbage disposal repair",
    "portable ac",
    "propane furnace",
    "radiant heating installation",
    "radiant heating repair",
    "shower inspection",
    "shower repair",
    "sink inspection",
    "sink repair",
    "toilet inspection",
    "toilet repair",
    "ac repair",
    "air duct cleaning",
    "appliance repair",
    "asbestos removal",
    "chimney sweep",
    "commercial refrigeration repair",
    "dryer vent cleaning",
    "furnace repair",
    "gas fireplace repair",
    "handyman",
    "heating oil",
    "hydronic cleaning",
    "mold remediation",
    "plumbing",
    "solar installation",
    "tankless water heater",
  ],
  SEPTEMBER_HVAC_MAINTENANCE: [
    "bathtub inspection",
    "bathtub repair",
    "boiler services",
    "commercial services",
    "emergency services",
    "faucet inspection",
    "faucet repair",
    "flame sensor repair",
    "garbage disposal inspection",
    "garbage disposal repair",
    "portable ac",
    "propane furnace",
    "radiant heating installation",
    "radiant heating repair",
    "shower inspection",
    "shower repair",
    "sink inspection",
    "sink repair",
    "toilet inspection",
    "toilet repair",
    "ac repair",
    "appliance repair",
    "asbestos removal",
    "central air conditioning installation",
    "chimney sweep",
    "commercial refrigeration repair",
    "furnace repair",
    "gas fireplace repair",
    "handyman",
    "heating oil",
    "insulation installation",
    "mini split",
    "mold remediation",
    "plumbing",
    "solar installation",
    "tankless water heater",
    "thermostat installation",
    "whole house fan installation",
  ],
  SEPTEMBER_COMMERCIAL_HVAC: [
    "bathtub inspection",
    "bathtub repair",
    "faucet inspection",
    "faucet repair",
    "garbage disposal inspection",
    "garbage disposal repair",
    "shower inspection",
    "shower repair",
    "sink inspection",
    "sink repair",
    "toilet inspection",
    "toilet repair",
    "appliance repair",
    "asbestos removal",
    "chimney sweep",
    "gas fireplace repair",
    "handyman",
    "mold remediation",
    "plumbing",
    "solar installation",
    "tankless water heater",
    "whole house fan installation",
  ],
} as const satisfies Partial<Record<SeptemberCampaignLayer, readonly string[]>>;

const boostScopeLayers = {
  HVAC_REPAIR: "SEPTEMBER_HVAC_REPAIR",
  HVAC_INSTALLATION: "SEPTEMBER_HVAC_INSTALLATION",
  HVAC_MAINTENANCE: "SEPTEMBER_HVAC_MAINTENANCE",
} as const satisfies Partial<
  Record<SeptemberBoostScope, keyof typeof septemberServiceKeywordPolicies>
>;

type BoostHvacLayer = (typeof boostScopeLayers)[keyof typeof boostScopeLayers];

const plumbingKeywords = new Set([
  "bathtub inspection",
  "bathtub repair",
  "faucet inspection",
  "faucet repair",
  "garbage disposal inspection",
  "garbage disposal repair",
  "plumbing",
  "shower inspection",
  "shower repair",
  "sink inspection",
  "sink repair",
  "toilet inspection",
  "toilet repair",
]);

const waterHeaterKeywords = new Set([
  "boiler services",
  "tankless water heater",
]);

export function getSeptemberLayerBlockedKeywords(
  layer: keyof typeof septemberServiceKeywordPolicies,
) {
  return [...septemberServiceKeywordPolicies[layer]];
}

export function resolveSeptemberBoostBlockedKeywords(
  scopes: readonly SeptemberBoostScope[],
) {
  const selectedHvacLayers = scopes
    .map((scope) => boostScopeLayers[scope as keyof typeof boostScopeLayers])
    .filter((layer): layer is BoostHvacLayer => layer !== undefined);

  if (selectedHvacLayers.length === 0 || selectedHvacLayers.length === 3) {
    return [];
  }

  const [firstLayer, ...remainingLayers] = selectedHvacLayers;
  const blockedByEverySelectedHvacScope = new Set<string>(
    septemberServiceKeywordPolicies[firstLayer!],
  );

  for (const layer of remainingLayers) {
    const nextPolicy = new Set<string>(septemberServiceKeywordPolicies[layer]);

    for (const keyword of blockedByEverySelectedHvacScope) {
      if (!nextPolicy.has(keyword)) {
        blockedByEverySelectedHvacScope.delete(keyword);
      }
    }
  }

  if (scopes.includes("PLUMBING")) {
    for (const keyword of plumbingKeywords) {
      blockedByEverySelectedHvacScope.delete(keyword);
    }
  }

  if (scopes.includes("WATER_HEATER")) {
    for (const keyword of waterHeaterKeywords) {
      blockedByEverySelectedHvacScope.delete(keyword);
    }
  }

  return [...blockedByEverySelectedHvacScope];
}
