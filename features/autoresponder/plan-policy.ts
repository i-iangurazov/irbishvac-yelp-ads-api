import type { LeadAutoresponderSettingsValues } from "@/features/autoresponder/schemas";

export function hasProtectedAiPlanChanges(
  current: LeadAutoresponderSettingsValues,
  next: LeadAutoresponderSettingsValues,
) {
  const currentModels = [...current.aiAllowedModels].sort();
  const nextModels = [...next.aiAllowedModels].sort();

  return (
    JSON.stringify(currentModels) !== JSON.stringify(nextModels) ||
    next.aiMonthlyBudgetUsd !== current.aiMonthlyBudgetUsd ||
    next.aiMonthlyMessageLimit !== current.aiMonthlyMessageLimit ||
    next.aiMonthlyTokenLimit !== current.aiMonthlyTokenLimit ||
    next.aiUsageWarningPercent !== current.aiUsageWarningPercent ||
    next.aiAgencyMarkupPercent !== current.aiAgencyMarkupPercent
  );
}
