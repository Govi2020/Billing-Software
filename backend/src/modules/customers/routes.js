import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { customerSchema, idSchema, listSchema, patchCustomerSchema } from './schemas.js';
import * as controller from './controller.js';

const router = Router();
const staffRead = (req, _res, next) => req.auth.role === 'customer'
  ? next(new AppError(403, 'FORBIDDEN', 'Staff access is required.')) : next();
function requireIfMatch(req, _res, next) {
  const value = req.get('if-match');
  if (!value || Number.isNaN(Date.parse(value))) {
    return next(new AppError(428, 'PRECONDITION_REQUIRED', 'Send the record updated_at value in If-Match.'));
  }
  req.ifMatch = value;
  next();
}
router.get('/customers', requireAuth, staffRead, validate({ query: listSchema }), controller.list);
router.post('/customers', requireAuth, requireRole('admin', 'staff'), validate({ body: customerSchema }), controller.create);
router.get('/me/customer', requireAuth, requireRole('customer'), controller.getOwn);
router.patch('/me/customer', requireAuth, requireRole('customer'), requireIfMatch, validate({ body: patchCustomerSchema }), controller.patchOwn);
router.get('/customers/:id', requireAuth, staffRead, validate({ params: idSchema }), controller.get);
router.patch('/customers/:id', requireAuth, requireRole('admin', 'staff'), requireIfMatch, validate({ params: idSchema, body: patchCustomerSchema }), controller.patch);
router.get('/customers/:id/subscriptions', requireAuth, staffRead, validate({ params: idSchema }), controller.subscriptions);
router.get('/customers/:id/invoices', requireAuth, staffRead, validate({ params: idSchema }), controller.invoices);
router.get('/customers/:id/payments', requireAuth, staffRead, validate({ params: idSchema }), controller.payments);
export default router;
