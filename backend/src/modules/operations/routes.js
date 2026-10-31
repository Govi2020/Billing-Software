import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  confirmQuotation,
  deactivateCatalogRecord,
  createDiscount,
  createProduct,
  createTax,
  manageSubscription,
  createCustomer,
  createQuotation,
  recordPayment,
  updateProduct,
  updateDiscount,
  updateTax,
  updateCustomerProfile,
} from './service.js';
import {
  cancelInvoice,
  confirmInvoice,
  createProductVariant,
  deactivateQuotationTemplate,
  emailInvoice,
  getInvoiceDetails,
  getSubscriptionDetails,
  listQuotationTemplates,
  renewSubscription,
  replaceSubscriptionLines,
  saveQuotationTemplate,
  updateProductVariant,
} from './workflows.js';

const router = Router();
const idParams = z.object({ id: z.string().regex(/^[1-9]\d*$/) }).strict();
const customerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(254),
  company_name: z.string().trim().max(160).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
}).strict();
const profileSchema = z.object({
  name: z.string().trim().min(1).max(160),
  company_name: z.string().trim().max(160).nullable(),
  phone: z.string().trim().max(40).nullable(),
  address_line1: z.string().trim().max(200).nullable(),
  address_line2: z.string().trim().max(200).nullable(),
  city: z.string().trim().max(100).nullable(),
  state: z.string().trim().max(100).nullable(),
  postal_code: z.string().trim().max(20).nullable(),
  country: z.string().trim().min(2).max(2),
}).strict();
const quotationSchema = z.object({
  customer_id: z.string().regex(/^[1-9]\d*$/),
  plan_id: z.string().regex(/^[1-9]\d*$/),
  template_id: z.string().regex(/^[1-9]\d*$/).nullable().optional(),
}).strict();
const subscriptionLineSchema = z.object({
  product_id: z.string().regex(/^[1-9]\d*$/),
  variant_id: z.string().regex(/^[1-9]\d*$/).nullable().optional(),
  quantity: z.number().int().min(1).max(100000),
});
const linesSchema = z.object({ lines: z.array(subscriptionLineSchema).min(1).max(100) }).strict();
const money = z.number().finite().min(0).max(9999999999.99)
  .refine(value => value === Number(value.toFixed(2)), 'Amount can have at most two decimal places.');
const templateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  plan_id: z.string().regex(/^[1-9]\d*$/),
  validity_days: z.number().int().min(1).max(365),
  notes: z.string().trim().max(2000).nullable(),
  lines: z.array(subscriptionLineSchema).min(1).max(100),
}).strict();
const variantSchema = z.object({
  attribute: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(120),
  extra_price: money,
  is_active: z.boolean().optional(),
}).strict();
const cancelInvoiceSchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict();
const paymentSchema = z.object({
  method: z.enum(['cash', 'card', 'bank_transfer', 'upi', 'cheque', 'other']),
  amount: z.number().finite().positive().max(9999999999.99)
    .refine(value => value === Number(value.toFixed(2)), 'Amount can have at most two decimal places.'),
  payment_date: z.iso.date(),
  reference: z.string().trim().max(200).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
}).strict();
const subscriptionActionSchema = z.object({
  action: z.enum(['pause', 'resume', 'close']),
}).strict();
const catalogTypeParams = z.object({
  type: z.enum(['products', 'taxes', 'discounts']),
  id: z.string().regex(/^[1-9]\d*$/),
}).strict();
const productSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.enum(['service', 'software', 'add_on', 'goods']),
  sales_price: money,
  cost_price: money,
  tax_id: z.string().regex(/^[1-9]\d*$/).nullable(),
  notes: z.string().trim().max(2000).nullable(),
}).strict();
const taxSchema = z.object({
  name: z.string().trim().min(1).max(160),
  kind: z.enum(['percentage', 'fixed']),
  rate: z.number().finite().min(0).max(9999.9999)
    .refine(value => value === Number(value.toFixed(4)), 'Rate can have at most four decimal places.'),
}).strict().refine(value => value.kind !== 'percentage' || value.rate <= 100, {
  path: ['rate'],
  message: 'Percentage tax cannot exceed 100.',
});
const discountSchema = z.object({
  name: z.string().trim().min(1).max(160),
  kind: z.enum(['percentage', 'fixed']),
  value: z.number().finite().positive().max(9999999999.99)
    .refine(value => value === Number(value.toFixed(2)), 'Discount value can have at most two decimal places.'),
  scope: z.enum(['product', 'subscription']),
  product_ids: z.array(z.string().regex(/^[1-9]\d*$/)).max(100),
  min_purchase_amount: money,
  min_quantity: z.number().int().min(0).max(100000),
  start_date: z.iso.date(),
  end_date: z.iso.date().nullable(),
  usage_limit: z.number().int().positive().nullable(),
}).strict()
  .refine(value => value.kind !== 'percentage' || value.value <= 100, {
    path: ['value'],
    message: 'Percentage discount cannot exceed 100.',
  })
  .refine(value => value.scope !== 'product' || value.product_ids.length > 0, {
    path: ['product_ids'],
    message: 'Select at least one product for a product discount.',
  })
  .refine(value => !value.end_date || value.end_date >= value.start_date, {
    path: ['end_date'],
    message: 'End date must be on or after the start date.',
  });

router.post('/customers', requireAuth, requireRole('admin', 'staff'), validate({ body: customerSchema }), async (req, res) => {
  const customer = await createCustomer(req.validated.body, req.auth.userId);
  res.status(201).json({ data: customer });
});

router.post('/products', requireAuth, requireRole('admin'), validate({ body: productSchema }), async (req, res) => {
  res.status(201).json({ data: await createProduct(req.validated.body, req.auth.userId) });
});

router.post('/products/:id/variants', requireAuth, requireRole('admin'), validate({
  params: idParams,
  body: variantSchema.omit({ is_active: true }),
}), async (req, res) => {
  res.status(201).json({
    data: await createProductVariant(req.validated.params.id, req.validated.body, req.auth.userId),
  });
});

router.patch('/products/:id/variants/:variantId', requireAuth, requireRole('admin'), validate({
  params: z.object({ id: z.string().regex(/^[1-9]\d*$/), variantId: z.string().regex(/^[1-9]\d*$/) }).strict(),
  body: variantSchema.extend({ is_active: z.boolean() }),
}), async (req, res) => {
  res.json({
    data: await updateProductVariant(
      req.validated.params.id, req.validated.params.variantId, req.validated.body, req.auth.userId,
    ),
  });
});

router.get('/quotation-templates', requireAuth, requireRole('admin', 'staff'), async (_req, res) => {
  res.json({ data: await listQuotationTemplates() });
});

router.post('/quotation-templates', requireAuth, requireRole('admin', 'staff'), validate({ body: templateSchema }), async (req, res) => {
  res.status(201).json({ data: await saveQuotationTemplate(req.validated.body, req.auth.userId) });
});

router.patch('/quotation-templates/:id', requireAuth, requireRole('admin', 'staff'), validate({
  params: idParams,
  body: templateSchema,
}), async (req, res) => {
  res.json({
    data: await saveQuotationTemplate(req.validated.body, req.auth.userId, req.validated.params.id),
  });
});

router.post('/quotation-templates/:id/deactivate', requireAuth, requireRole('admin', 'staff'), validate({
  params: idParams,
}), async (req, res) => {
  res.json({ data: await deactivateQuotationTemplate(req.validated.params.id, req.auth.userId) });
});

router.post('/taxes', requireAuth, requireRole('admin'), validate({ body: taxSchema }), async (req, res) => {
  res.status(201).json({ data: await createTax(req.validated.body, req.auth.userId) });
});

router.patch('/products/:id', requireAuth, requireRole('admin'), validate({ params: idParams, body: productSchema }), async (req, res) => {
  res.json({ data: await updateProduct(req.validated.params.id, req.validated.body, req.auth.userId) });
});

router.patch('/taxes/:id', requireAuth, requireRole('admin'), validate({ params: idParams, body: taxSchema }), async (req, res) => {
  res.json({ data: await updateTax(req.validated.params.id, req.validated.body, req.auth.userId) });
});

router.post('/:type/:id/deactivate', requireAuth, requireRole('admin'), validate({ params: catalogTypeParams }), async (req, res) => {
  const type = { products: 'product', taxes: 'tax', discounts: 'discount' }[req.validated.params.type];
  res.json({ data: await deactivateCatalogRecord(type, req.validated.params.id, req.auth.userId) });
});

router.post('/discounts', requireAuth, requireRole('admin'), validate({ body: discountSchema }), async (req, res) => {
  res.status(201).json({ data: await createDiscount(req.validated.body, req.auth.userId) });
});

router.patch('/discounts/:id', requireAuth, requireRole('admin'), validate({ params: idParams, body: discountSchema }), async (req, res) => {
  res.json({ data: await updateDiscount(req.validated.params.id, req.validated.body, req.auth.userId) });
});

router.patch('/me/customer', requireAuth, requireRole('customer'), validate({ body: profileSchema }), async (req, res) => {
  res.json({ data: await updateCustomerProfile(req.auth.userId, req.validated.body) });
});

router.post('/subscriptions', requireAuth, requireRole('admin', 'staff'), validate({ body: quotationSchema }), async (req, res) => {
  const quotation = await createQuotation(req.validated.body, req.auth.userId);
  res.status(201).json({ data: quotation });
});

router.get('/subscriptions/:id', requireAuth, requireRole('admin', 'staff', 'customer'), validate({ params: idParams }), async (req, res) => {
  res.json({ data: await getSubscriptionDetails(req.validated.params.id, req.auth.role, req.auth.userId) });
});

router.patch('/subscriptions/:id/lines', requireAuth, requireRole('admin', 'staff'), validate({
  params: idParams,
  body: linesSchema,
}), async (req, res) => {
  res.json({
    data: await replaceSubscriptionLines(
      req.validated.params.id, req.validated.body.lines, req.auth.userId, req.auth.role,
    ),
  });
});

router.post('/subscriptions/:id/confirm', requireAuth, requireRole('admin', 'staff'), validate({ params: idParams }), async (req, res) => {
  res.json({ data: await confirmQuotation(req.validated.params.id, req.auth.userId, req.auth.role) });
});

router.post('/subscriptions/:id/accept', requireAuth, requireRole('customer'), validate({ params: idParams }), async (req, res) => {
  res.json({ data: await confirmQuotation(req.validated.params.id, req.auth.userId, req.auth.role) });
});

router.post('/subscriptions/:id/renew', requireAuth, requireRole('admin', 'staff', 'customer'), validate({ params: idParams }), async (req, res) => {
  res.status(201).json({ data: await renewSubscription(req.validated.params.id, req.auth.userId, req.auth.role) });
});

router.post('/subscriptions/:id/action', requireAuth, requireRole('admin', 'staff', 'customer'), validate({ params: idParams, body: subscriptionActionSchema }), async (req, res) => {
  res.json({ data: await manageSubscription(req.validated.params.id, req.validated.body.action, req.auth.userId, req.auth.role) });
});

router.post('/invoices/:id/payments', requireAuth, requireRole('admin', 'staff'), validate({ params: idParams, body: paymentSchema }), async (req, res) => {
  const payment = await recordPayment(req.validated.params.id, req.validated.body, req.auth.userId);
  res.status(201).json({ data: payment });
});

router.get('/invoices/:id', requireAuth, requireRole('admin', 'staff', 'customer'), validate({ params: idParams }), async (req, res) => {
  res.json({ data: await getInvoiceDetails(req.validated.params.id, req.auth.userId, req.auth.role) });
});

router.post('/invoices/:id/cancel', requireAuth, requireRole('admin', 'staff'), validate({
  params: idParams,
  body: cancelInvoiceSchema,
}), async (req, res) => {
  res.json({
    data: await cancelInvoice(req.validated.params.id, req.validated.body.reason, req.auth.userId),
  });
});

router.post('/invoices/:id/confirm', requireAuth, requireRole('admin', 'staff'), validate({
  params: idParams,
}), async (req, res) => {
  res.json({ data: await confirmInvoice(req.validated.params.id, req.auth.userId) });
});

router.post('/invoices/:id/send', requireAuth, requireRole('admin', 'staff'), validate({
  params: idParams,
}), async (req, res) => {
  res.json({ data: await emailInvoice(req.validated.params.id, req.auth.userId) });
});

router.post('/invoices/:id/reminder', requireAuth, requireRole('admin', 'staff'), validate({
  params: idParams,
}), async (req, res) => {
  res.json({ data: await emailInvoice(req.validated.params.id, req.auth.userId, 'reminder') });
});

export default router;
