import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createPlan, deactivatePlan, updatePlan } from './service.js';

const router = Router();
const planSchema = z.object({
  name: z.string().trim().min(1).max(160),
  price: z.number().finite().min(0).max(9999999999.99)
    .refine(value => value === Number(value.toFixed(2)), 'Price can have at most two decimal places.'),
  billing_period: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  min_quantity: z.number().int().min(1).max(100000),
  available_from: z.iso.date(),
  available_to: z.iso.date().nullable(),
  auto_close: z.boolean(),
  is_closable: z.boolean(),
  is_pausable: z.boolean(),
  is_renewable: z.boolean(),
}).strict().refine(
  plan => !plan.available_to || plan.available_to >= plan.available_from,
  { path: ['available_to'], message: 'Availability end date must be on or after the start date.' },
);

router.post('/', requireAuth, requireRole('admin'), validate({ body: planSchema }), async (req, res) => {
  const plan = await createPlan(req.auth.userId, req.validated.body);
  res.status(201).json({ data: plan });
});

router.patch('/:id', requireAuth, requireRole('admin'), validate({ params: z.object({ id: z.string().regex(/^[1-9]\d*$/) }), body: planSchema }), async (req, res) => {
  res.json({ data: await updatePlan(req.auth.userId, req.validated.params.id, req.validated.body) });
});

router.post('/:id/deactivate', requireAuth, requireRole('admin'), validate({ params: z.object({ id: z.string().regex(/^[1-9]\d*$/) }) }), async (req, res) => {
  res.json({ data: await deactivatePlan(req.auth.userId, req.validated.params.id) });
});

export default router;
