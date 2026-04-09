import { z } from "zod";

import {
  leadAutomationCadenceValues,
  approvedLeadAiModelValues,
  defaultLeadAiModel,
  leadAutomationTemplateKinds,
  leadAutomationScopeModeValues
} from "@/features/autoresponder/constants";

const leadAutomationChannelSchema = z.enum(["YELP_THREAD", "EMAIL"]);
const leadAiModelSchema = z.enum(approvedLeadAiModelValues);
const leadAutomationTemplateKindSchema = z.enum(leadAutomationTemplateKinds);
const leadAutomationCadenceSchema = z.enum(leadAutomationCadenceValues);
const leadAutomationScopeModeSchema = z.enum(leadAutomationScopeModeValues);
const followUp24hDelaySchema = z.coerce.number().int().min(12).max(48);
const followUp7dDelaySchema = z.coerce.number().int().min(5).max(10);

export const leadAutoresponderSettingsSchema = z.object({
  isEnabled: z.boolean().default(false),
  scopeMode: leadAutomationScopeModeSchema.default("ALL_BUSINESSES"),
  scopedBusinessIds: z.array(z.string().min(1)).default([]),
  defaultChannel: leadAutomationChannelSchema.default("YELP_THREAD"),
  emailFallbackEnabled: z.boolean().default(true),
  followUp24hEnabled: z.boolean().default(false),
  followUp24hDelayHours: followUp24hDelaySchema.default(24),
  followUp7dEnabled: z.boolean().default(false),
  followUp7dDelayDays: followUp7dDelaySchema.default(7),
  aiAssistEnabled: z.boolean().default(true),
  aiModel: leadAiModelSchema.default(defaultLeadAiModel)
});

export type LeadAutoresponderSettingsValues = z.infer<typeof leadAutoresponderSettingsSchema>;

export const leadAutoresponderBusinessOverrideSchema = z.object({
  businessId: z.string().min(1),
  isEnabled: z.boolean().default(true),
  defaultChannel: leadAutomationChannelSchema.default("YELP_THREAD"),
  emailFallbackEnabled: z.boolean().default(true),
  followUp24hEnabled: z.boolean().default(false),
  followUp24hDelayHours: followUp24hDelaySchema.default(24),
  followUp7dEnabled: z.boolean().default(false),
  followUp7dDelayDays: followUp7dDelaySchema.default(7),
  aiAssistEnabled: z.boolean().default(true),
  aiModel: leadAiModelSchema.default(defaultLeadAiModel)
});

export type LeadAutoresponderBusinessOverrideValues = z.infer<typeof leadAutoresponderBusinessOverrideSchema>;

export const leadAutomationTemplateFormSchema = z.object({
  name: z.string().trim().min(2).max(80),
  businessId: z.string().optional().or(z.literal("")),
  channel: leadAutomationChannelSchema.default("YELP_THREAD"),
  templateKind: leadAutomationTemplateKindSchema.default("ACKNOWLEDGMENT"),
  isEnabled: z.boolean().default(true),
  subjectTemplate: z.string().trim().max(200).optional().or(z.literal("")),
  bodyTemplate: z.string().trim().min(10).max(5000)
});

export type LeadAutomationTemplateFormValues = z.infer<typeof leadAutomationTemplateFormSchema>;

const minuteSchema = z.coerce.number().int().min(0).max(1439);

export const leadAutomationRuleFormSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    templateId: z.string().min(1),
    businessId: z.string().optional().or(z.literal("")),
    cadence: leadAutomationCadenceSchema.default("INITIAL"),
    channel: leadAutomationChannelSchema.default("YELP_THREAD"),
    isEnabled: z.boolean().default(true),
    priority: z.coerce.number().int().min(0).max(999).default(100),
    locationId: z.string().optional().or(z.literal("")),
    serviceCategoryId: z.string().optional().or(z.literal("")),
    onlyDuringWorkingHours: z.boolean().default(false),
    timezone: z.string().trim().optional().or(z.literal("")),
    workingDays: z.array(z.coerce.number().int().min(0).max(6)).min(1).default([1, 2, 3, 4, 5]),
    startMinute: minuteSchema.optional(),
    endMinute: minuteSchema.optional()
  })
  .superRefine((value, context) => {
    if (!value.onlyDuringWorkingHours) {
      return;
    }

    if (!value.timezone) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["timezone"],
        message: "Timezone is required when working-hours gating is enabled."
      });
    }

    if (value.startMinute === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startMinute"],
        message: "Start minute is required when working-hours gating is enabled."
      });
    }

    if (value.endMinute === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endMinute"],
        message: "End minute is required when working-hours gating is enabled."
      });
    }

    if (
      value.startMinute !== undefined &&
      value.endMinute !== undefined &&
      value.endMinute <= value.startMinute
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endMinute"],
        message: "End minute must be later than start minute."
      });
    }
  });

export type LeadAutomationRuleFormValues = z.infer<typeof leadAutomationRuleFormSchema>;
