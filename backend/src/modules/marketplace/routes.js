import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { requestSubscription } from './service.js';

const router = Router();
const planParams = z.object({ id: z.string().regex(/^[1-9]\d*$/) }).strict();

router.post('/plans/:id/subscribe', requireAuth, requireRole('customer'), validate({ params: planParams }), async (req, res) => {
  const result = await requestSubscription(req.auth.userId, req.validated.params.id);
  res.status(201).json({ data: result });
});

export default router;
