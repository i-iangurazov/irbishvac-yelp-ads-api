import "server-only";

import { z } from "zod";

const serviceTitanIdSchema = z.union([z.string(), z.number()]).transform((value) => String(value));

export const serviceTitanTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.coerce.number().positive().default(900),
  token_type: z.string().default("Bearer")
});

export const serviceTitanBusinessUnitSchema = z
  .object({
    id: serviceTitanIdSchema,
    name: z.string().min(1),
    active: z.boolean().optional(),
    code: z.string().optional().nullable()
  })
  .passthrough();

export const serviceTitanCategorySchema = z
  .object({
    id: serviceTitanIdSchema,
    name: z.string().min(1),
    active: z.boolean().optional()
  })
  .passthrough();

export const serviceTitanEmployeesProbeSchema = z
  .object({
    id: serviceTitanIdSchema.optional(),
    name: z.string().optional()
  })
  .passthrough();

export const serviceTitanLeadSchema = z
  .object({
    id: serviceTitanIdSchema,
    status: z.string().optional().nullable(),
    createdOn: z.string().optional().nullable(),
    modifiedOn: z.string().optional().nullable(),
    customerName: z.string().optional().nullable(),
    summary: z.string().optional().nullable(),
    businessUnitId: serviceTitanIdSchema.optional().nullable(),
    jobId: serviceTitanIdSchema.optional().nullable()
  })
  .passthrough();

export const serviceTitanJobSchema = z
  .object({
    id: serviceTitanIdSchema,
    status: z.string().optional().nullable(),
    createdOn: z.string().optional().nullable(),
    modifiedOn: z.string().optional().nullable(),
    completedOn: z.string().optional().nullable(),
    canceledOn: z.string().optional().nullable(),
    businessUnitId: serviceTitanIdSchema.optional().nullable(),
    leadId: serviceTitanIdSchema.optional().nullable()
  })
  .passthrough();

export const serviceTitanAppointmentSchema = z
  .object({
    id: serviceTitanIdSchema,
    jobId: serviceTitanIdSchema.optional().nullable(),
    status: z.string().optional().nullable(),
    createdOn: z.string().optional().nullable(),
    modifiedOn: z.string().optional().nullable(),
    startsOn: z.string().optional().nullable(),
    dispatchedOn: z.string().optional().nullable(),
    arrivedOn: z.string().optional().nullable(),
    completedOn: z.string().optional().nullable(),
    canceledOn: z.string().optional().nullable()
  })
  .passthrough();

export function createServiceTitanPagedResponseSchema<TItem extends z.ZodTypeAny>(itemSchema: TItem) {
  return z
    .object({
      page: z.coerce.number().optional(),
      pageSize: z.coerce.number().optional(),
      totalCount: z.coerce.number().optional(),
      hasMore: z.boolean().optional(),
      data: z.array(itemSchema)
    })
    .passthrough();
}
