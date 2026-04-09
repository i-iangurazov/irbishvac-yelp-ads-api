export const LEAD_AUTORESPONDER_SETTING_KEY = "leadAutoresponder";

export const leadAutomationScopeModeValues = ["ALL_BUSINESSES", "SELECTED_BUSINESSES"] as const;
export type LeadAutomationScopeModeValue = (typeof leadAutomationScopeModeValues)[number];

export const leadAutomationScopeModeOptions = [
  {
    value: leadAutomationScopeModeValues[0],
    label: "All businesses",
    description: "Use the tenant default for every business that does not have its own override."
  },
  {
    value: leadAutomationScopeModeValues[1],
    label: "Selected businesses only",
    description: "Only businesses in the selected list use the tenant default. All others stay off unless they have an override."
  }
] as const;

export const approvedLeadAiModelValues = ["gpt-5-nano", "gpt-5-mini", "gpt-5.2"] as const;
export type ApprovedLeadAiModelValue = (typeof approvedLeadAiModelValues)[number];

export const approvedLeadAiModelOptions = [
  {
    value: approvedLeadAiModelValues[0],
    label: "Cheapest / test",
    description: "Lowest-cost review drafting for safe testing."
  },
  {
    value: approvedLeadAiModelValues[1],
    label: "Balanced",
    description: "Better draft quality with still-practical cost."
  },
  {
    value: approvedLeadAiModelValues[2],
    label: "Higher quality",
    description: "Best wording quality in this module, but the most expensive option here."
  }
] as const;

export const defaultLeadAiModel = approvedLeadAiModelOptions[0].value;

export const leadAutomationCadenceValues = ["INITIAL", "FOLLOW_UP_24H", "FOLLOW_UP_7D"] as const;

export const leadAutomationCadenceOptions = [
  {
    value: leadAutomationCadenceValues[0],
    label: "Initial response"
  },
  {
    value: leadAutomationCadenceValues[1],
    label: "24-hour follow-up"
  },
  {
    value: leadAutomationCadenceValues[2],
    label: "Following-week follow-up"
  }
] as const;

export const leadAutomationTemplateKinds = [
  "ACKNOWLEDGMENT",
  "REQUEST_DETAILS",
  "AFTER_HOURS",
  "CANNOT_ESTIMATE",
  "FOLLOW_UP_24H",
  "FOLLOW_UP_7D",
  "CUSTOM"
] as const;

export const leadAutomationStarterTemplates = {
  ACKNOWLEDGMENT: {
    name: "Acknowledgment",
    subject: "Automated message from {{business_name}} via Yelp",
    body:
      "Automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, thanks for reaching out about {{service_type}}. We received your Yelp message and will review it shortly. If you can share a photo, address, or a few more details here in Yelp, that will help us respond faster."
  },
  REQUEST_DETAILS: {
    name: "Request missing details",
    subject: "Automated message from {{business_name}} via Yelp",
    body:
      "Automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, thanks for your Yelp message about {{service_type}}. To help us review it, please reply here with any photos, the property type, and a short description of what is happening."
  },
  AFTER_HOURS: {
    name: "After-hours acknowledgment",
    subject: "Automated message from {{business_name}} via Yelp",
    body:
      "Automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, thanks for contacting {{business_name}} about {{service_type}}. We received your Yelp message after hours. Please reply here with any photos or details that may help, and our team will follow up during the next business window."
  },
  CANNOT_ESTIMATE: {
    name: "Cannot estimate yet",
    subject: "Automated message from {{business_name}} via Yelp",
    body:
      "Automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, thanks for reaching out about {{service_type}}. We cannot give an exact quote yet from the current details alone. Please reply here with photos, the address, and a short description of the issue so we can review the next step."
  },
  FOLLOW_UP_24H: {
    name: "24-hour follow-up",
    subject: "Automated message from {{business_name}} via Yelp",
    body:
      "Automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, following up on your Yelp request about {{service_type}}. If you still need help, please reply here with any photos, the address, and a short description of what is happening so we can review the next step in this thread."
  },
  FOLLOW_UP_7D: {
    name: "Following-week follow-up",
    subject: "Automated message from {{business_name}} via Yelp",
    body:
      "Automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, checking back on your Yelp request for {{service_type}}. If you still need help, reply here in this thread with any updated details or photos and our team can review the next step."
  }
} as const;
