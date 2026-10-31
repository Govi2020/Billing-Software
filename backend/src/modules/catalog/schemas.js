import { z } from 'zod';

const id = z.string().regex(/^[1-9]\d*$/);
const name = z.string().trim().min(1).max(160);
const money = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'Money must be a non-negative decimal string with at most two fractional digits.');
const rate = z.string().regex(/^\d{1,4}(?:\.\d{1,4})?$/, 'Rate must be a non-negative decimal string with at most four fractional digits.');
const list = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(200).optional(),
}).strict();

export const listSchema = list;
export const idSchema = z.object({ id });
export const taxSchema = z.object({
  name, kind: z.enum(['percentage', 'fixed']).default('percentage'),
  rate,
  is_active: z.boolean().default(true),
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'percentage' && Number(value.rate) > 100) {
    ctx.addIssue({ code: 'custom', path: ['rate'], message: 'Percentage tax cannot exceed 100.' });
  }
});
export const productSchema = z.object({
  name, type: z.enum(['service', 'software', 'add_on', 'goods']),
  sales_price: money, cost_price: money.default('0.00'), tax_id: id.nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(), is_active: z.boolean().default(true),
}).strict();
export const planSchema = z.object({
  name, price: money, billing_period: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  min_quantity: z.number().int().min(1).default(1),
  available_from: z.iso.date(), available_to: z.iso.date().nullable().optional(),
  auto_close: z.boolean().default(false), is_closable: z.boolean().default(true),
  is_pausable: z.boolean().default(false), is_renewable: z.boolean().default(true),
  is_active: z.boolean().default(true),
}).strict().refine(x => !x.available_to || x.available_to >= x.available_from, {
  path: ['available_to'], message: 'Must not precede available_from.',
});
export const paymentTermSchema = z.object({
  name, due_days: z.number().int().min(0).max(3650), is_active: z.boolean().default(true),
}).strict();
export const variantSchema = z.object({
  attribute: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(160),
  extra_price: money.default('0.00'), is_active: z.boolean().default(true),
}).strict();
export const variantPatchSchema = z.object({
  attribute: z.string().trim().min(1).max(100).optional(),
  value: z.string().trim().min(1).max(160).optional(),
  extra_price: money.optional(), is_active: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required.');
export const discountSchema = z.object({
  name, kind: z.enum(['percentage', 'fixed']),
  value: money.refine(value => Number(value) > 0, 'Must be greater than zero.'),
  scope: z.enum(['product', 'subscription']),
  min_purchase_amount: money.default(0), min_quantity: z.number().int().min(0).default(0),
  start_date: z.iso.date(), end_date: z.iso.date().nullable().optional(),
  usage_limit: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().default(true),
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'percentage' && Number(value.value) > 100) {
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'Percentage discount cannot exceed 100.' });
  }
  if (value.end_date && value.end_date < value.start_date) {
    ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'Must not precede start_date.' });
  }
});
export const templateSchema = z.object({
  name, plan_id: id, validity_days: z.number().int().positive().max(3650),
  notes: z.string().trim().max(4000).nullable().optional(), is_active: z.boolean().default(true),
}).strict();
export const templateLinesSchema = z.object({
  lines: z.array(z.object({
    product_id: id, variant_id: id.nullable().optional(),
    quantity: z.number().int().positive(), sort_order: z.number().int().default(0),
  }).strict()).max(500),
}).strict();
export const discountProductsSchema = z.object({ product_ids: z.array(id).max(500) }).strict();
export const taxPatchSchema = z.object({
  name: name.optional(), kind: z.enum(['percentage', 'fixed']).optional(),
  rate: rate.optional(),
  is_active: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required.')
  .superRefine((value, ctx) => {
    if (value.kind === 'percentage' && value.rate !== undefined && Number(value.rate) > 100) {
      ctx.addIssue({ code: 'custom', path: ['rate'], message: 'Percentage tax cannot exceed 100.' });
    }
  });
export const productPatchSchema = z.object({
  name: name.optional(), type: z.enum(['service', 'software', 'add_on', 'goods']).optional(),
  sales_price: money.optional(), cost_price: money.optional(), tax_id: id.nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(), is_active: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required.');
export const planPatchSchema = z.object({
  name: name.optional(), price: money.optional(),
  billing_period: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  min_quantity: z.number().int().min(1).optional(),
  available_from: z.iso.date().optional(), available_to: z.iso.date().nullable().optional(),
  auto_close: z.boolean().optional(), is_closable: z.boolean().optional(),
  is_pausable: z.boolean().optional(), is_renewable: z.boolean().optional(), is_active: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required.');
export const paymentTermPatchSchema = z.object({
  name: name.optional(), due_days: z.number().int().min(0).max(3650).optional(),
  is_active: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required.');
export const discountPatchSchema = z.object({
  name: name.optional(), kind: z.enum(['percentage', 'fixed']).optional(),
  value: money.refine(value => Number(value) > 0, 'Must be greater than zero.').optional(),
  scope: z.enum(['product', 'subscription']).optional(),
  min_purchase_amount: money.optional(), min_quantity: z.number().int().min(0).optional(),
  start_date: z.iso.date().optional(), end_date: z.iso.date().nullable().optional(),
  usage_limit: z.number().int().positive().nullable().optional(), is_active: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required.')
  .superRefine((value, ctx) => {
    if (value.kind === 'percentage' && value.value !== undefined && Number(value.value) > 100) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Percentage discount cannot exceed 100.' });
    }
    if (value.start_date && value.end_date && value.end_date < value.start_date) {
      ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'Must not precede start_date.' });
    }
  });
export const templatePatchSchema = z.object({
  name: name.optional(), plan_id: id.optional(),
  validity_days: z.number().int().positive().max(3650).optional(),
  notes: z.string().trim().max(4000).nullable().optional(), is_active: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required.');
