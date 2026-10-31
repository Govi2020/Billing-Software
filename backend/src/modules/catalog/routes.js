import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  discountPatchSchema, discountProductsSchema, discountSchema, idSchema, listSchema,
  paymentTermPatchSchema, paymentTermSchema, planPatchSchema, planSchema, productPatchSchema,
  productSchema, taxPatchSchema, taxSchema, templateLinesSchema, templatePatchSchema, templateSchema,
  variantPatchSchema, variantSchema,
} from './schemas.js';
import * as controller from './controller.js';

const router = Router();
const read = (req, _res, next) => req.auth.role === 'customer'
  ? next(new AppError(403, 'FORBIDDEN', 'You do not have permission to access the catalog.')) : next();
const write = requireRole('admin');
function requireIfMatch(req, _res, next) {
  const value = req.get('if-match');
  if (!value || Number.isNaN(Date.parse(value))) {
    return next(new AppError(428, 'PRECONDITION_REQUIRED', 'Send the record updated_at value in If-Match.'));
  }
  req.ifMatch = value;
  next();
}
const resource = (path, schema, patchSchema) => {
  router.get(`/${path}`, requireAuth, read, validate({ query: listSchema }), (req, res) => controller.list(path, req, res));
  router.post(`/${path}`, requireAuth, write, validate({ body: schema }), (req, res) => controller.create(path, req, res));
  router.patch(`/${path}/:id`, requireAuth, write, requireIfMatch, validate({ params: idSchema, body: patchSchema }), (req, res) => controller.update(path, req, res));
};
resource('taxes', taxSchema, taxPatchSchema);
resource('products', productSchema, productPatchSchema);
resource('plans', planSchema, planPatchSchema);
resource('payment-terms', paymentTermSchema, paymentTermPatchSchema);

router.get('/products/:id/variants', requireAuth, read, validate({ params: idSchema }), controller.listVariants);
router.get('/products/:id', requireAuth, read, validate({ params: idSchema }), controller.getProduct);
router.post('/products/:id/variants', requireAuth, write, validate({ params: idSchema, body: variantSchema }), controller.createVariant);
router.patch('/products/:id/variants/:variantId', requireAuth, write, requireIfMatch, validate({
  params: zodVariantParams(), body: variantPatchSchema,
}), controller.updateVariant);
router.post('/products/:id/deactivate', requireAuth, write, requireIfMatch, validate({ params: idSchema }), controller.deactivateProduct);
router.post('/plans/:id/deactivate', requireAuth, write, requireIfMatch, validate({ params: idSchema }), controller.deactivatePlan);
router.get('/discounts', requireAuth, read, validate({ query: listSchema }), controller.listDiscounts);
router.post('/discounts', requireAuth, write, validate({ body: discountSchema }), controller.createDiscount);
router.patch('/discounts/:id', requireAuth, write, requireIfMatch, validate({ params: idSchema, body: discountPatchSchema }), controller.updateDiscount);
router.post('/discounts/:id/deactivate', requireAuth, write, requireIfMatch, validate({ params: idSchema }), controller.deactivateDiscount);
router.put('/discounts/:id/products', requireAuth, write, requireIfMatch, validate({ params: idSchema, body: discountProductsSchema }), controller.setDiscountProducts);
router.get('/discounts/:id/redemptions', requireAuth, read, validate({ params: idSchema, query: listSchema }), controller.listRedemptions);
router.get('/quotation-templates', requireAuth, read, validate({ query: listSchema }), controller.listTemplates);
router.post('/quotation-templates', requireAuth, write, validate({ body: templateSchema }), controller.createTemplate);
router.get('/quotation-templates/:id', requireAuth, read, validate({ params: idSchema }), controller.getTemplate);
router.patch('/quotation-templates/:id', requireAuth, write, requireIfMatch, validate({ params: idSchema, body: templatePatchSchema }), controller.updateTemplate);
router.put('/quotation-templates/:id/lines', requireAuth, write, requireIfMatch, validate({ params: idSchema, body: templateLinesSchema }), controller.setTemplateLines);
router.post('/quotation-templates/:id/deactivate', requireAuth, write, requireIfMatch, validate({ params: idSchema }), controller.deactivateTemplate);

function zodVariantParams() {
  return idSchema.extend({ variantId: idSchema.shape.id });
}

export default router;
