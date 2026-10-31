import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as controller from './controller.js';

const router = Router();
const staff = [requireAuth, requireRole('admin', 'staff')];
router.get('/reports/dashboard', ...staff, controller.dashboard);
router.get('/reports/active-subscriptions', ...staff, controller.activeSubscriptions);
router.get('/reports/revenue', ...staff, controller.revenue);
router.get('/reports/overdue', ...staff, controller.overdue);
router.get('/reports/outstanding-aging', ...staff, controller.aging);
router.get('/reports/mrr-trend', ...staff, controller.mrrTrend);
router.get('/reports/churn', ...staff, controller.churn);
router.get('/audit-log', requireAuth, requireRole('admin'), controller.auditLog);
export default router;
