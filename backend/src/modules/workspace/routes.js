import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { getWorkspace } from './service.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  res.json({ data: await getWorkspace(req.auth.userId, req.auth.role) });
});

export default router;
