import { z } from "zod";

export const onboardingActivationSchema = z
  .object({
    businessId: z.string().min(1),
    action: z.enum([
      "CHECK",
      "ACTIVATE",
      "PAUSE",
      "EMERGENCY_DISABLE",
      "CLEAR_EMERGENCY",
    ]),
    confirmation: z.string().max(120).optional(),
  })
  .superRefine((value, context) => {
    const expected =
      value.action === "ACTIVATE"
        ? "ACTIVATE REVIEW ONLY"
        : value.action === "EMERGENCY_DISABLE"
          ? "EMERGENCY DISABLE"
          : value.action === "CLEAR_EMERGENCY"
            ? "CLEAR EMERGENCY DISABLE"
            : null;

    if (expected && value.confirmation !== expected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmation"],
        message: `Enter ${expected} to confirm this action.`,
      });
    }
  });

export const tenantOnboardingCreateSchema = z.object({
  tenantName: z.string().trim().min(2).max(120),
  tenantSlug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  clientAdminName: z.string().trim().min(2).max(120),
  clientAdminEmail: z.string().trim().email().max(255),
  temporaryPassword: z.string().min(12).max(128),
});
