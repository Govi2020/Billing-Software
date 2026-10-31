import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';

const router = Router();
const staff = (req, _res, next) => req.auth.role === 'customer'
  ? next(new AppError(403, 'FORBIDDEN', 'Staff access is required.')) : next();
router.get('/invoices', requireAuth, staff, controller.listInvoices);
router.get('/invoices/:id', requireAuth, controller.getInvoice);
router.post('/invoices/:id/confirm', requireAuth, requireRole('admin', 'staff'), controller.confirmInvoice);
router.post('/invoices/:id/send', requireAuth, requireRole('admin', 'staff'), controller.sendInvoice);
router.post('/invoices/:id/cancel', requireAuth, requireRole('admin', 'staff'), controller.cancelInvoice);
router.post('/invoices/:id/reissue', requireAuth, requireRole('admin', 'staff'), controller.reissueInvoice);
router.get('/invoices/:id/pdf', requireAuth, controller.invoicePdf);
router.post('/invoices/:id/payments', requireAuth, requireRole('admin', 'staff'), controller.createPayment);
router.get('/payments', requireAuth, staff, controller.listPayments);
router.delete('/payments/:id', requireAuth, requireRole('admin'), controller.deletePayment);
router.get('/me/invoices', requireAuth, requireRole('customer'), controller.listOwnInvoices);
router.get('/me/invoices/:id', requireAuth, requireRole('customer'), controller.getOwnInvoice);
router.get('/me/invoices/:id/pdf', requireAuth, requireRole('customer'), controller.invoicePdf);
router.get('/me/payments', requireAuth, requireRole('customer'), controller.listOwnPayments);
export default router;
