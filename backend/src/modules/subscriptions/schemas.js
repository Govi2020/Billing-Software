import { z } from 'zod';

const id = z.string().regex(/^[1-9]\d*$/);
const money = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/);
const line = z.object({
  productId: id, variantId: id.nullable().optional(),
  quantity: z.number().int().positive(), unitPrice: money.optional(),
  taxId: id.nullable().optional(), sortOrder: z.number().int().default(0),
}).strict();
export const createSchema = z.object({
  customerId: id, planId: id, templateId: id.nullable().optional(),
  paymentTermId: id, startDate: z.iso.date(), expiryDate: z.iso.date(),
  notes: z.string().trim().max(4000).nullable().optional(),
  lines: z.array(line).max(500).default([]),
}).strict().refine(value => value.expiryDate >= value.startDate, {
  path: ['expiryDate'], message: 'Must not precede startDate.',
});
export const idSchema = z.object({ id });
export const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['draft', 'quotation', 'confirmed', 'active', 'paused', 'closed']).optional(),
  customerId: id.optional(), planId: id.optional(), q: z.string().trim().max(200).optional(),
  startFrom: z.iso.date().optional(), startTo: z.iso.date().optional(),
  expiryFrom: z.iso.date().optional(), expiryTo: z.iso.date().optional(),
  dueFrom: z.iso.date().optional(), dueTo: z.iso.date().optional(),
}).strict().superRefine((value, ctx) => {
  for (const [from, to] of [['startFrom', 'startTo'], ['expiryFrom', 'expiryTo'], ['dueFrom', 'dueTo']]) {
    if (value[from] && value[to] && value[from] > value[to]) {
      ctx.addIssue({ code: 'custom', path: [to], message: `${to} must not precede ${from}.` });
    }
  }
});
export const transitionSchema = z.object({
  to: z.enum(['draft', 'quotation', 'confirmed', 'active', 'paused', 'closed']),
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();
export const attachDiscountSchema = z.object({ discountId: id }).strict();
export const patchSchema = z.object({
  notes: z.string().trim().max(4000).nullable().optional(),
  salespersonId: id.nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required.');
export const linesSchema = z.object({ lines: z.array(line).max(500) }).strict();
