import { z } from 'zod';

const id = z.string().regex(/^[1-9]\d*$/);
const text = max => z.string().trim().max(max).nullable().optional();
export const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(200).optional(),
}).strict();
export const idSchema = z.object({ id });
export const customerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  company_name: text(200),
  email: z.string().trim().email().max(254),
  phone: text(40),
  tax_number: text(80),
  address_line1: text(200),
  address_line2: text(200),
  city: text(100),
  state: text(100),
  postal_code: text(30),
  country: z.string().trim().length(2).default('IN'),
}).strict();
export const patchCustomerSchema = customerSchema.partial().strict()
  .refine(value => Object.keys(value).length > 0, 'At least one field is required.');
