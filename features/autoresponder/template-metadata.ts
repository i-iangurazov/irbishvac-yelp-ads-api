import {
  leadAutomationRenderModeValues,
  leadAutomationTemplateKinds,
  type LeadAutomationRenderModeValue
} from "@/features/autoresponder/constants";

type LeadAutomationTemplateKindValue = (typeof leadAutomationTemplateKinds)[number];

export type LeadAutomationTemplateMetadata = {
  templateKind: LeadAutomationTemplateKindValue;
  renderMode: LeadAutomationRenderModeValue;
  aiPrompt: string | null;
};

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readLeadAutomationTemplateMetadata(value: unknown): LeadAutomationTemplateMetadata {
  const record = asRecord(value);
  const templateKind = typeof record?.templateKind === "string" && leadAutomationTemplateKinds.includes(record.templateKind as LeadAutomationTemplateKindValue)
    ? (record.templateKind as LeadAutomationTemplateKindValue)
    : "CUSTOM";
  const renderMode =
    typeof record?.renderMode === "string" &&
    leadAutomationRenderModeValues.includes(record.renderMode as LeadAutomationRenderModeValue)
      ? (record.renderMode as LeadAutomationRenderModeValue)
      : "STATIC";
  const aiPrompt =
    typeof record?.aiPrompt === "string" && record.aiPrompt.trim().length > 0
      ? record.aiPrompt.trim()
      : null;

  return {
    templateKind,
    renderMode,
    aiPrompt
  };
}

export function humanizeLeadAutomationTemplateKind(kind: LeadAutomationTemplateKindValue) {
  return kind
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function humanizeLeadAutomationRenderMode(renderMode: LeadAutomationRenderModeValue) {
  return renderMode === "AI_ASSISTED" ? "AI-assisted" : "Static";
}
