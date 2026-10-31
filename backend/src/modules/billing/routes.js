import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';

const router = Router();
const admin = [requireAuth, requireRole('admin')];
router.post('/billing/run', ...admin, controller.run);
router.get('/billing/runs', ...admin, controller.listRuns);
router.get('/billing/runs/:id', ...admin, controller.getRun);
router.get('/billing/health', ...admin, controller.health);
export default router;
