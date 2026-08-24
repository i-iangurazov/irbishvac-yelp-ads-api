import "server-only";

import {
  LEAD_AUTORESPONDER_SETTING_KEY,
  type ApprovedLeadAiModelValue,
  approvedLeadAiModelOptions,
  defaultLeadAiModel,
} from "@/features/autoresponder/constants";
import {
  leadConversationAllowedIntentsSchema,
  leadAutoresponderSettingsSchema,
  type LeadAutoresponderSettingsValues,
} from "@/features/autoresponder/schemas";
import { getLeadAutomationBusinessOverrideByBusinessId } from "@/lib/db/autoresponder-repository";
import { getBusinessAutomationSafetyState } from "@/lib/db/businesses-repository";
import { getSystemSetting } from "@/lib/db/settings-repository";
import { getServerEnv } from "@/lib/utils/env";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readLeadAutoresponderSettings(value: unknown) {
  const record = asRecord(value);
  const configuredModel = resolveLeadAiModel(
    typeof record?.aiModel === "string" ? record.aiModel : null,
    getServerEnv().CLAUDE_REPLY_MODEL,
  );

  return leadAutoresponderSettingsSchema.parse({
    ...(record ?? {}),
    aiModel: configuredModel,
  });
}

export function getLeadAiModelOption(model: string | null | undefined) {
  return (
    approvedLeadAiModelOptions.find((option) => option.value === model) ?? null
  );
}

export function getLeadAiModelLabel(model: string | null | undefined) {
  const option = getLeadAiModelOption(model);
  return option
    ? `${option.value} • ${option.label}`
    : (model ?? "Model unavailable");
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

  const configuredOption = getLeadAiModelOption(
    getServerEnv().CLAUDE_REPLY_MODEL,
  );

  if (configuredOption) {
    return configuredOption.value;
  }

  return defaultLeadAiModel;
}

export async function getLeadAutomationScopeConfig(
  tenantId: string,
  businessId?: string | null,
) {
  const settingsValue = await getSystemSetting(
    tenantId,
    LEAD_AUTORESPONDER_SETTING_KEY,
  );
  const defaults = readLeadAutoresponderSettings(settingsValue);
  const [override, businessSafetyRecord] = businessId
    ? await Promise.all([
        getLeadAutomationBusinessOverrideByBusinessId(tenantId, businessId),
        getBusinessAutomationSafetyState(businessId, tenantId),
      ])
    : [null, null];
  const businessReadiness = asRecord(businessSafetyRecord?.readinessJson);
  const onboardingManaged = businessReadiness?.onboardingManaged === true;
  const onboardingStatus =
    typeof businessReadiness?.onboardingStatus === "string"
      ? businessReadiness.onboardingStatus
      : null;
  const businessKillSwitchEnabled =
    businessReadiness?.emergencyDisabled === true ||
    (onboardingManaged && onboardingStatus !== "ACTIVE");
  const defaultsApplyToBusiness =
    defaults.scopeMode === "ALL_BUSINESSES" ||
    (Boolean(businessId) &&
      defaults.scopedBusinessIds.includes(businessId as string));

  const scopedSettings: LeadAutoresponderSettingsValues = override
    ? {
        isEnabled: override.isEnabled,
        tenantKillSwitchEnabled: defaults.tenantKillSwitchEnabled,
        scopeMode: defaults.scopeMode,
        scopedBusinessIds: defaults.scopedBusinessIds,
        defaultChannel:
          override.defaultChannel === "EMAIL" ? "EMAIL" : "YELP_THREAD",
        emailFallbackEnabled: override.emailFallbackEnabled,
        followUp24hEnabled: override.followUp24hEnabled,
        followUp24hDelayHours: override.followUp24hDelayHours,
        followUp7dEnabled: override.followUp7dEnabled,
        followUp7dDelayDays: override.followUp7dDelayDays,
        aiAssistEnabled: override.aiAssistEnabled,
        aiModel: defaults.aiAllowedModels.includes(
          resolveLeadAiModel(override.aiModel),
        )
          ? resolveLeadAiModel(override.aiModel)
          : defaults.aiModel,
        aiAllowedModels: defaults.aiAllowedModels,
        aiMonthlyBudgetUsd: defaults.aiMonthlyBudgetUsd,
        aiMonthlyMessageLimit: defaults.aiMonthlyMessageLimit,
        aiMonthlyTokenLimit: defaults.aiMonthlyTokenLimit,
        aiUsageWarningPercent: defaults.aiUsageWarningPercent,
        aiAgencyMarkupPercent: defaults.aiAgencyMarkupPercent,
        conversationAutomationEnabled:
          override.isEnabled && override.conversationAutomationEnabled,
        conversationGlobalPauseEnabled: defaults.conversationGlobalPauseEnabled,
        conversationMode: override.conversationMode,
        conversationAllowedIntents: leadConversationAllowedIntentsSchema.parse(
          override.conversationAllowedIntentsJson,
        ),
        conversationMaxAutomatedTurns: override.conversationMaxAutomatedTurns,
        conversationReviewFallbackEnabled:
          override.conversationReviewFallbackEnabled,
        conversationEscalateToIssueQueue:
          override.conversationEscalateToIssueQueue,
      }
    : {
        ...defaults,
        isEnabled: defaults.isEnabled && defaultsApplyToBusiness,
        conversationAutomationEnabled:
          defaults.conversationAutomationEnabled &&
          defaults.isEnabled &&
          defaultsApplyToBusiness,
      };
  const platformKillSwitchEnabled =
    getServerEnv().AUTORESPONDER_GLOBAL_KILL_SWITCH === "true";
  const tenantKillSwitchEnabled = defaults.tenantKillSwitchEnabled;
  const effectiveSettings: LeadAutoresponderSettingsValues =
    platformKillSwitchEnabled ||
    tenantKillSwitchEnabled ||
    businessKillSwitchEnabled
      ? {
          ...scopedSettings,
          isEnabled: false,
          conversationAutomationEnabled: false,
          conversationGlobalPauseEnabled: true,
        }
      : scopedSettings;

  return {
    defaults,
    override,
    effectiveSettings,
    defaultsApplyToBusiness,
    platformKillSwitchEnabled,
    tenantKillSwitchEnabled,
    businessKillSwitchEnabled,
    onboardingStatus,
  };
}
