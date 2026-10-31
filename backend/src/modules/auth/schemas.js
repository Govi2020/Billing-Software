import { z } from 'zod';

const email = z.string().trim().email().max(254);
const password = z.string().min(1).max(128);
const fullName = z.string().trim().min(1).max(160);
const positiveId = z.string().regex(/^[1-9]\d*$/);

export const signupSchema = z.object({ full_name: fullName, email, password }).strict();
export const loginSchema = z.object({ email, password }).strict();
export const emailSchema = z.object({ email }).strict();
export const resetSchema = z.object({ token: z.string().min(32), newPassword: password }).strict();
export const changePasswordSchema = z.object({ currentPassword: password, newPassword: password }).strict();
export const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(200).optional(),
}).strict();
export const userIdSchema = z.object({ id: positiveId });
export const createStaffSchema = z.object({ full_name: fullName, email }).strict();
export const patchUserSchema = z.object({
  full_name: fullName.optional(),
  email: email.optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required.');
