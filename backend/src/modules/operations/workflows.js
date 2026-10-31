import { config } from '../../config.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { enqueueEmail } from '../auth/repository.js';
import { addBillingPeriods } from '../billing/math.js';

export async function listQuotationTemplates() {
  const { rows } = await pool.query(
    `SELECT qt.id, qt.name, qt.plan_id, p.name AS plan, qt.validity_days, qt.notes,
            qt.is_active, qt.updated_at,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id', qtl.id, 'product_id', qtl.product_id, 'product', pr.name,
              'variant_id', qtl.variant_id, 'quantity', qtl.quantity, 'sort_order', qtl.sort_order
            ) ORDER BY qtl.sort_order, qtl.id) FILTER (WHERE qtl.id IS NOT NULL), '[]'::jsonb) AS lines
       FROM quotation_templates qt
       JOIN plans p ON p.id = qt.plan_id
       LEFT JOIN quotation_template_lines qtl ON qtl.template_id = qt.id
       LEFT JOIN products pr ON pr.id = qtl.product_id
      GROUP BY qt.id, p.name
      ORDER BY qt.name`,
  );
  return rows;
}

export async function saveQuotationTemplate(input, actorId, templateId = null) {
  return withTransaction(async db => {
    const plan = await db.query(`SELECT id FROM plans WHERE id = $1 AND is_active`, [input.plan_id]);
    if (!plan.rows[0]) throw new AppError(404, 'PLAN_UNAVAILABLE', 'Select an active plan.');
    const { rows: savedRows } = templateId
      ? await db.query(
        `UPDATE quotation_templates
            SET name = $2, plan_id = $3, validity_days = $4, notes = $5, updated_at = now()
          WHERE id = $1 AND is_active
          RETURNING id, name, plan_id, validity_days, notes, is_active, updated_at`,
        [templateId, input.name, input.plan_id, input.validity_days, input.notes],
      )
      : await db.query(
        `INSERT INTO quotation_templates (name, plan_id, validity_days, notes, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, plan_id, validity_days, notes, is_active, updated_at`,
        [input.name, input.plan_id, input.validity_days, input.notes, actorId],
      );
    if (!savedRows[0]) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'The active quotation template does not exist.');
    const id = savedRows[0].id;
    await db.query(`DELETE FROM quotation_template_lines WHERE template_id = $1`, [id]);
    for (const [index, line] of input.lines.entries()) {
      await assertProductVariant(db, line.product_id, line.variant_id);
      await db.query(
        `INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, line.product_id, line.variant_id, line.quantity, index],
      );
    }
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'quotation_template', $3, $4::jsonb)`,
      [actorId, templateId ? 'quotation_template.update' : 'quotation_template.create', id, JSON.stringify({ name: input.name })],
    );
    return { ...savedRows[0], lines: input.lines };
  });
}

export async function deactivateQuotationTemplate(id, actorId) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `UPDATE quotation_templates SET is_active = FALSE, updated_at = now()
        WHERE id = $1 AND is_active RETURNING id, name`,
      [id],
    );
    if (!rows[0]) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'The active quotation template does not exist.');
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'quotation_template.deactivate', 'quotation_template', $2, '{}'::jsonb)`,
      [actorId, id],
    );
    return rows[0];
  });
}

export async function createProductVariant(productId, input, actorId) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `INSERT INTO product_variants (product_id, attribute, value, extra_price)
       SELECT id, $2, $3, $4 FROM products WHERE id = $1 AND is_active
       RETURNING id, product_id, attribute, value, extra_price, is_active`,
      [productId, input.attribute, input.value, input.extra_price],
    );
    if (!rows[0]) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'The active product does not exist.');
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'product_variant.create', 'product_variant', $2, $3::jsonb)`,
      [actorId, rows[0].id, JSON.stringify({ product_id: productId, attribute: input.attribute, value: input.value })],
    );
    return rows[0];
  });
}

export async function updateProductVariant(productId, variantId, input, actorId) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `UPDATE product_variants
          SET attribute = $3, value = $4, extra_price = $5, is_active = $6
        WHERE id = $1 AND product_id = $2
        RETURNING id, product_id, attribute, value, extra_price, is_active`,
      [variantId, productId, input.attribute, input.value, input.extra_price, input.is_active],
    );
    if (!rows[0]) throw new AppError(404, 'VARIANT_NOT_FOUND', 'The product variant does not exist.');
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'product_variant.update', 'product_variant', $2, $3::jsonb)`,
      [actorId, variantId, JSON.stringify({ product_id: productId })],
    );
    return rows[0];
  });
}

async function assertProductVariant(db, productId, variantId) {
  const { rows } = await db.query(
    `SELECT p.id, p.sales_price, p.tax_id, v.extra_price
       FROM products p
       LEFT JOIN product_variants v ON v.product_id = p.id AND v.id = $2 AND v.is_active
      WHERE p.id = $1 AND p.is_active
        AND ($2::bigint IS NULL OR v.id IS NOT NULL)`,
    [productId, variantId],
  );
  if (!rows[0]) throw new AppError(422, 'INVALID_PRODUCT_VARIANT', 'A selected product or variant is unavailable.');
  return rows[0];
}

export async function replaceSubscriptionLines(subscriptionId, lines, actorId, role, customerUserId = null) {
  return withTransaction(async db => {
    const { rows: subscriptions } = await db.query(
      `SELECT s.id, s.status, c.user_id
         FROM subscriptions s JOIN customers c ON c.id = s.customer_id
        WHERE s.id = $1 AND ($3 <> 'customer' OR c.user_id = $2)
        FOR UPDATE OF s`,
      [subscriptionId, customerUserId, role],
    );
    const subscription = subscriptions[0];
    if (!subscription) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'The subscription does not exist.');
    if (role === 'customer' || !['draft', 'quotation'].includes(subscription.status)) {
      throw new AppError(409, 'LINES_LOCKED', 'Subscription lines can only be edited by staff before confirmation.');
    }
    await db.query(`DELETE FROM subscription_lines WHERE subscription_id = $1`, [subscriptionId]);
    for (const [index, line] of lines.entries()) {
      const product = await assertProductVariant(db, line.product_id, line.variant_id);
      const price = (Number(product.sales_price) + Number(product.extra_price || 0)).toFixed(2);
      await db.query(
        `INSERT INTO subscription_lines (
           subscription_id, product_id, variant_id, quantity, unit_price, tax_id, sort_order
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [subscriptionId, line.product_id, line.variant_id, line.quantity, price, product.tax_id, index],
      );
    }
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'subscription.lines.update', 'subscription', $2, $3::jsonb)`,
      [actorId, subscriptionId, JSON.stringify({ line_count: lines.length })],
    );
    return getSubscriptionDetails(subscriptionId, role, customerUserId, db);
  });
}

export async function getSubscriptionDetails(subscriptionId, role, userId, db = pool) {
  const { rows } = await db.query(
    `SELECT s.id, s.number, s.status, s.start_date, s.expiry_date, s.quotation_valid_until,
            s.next_invoice_date, s.notes, s.template_id, s.renewed_from_id,
            c.name AS customer, p.name AS plan, p.billing_period,
            p.is_renewable, p.is_pausable, p.is_closable
       FROM subscriptions s
       JOIN customers c ON c.id = s.customer_id
       JOIN plans p ON p.id = s.plan_id
      WHERE s.id = $1 AND ($2 <> 'customer' OR c.user_id = $3)`,
    [subscriptionId, role, userId],
  );
  const subscription = rows[0];
  if (!subscription) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'The subscription does not exist.');
  const [lines, history] = await Promise.all([
    db.query(
      `SELECT sl.id, sl.product_id, p.name AS product, sl.variant_id,
              concat_ws(': ', v.attribute, v.value) AS variant, sl.quantity, sl.unit_price,
              sl.tax_id, t.name AS tax, t.kind AS tax_kind, t.rate AS tax_rate,
              sl.line_subtotal AS subtotal
         FROM subscription_lines sl
         JOIN products p ON p.id = sl.product_id
         LEFT JOIN product_variants v ON v.id = sl.variant_id
         LEFT JOIN taxes t ON t.id = sl.tax_id
        WHERE sl.subscription_id = $1
        ORDER BY sl.sort_order, sl.id`,
      [subscriptionId],
    ),
    db.query(
      `SELECT from_status, to_status, changed_by, note, changed_at
         FROM subscription_status_history WHERE subscription_id = $1
        ORDER BY changed_at DESC, id DESC`,
      [subscriptionId],
    ),
  ]);
  return { ...subscription, lines: lines.rows, history: history.rows };
}

export async function renewSubscription(subscriptionId, userId, role) {
  return withTransaction(async db => {
    await db.query(`SELECT set_config('app.user_id', $1, true)`, [String(userId)]);
    const { rows } = await db.query(
      `SELECT s.*, c.user_id, p.billing_period, p.is_renewable,
              (SELECT id FROM payment_terms WHERE id = s.payment_term_id AND is_active) AS active_term
         FROM subscriptions s JOIN customers c ON c.id = s.customer_id
         JOIN plans p ON p.id = s.plan_id
        WHERE s.id = $1 AND ($3 <> 'customer' OR c.user_id = $2)
        FOR UPDATE OF s`,
      [subscriptionId, userId, role],
    );
    const old = rows[0];
    if (!old) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'The subscription does not exist.');
    if (!old.is_renewable || !old.active_term || !['active', 'closed'].includes(old.status)) {
      throw new AppError(409, 'RENEWAL_NOT_ALLOWED', 'This subscription cannot be renewed in its current state.');
    }
    const startDate = addBillingPeriods(old.expiry_date, 'daily', 1);
    const expiryDate = addBillingPeriods(addBillingPeriods(startDate, old.billing_period, 1), 'daily', -1);
    const { rows: renewedRows } = await db.query(
      `INSERT INTO subscriptions (
         customer_id, plan_id, template_id, payment_term_id, salesperson_id, status,
         start_date, expiry_date, quotation_valid_until, renewed_from_id, created_by
       )
       VALUES ($1, $2, $3, $4, $5, 'draft', $6::date, $7::date, $8::date, $9, $10)
       RETURNING id, number, status, renewed_from_id`,
      [
        old.customer_id, old.plan_id, old.template_id, old.payment_term_id, old.salesperson_id,
        startDate, expiryDate, addBillingPeriods(startDate, 'daily', 30), old.id, userId,
      ],
    );
    const renewed = renewedRows[0];
    await db.query(
      `INSERT INTO subscription_lines (subscription_id, product_id, variant_id, quantity, unit_price, tax_id, sort_order)
       SELECT $1, sl.product_id, sl.variant_id, sl.quantity,
              p.sales_price + COALESCE(v.extra_price, 0), COALESCE(sl.tax_id, p.tax_id), sl.sort_order
         FROM subscription_lines sl
         JOIN products p ON p.id = sl.product_id AND p.is_active
         LEFT JOIN product_variants v ON v.id = sl.variant_id AND v.is_active
        WHERE sl.subscription_id = $2`,
      [renewed.id, old.id],
    );
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'subscription.renew', 'subscription', $2, $3::jsonb)`,
      [userId, renewed.id, JSON.stringify({ renewed_from_id: old.id })],
    );
    return renewed;
  });
}

export async function cancelInvoice(invoiceId, reason, actorId) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `SELECT id, number, status, amount_paid FROM invoices WHERE id = $1 FOR UPDATE`,
      [invoiceId],
    );
    const invoice = rows[0];
    if (!invoice) throw new AppError(404, 'INVOICE_NOT_FOUND', 'The invoice does not exist.');
    if (!['draft', 'confirmed'].includes(invoice.status) || Number(invoice.amount_paid) > 0) {
      throw new AppError(409, 'INVOICE_NOT_CANCELLABLE', 'Only unpaid draft or confirmed invoices can be cancelled.');
    }
    const { rows: redemptions } = await db.query(
      `DELETE FROM discount_redemptions WHERE invoice_id = $1 RETURNING discount_id`,
      [invoiceId],
    );
    for (const redemption of redemptions) {
      await db.query(`UPDATE discount_rules SET times_used = GREATEST(times_used - 1, 0) WHERE id = $1`, [redemption.discount_id]);
    }
    await db.query(
      `UPDATE invoices SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2, cancelled_by = $3 WHERE id = $1`,
      [invoiceId, reason, actorId],
    );
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'invoice.cancel', 'invoice', $2, $3::jsonb)`,
      [actorId, invoiceId, JSON.stringify({ reason })],
    );
    return { id: invoiceId, number: invoice.number, status: 'cancelled' };
  });
}

export async function confirmInvoice(invoiceId, actorId) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `SELECT id, number, status FROM invoices WHERE id = $1 FOR UPDATE`,
      [invoiceId],
    );
    if (!rows[0]) throw new AppError(404, 'INVOICE_NOT_FOUND', 'The invoice does not exist.');
    if (rows[0].status !== 'draft') throw new AppError(409, 'INVOICE_NOT_CONFIRMABLE', 'Only draft invoices can be confirmed.');
    const { rows: confirmed } = await db.query(
      `UPDATE invoices SET status = 'confirmed', confirmed_at = now() WHERE id = $1
       RETURNING id, number, status, total, due_date`,
      [invoiceId],
    );
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'invoice.confirm', 'invoice', $2, '{}'::jsonb)`,
      [actorId, invoiceId],
    );
    return confirmed[0];
  });
}

export async function emailInvoice(invoiceId, actorId, mode = 'send') {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `SELECT i.id, i.number, i.status, i.total, i.amount_paid, i.due_date,
              c.name AS customer_name, c.email AS customer_email, p.name AS plan_name
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         JOIN subscriptions s ON s.id = i.subscription_id JOIN plans p ON p.id = s.plan_id
        WHERE i.id = $1 FOR UPDATE OF i`,
      [invoiceId],
    );
    const invoice = rows[0];
    if (!invoice) throw new AppError(404, 'INVOICE_NOT_FOUND', 'The invoice does not exist.');
    if (invoice.status !== 'confirmed') throw new AppError(409, 'INVOICE_NOT_SENDABLE', 'Only confirmed invoices can be emailed.');
    if (mode === 'reminder' && Number(invoice.total) <= Number(invoice.amount_paid)) {
      throw new AppError(409, 'INVOICE_NOT_OUTSTANDING', 'This invoice has no remaining balance.');
    }
    const template = mode === 'reminder' ? 'invoice_reminder' : 'invoice_created';
    const paymentInstructions = config.PAYMENT_UPI_ID
      ? `Pay by UPI to ${config.PAYMENT_PAYEE_NAME || 'Brightloop Software'} (${config.PAYMENT_UPI_ID}) and include invoice ${invoice.number} in the payment note.`
      : 'Please contact Brightloop billing and include the invoice number as your payment reference.';
    const dedupeKey = mode === 'reminder'
      ? `invoice:${invoiceId}:reminder:${new Date().toISOString().slice(0, 10)}`
      : `invoice:${invoiceId}:send`;
    const email = await enqueueEmail(db, {
      to: invoice.customer_email,
      template,
      payload: {
        full_name: invoice.customer_name,
        invoice_number: invoice.number,
        plan_name: invoice.plan_name,
        amount: mode === 'reminder' ? Number(invoice.total) - Number(invoice.amount_paid) : invoice.total,
        due_date: invoice.due_date,
        payment_instructions: paymentInstructions,
        url: `${config.APP_BASE_URL}/`,
      },
      dedupeKey,
    });
    if (mode === 'send') {
      await db.query(
        `UPDATE invoices SET sent_at = now(), sent_to = $2 WHERE id = $1`,
        [invoiceId, invoice.customer_email],
      );
    }
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'invoice', $3, $4::jsonb)`,
      [actorId, `invoice.${mode}`, invoiceId, JSON.stringify({ to: invoice.customer_email })],
    );
    return {
      id: invoiceId,
      queued: email.status !== 'sent',
      sent_to: invoice.customer_email,
      outbox_id: email.id,
    };
  });
}

export async function getInvoiceDetails(invoiceId, userId, role) {
  const { rows } = await pool.query(
    `SELECT i.id, i.number, i.status, i.invoice_date, i.due_date, i.period_start, i.period_end,
            i.bill_to_name, i.bill_to_address, i.bill_to_tax_number, i.subtotal,
            i.discount_total, i.tax_total, i.total, i.amount_paid, i.sent_at, i.sent_to,
            i.cancel_reason, c.id AS customer_id, c.name AS customer_name, c.email AS customer_email,
            s.number AS subscription_number, p.name AS plan_name,
            COALESCE((SELECT value #>> '{}' FROM workspace_settings WHERE key = 'company_name'), 'Brightloop Software') AS company_name,
            COALESCE((SELECT value #>> '{}' FROM workspace_settings WHERE key = 'invoice_footer'), '') AS invoice_footer
       FROM invoices i JOIN customers c ON c.id = i.customer_id
       JOIN subscriptions s ON s.id = i.subscription_id JOIN plans p ON p.id = s.plan_id
      WHERE i.id = $1 AND ($3 <> 'customer' OR c.user_id = $2)`,
    [invoiceId, userId, role],
  );
  const invoice = rows[0];
  if (!invoice) throw new AppError(404, 'INVOICE_NOT_FOUND', 'The invoice does not exist.');
  const [lines, payments] = await Promise.all([
    pool.query(
      `SELECT description, quantity, unit_price, line_subtotal AS subtotal,
              discount_amount, tax_name, tax_kind, tax_rate, tax_amount, line_total AS total
         FROM invoice_lines WHERE invoice_id = $1 ORDER BY id`,
      [invoiceId],
    ),
    pool.query(
      `SELECT id, method, amount, payment_date, reference, note
         FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC, id DESC`,
      [invoiceId],
    ),
  ]);
  return { ...invoice, lines: lines.rows, payments: payments.rows };
}
