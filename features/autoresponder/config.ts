import "server-only";

import {
  LEAD_AUTORESPONDER_SETTING_KEY,
  type ApprovedLeadAiModelValue,
  approvedLeadAiModelOptions,
  defaultLeadAiModel
} from "@/features/autoresponder/constants";
import {
  leadAutoresponderSettingsSchema,
  type LeadAutoresponderSettingsValues
} from "@/features/autoresponder/schemas";
import { getLeadAutomationBusinessOverrideByBusinessId } from "@/lib/db/autoresponder-repository";
import { getSystemSetting } from "@/lib/db/settings-repository";

export function readLeadAutoresponderSettings(value: unknown) {
  return leadAutoresponderSettingsSchema.parse(value ?? {});
}

export function getLeadAiModelOption(model: string | null | undefined) {
  return approvedLeadAiModelOptions.find((option) => option.value === model) ?? null;
}

export function getLeadAiModelLabel(model: string | null | undefined) {
  const option = getLeadAiModelOption(model);
  return option ? `${option.value} • ${option.label}` : model ?? "Model unavailable";
}

export function resolveLeadAiModel(
  ...candidates: Array<string | null | undefined>
): ApprovedLeadAiModelValue {
  for (const candidate of candidates) {
    const option = getLeadAiModelOption(candidate);

    if (option) {
      return option.value;
    }
  }

  return defaultLeadAiModel;
}

export async function getLeadAutomationScopeConfig(tenantId: string, businessId?: string | null) {
  const settingsValue = await getSystemSetting(tenantId, LEAD_AUTORESPONDER_SETTING_KEY);
  const defaults = readLeadAutoresponderSettings(settingsValue);
  const override = businessId
    ? await getLeadAutomationBusinessOverrideByBusinessId(tenantId, businessId)
    : null;
  const defaultsApplyToBusiness =
    defaults.scopeMode === "ALL_BUSINESSES" ||
    (Boolean(businessId) && defaults.scopedBusinessIds.includes(businessId as string));

  const effectiveSettings: LeadAutoresponderSettingsValues = override
    ? {
        isEnabled: override.isEnabled,
        scopeMode: defaults.scopeMode,
        scopedBusinessIds: defaults.scopedBusinessIds,
        defaultChannel: override.defaultChannel === "EMAIL" ? "EMAIL" : "YELP_THREAD",
        emailFallbackEnabled: override.emailFallbackEnabled,
        followUp24hEnabled: override.followUp24hEnabled,
        followUp24hDelayHours: override.followUp24hDelayHours,
        followUp7dEnabled: override.followUp7dEnabled,
        followUp7dDelayDays: override.followUp7dDelayDays,
        aiAssistEnabled: override.aiAssistEnabled,
        aiModel: resolveLeadAiModel(override.aiModel)
      }
    : {
        ...defaults,
        isEnabled: defaults.isEnabled && defaultsApplyToBusiness
      };

  return {
    defaults,
    override,
    effectiveSettings,
    defaultsApplyToBusiness
  };
}
