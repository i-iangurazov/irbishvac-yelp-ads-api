import { z } from "zod";

function isValidTimeZone(value: string) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function parseRecipientEmails(input: string) {
  return [...new Set(input
    .split(/[\n,;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean))];
}

const locationRecipientOverrideFormSchema = z.object({
  locationId: z.string().trim().min(1, "Pick a location for each override."),
  recipientEmails: z.string().trim().min(1, "Add at least one override recipient.")
});

export const reportScheduleFormSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    cadence: z.enum(["WEEKLY", "MONTHLY"]),
    deliveryScope: z.enum(["ACCOUNT_ONLY", "LOCATION_ONLY", "ACCOUNT_AND_LOCATION"]).default("ACCOUNT_ONLY"),
    timezone: z.string().trim().min(1).refine(isValidTimeZone, "Enter a valid IANA timezone, for example America/Los_Angeles."),
    sendDayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
    sendDayOfMonth: z.coerce.number().int().min(1).max(31).optional(),
    sendHour: z.coerce.number().int().min(0).max(23),
    sendMinute: z.coerce.number().int().min(0).max(59).default(0),
    deliverPerLocation: z.boolean().default(false),
    isEnabled: z.boolean().default(true),
    recipientEmails: z.string().trim().min(1, "Add at least one default recipient email."),
    locationRecipientOverrides: z.array(locationRecipientOverrideFormSchema).default([])
  })
  .superRefine((value, ctx) => {
    if (value.cadence === "WEEKLY" && typeof value.sendDayOfWeek !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sendDayOfWeek"],
        message: "Pick a weekday for weekly schedules."
      });
    }

    if (value.cadence === "MONTHLY" && typeof value.sendDayOfMonth !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sendDayOfMonth"],
        message: "Pick a day of month for monthly schedules."
      });
    }

    const recipients = parseRecipientEmails(value.recipientEmails);

    if (recipients.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recipientEmails"],
        message: "Add at least one recipient email."
      });
    }

    for (const recipient of recipients) {
      if (!z.string().email().safeParse(recipient).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["recipientEmails"],
          message: `Invalid email: ${recipient}`
        });
        break;
      }
    }

    const seenLocationIds = new Set<string>();

    for (let index = 0; index < value.locationRecipientOverrides.length; index += 1) {
      const override = value.locationRecipientOverrides[index];
      const overrideRecipients = parseRecipientEmails(override.recipientEmails);

      if (seenLocationIds.has(override.locationId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["locationRecipientOverrides", index, "locationId"],
          message: "Only one override is allowed per location."
        });
      }

      seenLocationIds.add(override.locationId);

      if (overrideRecipients.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["locationRecipientOverrides", index, "recipientEmails"],
          message: "Add at least one override recipient."
        });
      }

      for (const recipient of overrideRecipients) {
        if (!z.string().email().safeParse(recipient).success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["locationRecipientOverrides", index, "recipientEmails"],
            message: `Invalid email: ${recipient}`
          });
          break;
        }
      }
    }
  });

export type ReportScheduleFormValues = z.infer<typeof reportScheduleFormSchema>;

export const manualReportScheduleActionSchema = z.object({
  force: z.boolean().default(false)
});
