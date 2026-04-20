export const LEAD_AUTORESPONDER_SETTING_KEY = "leadAutoresponder";

export const leadAutomationScopeModeValues = ["ALL_BUSINESSES", "SELECTED_BUSINESSES"] as const;
export type LeadAutomationScopeModeValue = (typeof leadAutomationScopeModeValues)[number];

export const leadConversationAutomationModeValues = [
  "REVIEW_ONLY",
  "BOUNDED_AUTO_REPLY",
  "HUMAN_HANDOFF"
] as const;
export type LeadConversationAutomationModeValue = (typeof leadConversationAutomationModeValues)[number];

export const leadConversationAutomationModeOptions = [
  {
    value: leadConversationAutomationModeValues[0],
    label: "Review-only",
    description: "Generate a suggested reply, but require a person to review and send it."
  },
  {
    value: leadConversationAutomationModeValues[1],
    label: "Bounded auto-reply",
    description: "Auto-send only for approved low-risk intents. Everything else stops or falls back."
  },
  {
    value: leadConversationAutomationModeValues[2],
    label: "Human handoff",
    description: "Do not auto-send. Route new inbound conversation turns to a person."
  }
] as const;

export const leadConversationIntentValues = [
  "MISSING_DETAILS_PROVIDED",
  "BASIC_ACKNOWLEDGMENT",
  "SIMPLE_NEXT_STEP_CLARIFICATION",
  "BOOKING_INTENT",
  "QUOTE_PRICING_REQUEST",
  "AVAILABILITY_TIMING_REQUEST",
  "COMPLAINT_ESCALATION",
  "UNSUPPORTED_AMBIGUOUS",
  "HUMAN_ONLY"
] as const;
export type LeadConversationIntentValue = (typeof leadConversationIntentValues)[number];

export const leadConversationIntentOptions = [
  {
    value: leadConversationIntentValues[0],
    label: "Missing details provided",
    description: "Customer replied with photos, address, symptoms, or other useful details."
  },
  {
    value: leadConversationIntentValues[1],
    label: "Basic acknowledgment",
    description: "Simple thank-you or confirmation that does not need risky business claims."
  },
  {
    value: leadConversationIntentValues[2],
    label: "Simple clarification",
    description: "Safe next-step clarification without pricing or scheduling promises."
  },
  {
    value: leadConversationIntentValues[3],
    label: "Booking intent",
    description: "Customer wants to book or move forward, but the business should usually review."
  },
  {
    value: leadConversationIntentValues[4],
    label: "Quote or pricing",
    description: "Price, estimate, or quote request. Keep this out of auto-send."
  },
  {
    value: leadConversationIntentValues[5],
    label: "Availability or timing",
    description: "Arrival, scheduling window, or availability request. Keep this out of auto-send."
  },
  {
    value: leadConversationIntentValues[6],
    label: "Complaint or escalation",
    description: "Upset or frustrated customer. Always hand this to a person."
  },
  {
    value: leadConversationIntentValues[7],
    label: "Unsupported or ambiguous",
    description: "Low-confidence or unclear request that needs a person."
  },
  {
    value: leadConversationIntentValues[8],
    label: "Human-only",
    description: "Policy or context requires a person."
  }
] as const;

export const leadConversationAutoReplyIntentDefaults = [
  "MISSING_DETAILS_PROVIDED",
  "BASIC_ACKNOWLEDGMENT",
  "SIMPLE_NEXT_STEP_CLARIFICATION"
] as const satisfies ReadonlyArray<LeadConversationIntentValue>;

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

export const leadAutomationRenderModeValues = ["STATIC", "AI_ASSISTED"] as const;
export type LeadAutomationRenderModeValue = (typeof leadAutomationRenderModeValues)[number];

export const leadAutomationRenderModeOptions = [
  {
    value: leadAutomationRenderModeValues[0],
    label: "Static",
    description: "Send the saved template message exactly as written."
  },
  {
    value: leadAutomationRenderModeValues[1],
    label: "AI-assisted",
    description: "Use AI guidance to draft the message, with the saved template as the fallback."
  }
] as const;

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
  "RECEIVED_UPDATE",
  "BOOKING_NEXT_STEP",
  "AFTER_HOURS",
  "CANNOT_ESTIMATE",
  "FOLLOW_UP_24H",
  "FOLLOW_UP_7D",
  "CUSTOM"
] as const;

export const leadAutomationStarterTemplates = {
  ACKNOWLEDGMENT: {
    name: "Acknowledgment",
    subject: "Irbishvac automated message from {{business_name}} via Yelp",
    body:
      "Irbishvac automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, thanks for reaching out about {{service_type}}. We received your Yelp message and will review it shortly. If you can share a photo, address, or a few more details here in Yelp, that will help us respond faster.",
    aiPrompt:
      "Write a short first-response Yelp thread message. Acknowledge the request, mention the service if supported by context, ask for one concrete next detail such as photos, address, or issue description, and keep the tone helpful but restrained."
  },
  REQUEST_DETAILS: {
    name: "Request missing details",
    subject: "Irbishvac automated message from {{business_name}} via Yelp",
    body:
      "Irbishvac automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, thanks for your Yelp message about {{service_type}}. To help us review it, please reply here with any photos, the property type, and a short description of what is happening.",
    aiPrompt:
      "Write a short Yelp thread reply that asks for missing details. Be explicit that more information is needed before giving a useful answer. Ask for photos, address, property type, and a short description, but do not overload the message."
  },
  RECEIVED_UPDATE: {
    name: "Received customer update",
    subject: "Irbishvac automated message from {{business_name}} via Yelp",
    body:
      "Irbishvac automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, thanks for the update about {{service_type}}. We received the new details in Yelp and will review the next step. If there is anything else that may help, feel free to add it here in the thread.",
    aiPrompt:
      "Write a short Yelp thread reply confirming that the customer's update was received. Stay concise, thank them for the added detail, avoid promises, and invite one more helpful detail only if it is clearly useful."
  },
  BOOKING_NEXT_STEP: {
    name: "Booking next step",
    subject: "Irbishvac automated message from {{business_name}} via Yelp",
    body:
      "Irbishvac automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, thanks for the update about {{service_type}}. We received your message in Yelp. Please reply here with any preferred timing or anything else that may help our team review the next step.",
    aiPrompt:
      "Write a short Yelp thread reply for a booking-intent message. Acknowledge that the customer wants to move forward, ask for one safe next detail such as preferred timing, and avoid promising availability or arrival windows."
  },
  AFTER_HOURS: {
    name: "After-hours acknowledgment",
    subject: "Irbishvac automated message from {{business_name}} via Yelp",
    body:
      "Irbishvac automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, thanks for contacting {{business_name}} about {{service_type}}. We received your Yelp message after hours. Please reply here with any photos or details that may help, and our team will follow up during the next business window.",
    aiPrompt:
      "Write a short after-hours Yelp thread acknowledgment. Make it clear the team will follow up in the next business window, ask for useful details in-thread, and avoid sounding like a live agent is present right now."
  },
  CANNOT_ESTIMATE: {
    name: "Cannot estimate yet",
    subject: "Irbishvac automated message from {{business_name}} via Yelp",
    body:
      "Irbishvac automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, thanks for reaching out about {{service_type}}. We cannot give an exact quote yet from the current details alone. Please reply here with photos, the address, and a short description of the issue so we can review the next step.",
    aiPrompt:
      "Write a short Yelp thread message for a no-estimate-yet case. Clearly say an exact quote is not available yet, explain what information is still needed, and ask for the next specific step in the Yelp thread."
  },
  FOLLOW_UP_24H: {
    name: "24-hour follow-up",
    subject: "Irbishvac automated message from {{business_name}} via Yelp",
    body:
      "Irbishvac automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, following up on your Yelp request about {{service_type}}. If you still need help, please reply here with any photos, the address, and a short description of what is happening so we can review the next step in this thread.",
    aiPrompt:
      "Write a short 24-hour Yelp thread follow-up for a customer who has not replied yet. Be polite, not pushy, and ask for one clear next step or missing detail in the same thread."
  },
  FOLLOW_UP_7D: {
    name: "Following-week follow-up",
    subject: "Irbishvac automated message from {{business_name}} via Yelp",
    body:
      "Irbishvac automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, checking back on your Yelp request for {{service_type}}. If you still need help, reply here in this thread with any updated details or photos and our team can review the next step.",
    aiPrompt:
      "Write a short following-week Yelp thread follow-up for a customer who still has not replied. Keep it calm, brief, and easy to ignore if they no longer need help. Ask for updated details only if they still want assistance."
  }
} as const;
