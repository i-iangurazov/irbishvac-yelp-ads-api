import { z } from "zod";

const leadAutomationChannelSchema = z.enum(["YELP_THREAD", "EMAIL"]);

export const leadAutoresponderSettingsSchema = z.object({
  isEnabled: z.boolean().default(false),
  defaultChannel: leadAutomationChannelSchema.default("YELP_THREAD")
});

export type LeadAutoresponderSettingsValues = z.infer<typeof leadAutoresponderSettingsSchema>;

export const leadAutomationTemplateFormSchema = z.object({
  name: z.string().trim().min(2).max(80),
  channel: leadAutomationChannelSchema.default("YELP_THREAD"),
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
