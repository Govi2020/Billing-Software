import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  attachDiscountSchema, createSchema, idSchema, linesSchema, listSchema, patchSchema, transitionSchema,
} from './schemas.js';
import * as controller from './controller.js';

const router = Router();
const staff = (req, _res, next) => req.auth.role === 'customer'
  ? next(new AppError(403, 'FORBIDDEN', 'Staff access is required.')) : next();
function requireIfMatch(req, _res, next) {
  const value = req.get('if-match');
  if (!value || Number.isNaN(Date.parse(value))) {
    return next(new AppError(428, 'PRECONDITION_REQUIRED', 'Send the record updated_at value in If-Match.'));
  }
  req.ifMatch = value;
  next();
}
router.get('/subscriptions', requireAuth, staff, validate({ query: listSchema }), controller.list);
router.post('/subscriptions', requireAuth, requireRole('admin', 'staff'), validate({ body: createSchema }), controller.create);
router.get('/subscriptions/:id', requireAuth, staff, validate({ params: idSchema }), controller.get);
router.patch('/subscriptions/:id', requireAuth, requireRole('admin', 'staff'), requireIfMatch, validate({ params: idSchema, body: patchSchema }), controller.patch);
router.put('/subscriptions/:id/lines', requireAuth, requireRole('admin', 'staff'), requireIfMatch, validate({ params: idSchema, body: linesSchema }), controller.replaceLines);
router.post('/subscriptions/:id/transition', requireAuth, requireRole('admin', 'staff'), requireIfMatch, validate({ params: idSchema, body: transitionSchema }), controller.transition);
router.get('/subscriptions/:id/invoice-preview', requireAuth, requireRole('admin', 'staff'), validate({ params: idSchema }), controller.invoicePreview);
router.post('/subscriptions/:id/invoices', requireAuth, requireRole('admin', 'staff'), validate({ params: idSchema }), controller.generateInvoice);
router.get('/me/subscriptions', requireAuth, requireRole('customer'), controller.listOwn);
router.get('/me/subscriptions/:id', requireAuth, requireRole('customer'), validate({ params: idSchema }), controller.getOwn);
router.post('/subscriptions/:id/renew', requireAuth, requireRole('admin', 'staff'), validate({ params: idSchema }), controller.renew);
router.post('/subscriptions/:id/discounts', requireAuth, requireRole('admin', 'staff'), validate({ params: idSchema, body: attachDiscountSchema }), controller.attachDiscount);
router.delete('/subscriptions/:id/discounts/:discountId', requireAuth, requireRole('admin', 'staff'), validate({ params: idSchema.extend({ discountId: idSchema.shape.id }) }), controller.detachDiscount);
router.get('/subscriptions/:id/eligible-discounts', requireAuth, staff, validate({ params: idSchema }), controller.eligibleDiscounts);
router.post('/me/subscriptions/:id/accept', requireAuth, requireRole('customer'), validate({ params: idSchema }), controller.portalAccept);
router.post('/me/subscriptions/:id/pause', requireAuth, requireRole('customer'), validate({ params: idSchema }), controller.portalPause);
router.post('/me/subscriptions/:id/resume', requireAuth, requireRole('customer'), validate({ params: idSchema }), controller.portalResume);
router.post('/me/subscriptions/:id/close', requireAuth, requireRole('customer'), validate({ params: idSchema }), controller.portalClose);
router.post('/me/subscriptions/:id/renew', requireAuth, requireRole('customer'), validate({ params: idSchema }), controller.portalRenew);
export default router;
