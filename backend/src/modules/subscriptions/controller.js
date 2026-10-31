import { pool, withTransaction } from '../../db/pool.js';
import { config } from '../../config.js';
import { AppError } from '../../lib/errors.js';
import { dateInTimezone, isValidDateOnly } from '../../lib/clock.js';
import { billOne, previewInvoice } from '../billing/service.js';
import { addPeriod, periodIndex } from '../billing/math.js';

function moneyCents(value) {
  const [whole, fractional = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fractional.padEnd(2, '0'));
}

const money = row => {
  if (!row) return row;
  const result = { ...row };
  for (const key of ['price', 'unit_price', 'line_subtotal']) {
    if (result[key] !== undefined && result[key] !== null) result[key] = String(result[key]);
  }
  return result;
};

async function insertLines(client, subscriptionId, lines, { allowInactive = false, allowBelowCost = false } = {}) {
  for (const [index, line] of lines.entries()) {
    const product = await client.query(
      `SELECT p.sales_price, p.cost_price, p.sales_price + COALESCE(v.extra_price,0) AS effective_price,
              p.tax_id, p.is_active,
              v.extra_price, v.is_active AS variant_active
         FROM products p
         LEFT JOIN product_variants v ON v.id=$2 AND v.product_id=p.id
        WHERE p.id=$1`,
      [line.productId, line.variantId ?? null],
    );
    const item = product.rows[0];
    if (!item || (!allowInactive && !item.is_active) || (line.variantId && (!item.variant_active || (!allowInactive && !item.variant_active)))) {
      throw new AppError(422, 'INVALID_LINE', `Line ${index + 1} references a missing or inactive product or variant.`);
    }
    const unitPrice = line.unitPrice ?? String(item.effective_price);
    if (!allowBelowCost && moneyCents(unitPrice) < moneyCents(item.cost_price)) {
      throw new AppError(422, 'PRICE_BELOW_COST', 'Line price cannot be below product cost without admin approval.');
    }
    const taxId = line.taxId ?? item.tax_id;
    if (taxId) {
      const tax = await client.query('SELECT is_active FROM taxes WHERE id=$1', [taxId]);
      if (!tax.rows[0]?.is_active) throw new AppError(422, 'INVALID_TAX', 'New subscription lines require an active tax.');
    }
    await client.query(
      `INSERT INTO subscription_lines
        (subscription_id, product_id, variant_id, quantity, unit_price, tax_id, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [subscriptionId, line.productId, line.variantId ?? null, line.quantity, unitPrice, taxId, line.sortOrder ?? index],
    );
  }
}

async function ownedSub(userId, id) {
  const result = await pool.query(
    `SELECT s.* FROM subscriptions s JOIN customers c ON c.id=s.customer_id
      WHERE s.id=$1 AND c.user_id=$2`,
    [id, userId],
  );
  if (!result.rowCount) throw new AppError(404, 'NOT_FOUND', 'Subscription not found.');
  return result.rows[0];
}

export async function list(req, res) {
  const { page, limit, status, customerId, planId, q, startFrom, startTo, expiryFrom, expiryTo, dueFrom, dueTo } = req.validated.query;
  const params = [status ?? null, customerId ?? null, planId ?? null, q ? `%${q}%` : null,
    startFrom ?? null, startTo ?? null, expiryFrom ?? null, expiryTo ?? null, dueFrom ?? null, dueTo ?? null];
  const result = await pool.query(
    `SELECT s.id, s.number, s.customer_id, c.name AS customer_name, s.plan_id, p.name AS plan_name,
            s.status, s.start_date, s.expiry_date, s.next_invoice_date, s.created_at, s.updated_at
       FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN plans p ON p.id=s.plan_id
      WHERE ($1::text IS NULL OR s.status::text=$1)
        AND ($2::bigint IS NULL OR s.customer_id=$2)
        AND ($3::bigint IS NULL OR s.plan_id=$3)
        AND ($4::text IS NULL OR s.number ILIKE $4 OR c.name ILIKE $4)
        AND ($5::date IS NULL OR s.start_date >= $5) AND ($6::date IS NULL OR s.start_date <= $6)
        AND ($7::date IS NULL OR s.expiry_date >= $7) AND ($8::date IS NULL OR s.expiry_date <= $8)
        AND ($9::date IS NULL OR s.next_invoice_date >= $9) AND ($10::date IS NULL OR s.next_invoice_date <= $10)
      ORDER BY s.id DESC LIMIT $11 OFFSET $12`,
    [...params, limit, (page - 1) * limit],
  );
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM subscriptions s JOIN customers c ON c.id=s.customer_id
      WHERE ($1::text IS NULL OR s.status::text=$1)
        AND ($2::bigint IS NULL OR s.customer_id=$2)
        AND ($3::bigint IS NULL OR s.plan_id=$3)
        AND ($4::text IS NULL OR s.number ILIKE $4 OR c.name ILIKE $4)
        AND ($5::date IS NULL OR s.start_date >= $5) AND ($6::date IS NULL OR s.start_date <= $6)
        AND ($7::date IS NULL OR s.expiry_date >= $7) AND ($8::date IS NULL OR s.expiry_date <= $8)
        AND ($9::date IS NULL OR s.next_invoice_date >= $9) AND ($10::date IS NULL OR s.next_invoice_date <= $10)`,
    params,
  );
  res.json({ data: result.rows, meta: { page, limit, total: count.rows[0].total } });
}

export async function create(req, res) {
  const body = req.validated.body;
  const today = dateInTimezone(config.BUSINESS_TZ);
  const created = await withTransaction(async client => {
    const planResult = await client.query(
      `SELECT * FROM plans WHERE id=$1 AND is_active
        AND $2::date >= available_from AND (available_to IS NULL OR $2::date <= available_to)`,
      [body.planId, today],
    );
    if (!planResult.rowCount) throw new AppError(422, 'PLAN_UNAVAILABLE', 'Plan is inactive or outside its availability window.');
    const customer = await client.query('SELECT id FROM customers WHERE id=$1', [body.customerId]);
    if (!customer.rowCount) throw new AppError(422, 'INVALID_CUSTOMER', 'Customer not found.');
    const term = await client.query('SELECT id FROM payment_terms WHERE id=$1 AND is_active', [body.paymentTermId]);
    if (!term.rowCount) throw new AppError(422, 'INVALID_PAYMENT_TERM', 'Payment terms not found or inactive.');
    const result = await client.query(
      `INSERT INTO subscriptions
        (customer_id, plan_id, template_id, salesperson_id, payment_term_id, start_date, expiry_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [body.customerId, body.planId, body.templateId ?? null,
        req.auth.role === 'staff' ? req.auth.userId : null, body.paymentTermId,
        body.startDate, body.expiryDate, body.notes ?? null, req.auth.userId],
    );
    let lines = body.lines;
    const warnings = [];
    if (body.templateId) {
      const template = await client.query(
        `SELECT t.id FROM quotation_templates t
          WHERE t.id=$1 AND t.plan_id=$2 AND t.is_active`,
        [body.templateId, body.planId],
      );
      if (!template.rowCount) throw new AppError(422, 'INVALID_TEMPLATE', 'Template is inactive or belongs to another plan.');
      const templateLines = await client.query(
        `SELECT tl.product_id, tl.variant_id, tl.quantity, tl.sort_order, p.is_active,
                v.is_active AS variant_active
           FROM quotation_template_lines tl JOIN products p ON p.id=tl.product_id
           LEFT JOIN product_variants v ON v.id=tl.variant_id AND v.product_id=p.id
          WHERE tl.template_id=$1 ORDER BY tl.sort_order, tl.id`,
        [body.templateId],
      );
      lines = templateLines.rows.filter(line => {
        const active = line.is_active && (!line.variant_id || line.variant_active);
        if (!active) warnings.push({ productId: line.product_id, variantId: line.variant_id, warning: 'Inactive product or variant skipped.' });
        return active;
      }).map(line => ({
        productId: line.product_id, variantId: line.variant_id,
        quantity: line.quantity, sortOrder: line.sort_order,
      }));
      await client.query(
        `UPDATE subscriptions SET quotation_valid_until = $2::date +
           (SELECT validity_days FROM quotation_templates WHERE id=$1)
         WHERE id=$3`,
        [body.templateId, today, result.rows[0].id],
      );
    }
    await insertLines(client, result.rows[0].id, lines, { allowBelowCost: req.auth.role === 'admin' });
    const full = await client.query('SELECT * FROM subscriptions WHERE id=$1', [result.rows[0].id]);
    return { subscription: full.rows[0], warnings };
  });
  res.status(201).json({ data: { ...created.subscription, warnings: created.warnings } });
}

async function details(id) {
  const result = await pool.query(
    `SELECT s.*, c.name AS customer_name, p.name AS plan_name, p.billing_period,
            p.min_quantity, p.is_closable, p.is_pausable, p.is_renewable, p.auto_close,
            pt.name AS payment_term_name, pt.due_days
       FROM subscriptions s JOIN customers c ON c.id=s.customer_id
       JOIN plans p ON p.id=s.plan_id JOIN payment_terms pt ON pt.id=s.payment_term_id
      WHERE s.id=$1`,
    [id],
  );
  if (!result.rowCount) throw new AppError(404, 'NOT_FOUND', 'Subscription not found.');
  const [lines, discounts, history] = await Promise.all([
    pool.query(
      `SELECT sl.id, sl.product_id, sl.variant_id, p.name AS product_name, sl.quantity,
              sl.unit_price, sl.tax_id, sl.line_subtotal, sl.sort_order
         FROM subscription_lines sl JOIN products p ON p.id=sl.product_id
        WHERE sl.subscription_id=$1 ORDER BY sl.sort_order, sl.id`, [id],
    ),
    pool.query(
      `SELECT d.id, d.name, d.kind, d.value, d.scope FROM subscription_discounts sd
         JOIN discount_rules d ON d.id=sd.discount_id WHERE sd.subscription_id=$1`, [id],
    ),
    pool.query(
      `SELECT from_status, to_status, changed_by, note, changed_at FROM subscription_status_history
        WHERE subscription_id=$1 ORDER BY changed_at, id`, [id],
    ),
  ]);
  return {
    ...result.rows[0], lines: lines.rows.map(money), discounts: discounts.rows, status_history: history.rows,
  };
}

export async function get(req, res) {
  res.json({ data: await details(req.validated.params.id) });
}

export async function listOwn(req, res) {
  const result = await pool.query(
    `SELECT s.id, s.number, s.plan_id, p.name AS plan_name, s.status, s.start_date,
            s.expiry_date, s.next_invoice_date
       FROM subscriptions s JOIN plans p ON p.id=s.plan_id
       JOIN customers c ON c.id=s.customer_id WHERE c.user_id=$1 ORDER BY s.id DESC`,
    [req.auth.userId],
  );
  res.json({ data: result.rows });
}

export async function getOwn(req, res) {
  await ownedSub(req.auth.userId, req.validated.params.id);
  res.json({ data: await details(req.validated.params.id) });
}

export async function patch(req, res) {
  const entries = Object.entries(req.validated.body);
  const values = entries.map(([, value]) => value);
  const assignments = entries.map(([key], index) =>
    `${key === 'salespersonId' ? 'salesperson_id' : key}=$${index + 1}`);
  values.push(req.validated.params.id, req.ifMatch);
  const result = await pool.query(
    `UPDATE subscriptions SET ${assignments.join(', ')}
      WHERE id=$${values.length - 1} AND updated_at=$${values.length}::timestamptz
        AND status IN ('draft','quotation','confirmed','active','paused') RETURNING *`,
    values,
  );
  if (!result.rowCount) throw new AppError(409, 'STALE_OR_NOT_EDITABLE', 'Subscription changed or is no longer editable.');
  res.json({ data: result.rows[0] });
}

export async function replaceLines(req, res) {
  const id = req.validated.params.id;
  await withTransaction(async client => {
    const sub = await client.query('SELECT status, updated_at FROM subscriptions WHERE id=$1 FOR UPDATE', [id]);
    if (!sub.rowCount) throw new AppError(404, 'NOT_FOUND', 'Subscription not found.');
    const fresh = await client.query('SELECT updated_at=$2::timestamptz AS matches FROM subscriptions WHERE id=$1', [id, req.ifMatch]);
    if (!fresh.rows[0].matches) throw new AppError(409, 'STALE_RECORD', 'Subscription changed since it was loaded.');
    if (!['draft', 'quotation'].includes(sub.rows[0].status)) {
      throw new AppError(409, 'NOT_EDITABLE', 'Lines can only be edited in draft or quotation status.');
    }
    await client.query('DELETE FROM subscription_lines WHERE subscription_id=$1', [id]);
    await insertLines(client, id, req.validated.body.lines, { allowBelowCost: req.auth.role === 'admin' });
    await client.query('UPDATE subscriptions SET updated_at=now() WHERE id=$1', [id]);
  });
  res.json({ data: await details(id) });
}

export async function transition(req, res) {
  const { id } = req.validated.params;
  const { to, reason } = req.validated.body;
  const updated = await withTransaction(async client => {
    const locked = await client.query(
      `SELECT s.*, p.min_quantity, p.is_pausable, p.is_closable, p.auto_close
         FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.id=$1 FOR UPDATE OF s`,
      [id],
    );
    if (!locked.rowCount) throw new AppError(404, 'NOT_FOUND', 'Subscription not found.');
    const sub = locked.rows[0];
    if (req.ifMatch && new Date(sub.updated_at).getTime() !== new Date(req.ifMatch).getTime()) {
      throw new AppError(409, 'STALE_RECORD', 'Subscription changed since it was loaded.');
    }
    const allowed = {
      draft: ['quotation', 'closed'],
      quotation: ['draft', 'confirmed', 'closed'],
      confirmed: ['active', 'closed'],
      active: ['paused', 'closed'],
      paused: ['active', 'closed'],
      closed: [],
    };
    if (!allowed[sub.status].includes(to)) throw new AppError(409, 'INVALID_TRANSITION', `Cannot transition ${sub.status} to ${to}.`);
    if (['quotation', 'confirmed'].includes(to)) {
      if (sub.status === 'draft' && !['draft', 'quotation'].includes(to)) throw new AppError(409, 'INVALID_TRANSITION', 'A draft must first become a quotation.');
      const stats = await client.query(
        `SELECT count(*)::int AS lines, COALESCE(bool_and(quantity >= $2), FALSE) AS meets_min
           FROM subscription_lines WHERE subscription_id=$1`,
        [id, sub.min_quantity],
      );
      if (stats.rows[0].lines < 1 || !stats.rows[0].meets_min) {
        throw new AppError(422, 'LINES_REQUIRED', 'At least one line is required and every line must meet the plan minimum quantity.');
      }
      const availability = await client.query(
        `SELECT is_active AND $2::date >= available_from
           AND (available_to IS NULL OR $2::date <= available_to) AS available
           FROM plans WHERE id=$1`, [sub.plan_id, today],
      );
      if (!availability.rows[0].available) throw new AppError(422, 'PLAN_UNAVAILABLE', 'Plan is not currently available.');
    }
    const today = dateInTimezone(config.BUSINESS_TZ);
    if (to === 'confirmed' && sub.quotation_valid_until && String(sub.quotation_valid_until).slice(0, 10) < today) {
      throw new AppError(409, 'QUOTATION_EXPIRED', 'Quotation validity has expired.');
    }
    if (to === 'active' && sub.status !== 'paused' && String(sub.start_date).slice(0, 10) > today) {
      throw new AppError(409, 'NOT_STARTED', 'Subscription cannot activate before its start date.');
    }
    if (to === 'paused' && !sub.is_pausable) throw new AppError(409, 'NOT_PAUSABLE', 'The plan does not allow pausing.');
    const adminForceClose = req.auth.role === 'admin' && reason?.startsWith('FORCE_CLOSE:');
    if (to === 'closed' && sub.status === 'active' && !sub.is_closable && !adminForceClose) {
      throw new AppError(409, 'NOT_CLOSABLE', 'The plan does not allow early closure.');
    }
    if (to === 'closed' && !reason) throw new AppError(422, 'REASON_REQUIRED', 'A closure reason is required.');
    await client.query("SELECT set_config('app.user_id', $1, true)", [req.auth.userId]);
    const statusNote = sub.status === 'paused' && to === 'active'
      ? `PAUSE_RESUMED_${config.PAUSE_POLICY.toUpperCase()}`
      : to === 'paused' ? 'PAUSE_STARTED' : reason ?? '';
    await client.query("SELECT set_config('app.status_note', $1, true)", [statusNote]);
    let nextInvoiceDate = to === 'active' ? String(sub.start_date).slice(0, 10) : undefined;
    if (sub.status === 'paused' && to === 'active' && config.PAUSE_POLICY === 'skip') {
      const anchor = String(sub.start_date).slice(0, 10);
      const next = String(sub.next_invoice_date).slice(0, 10);
      if (next > today) {
        nextInvoiceDate = next;
      } else {
        const index = periodIndex(anchor, today, sub.billing_period);
        nextInvoiceDate = addPeriod(anchor, index + 1, sub.billing_period);
      }
    }
    const result = await client.query(
      `UPDATE subscriptions SET status=$1::subscription_status,
         quotation_valid_until=CASE WHEN $1::text='quotation' THEN COALESCE(quotation_valid_until, $5::date + 30) ELSE quotation_valid_until END,
         next_invoice_date=CASE
           WHEN $1::text='active' AND $7::text='paused' AND $6::text='shift' THEN GREATEST(COALESCE(next_invoice_date,$5::date),$5::date)
           WHEN $1::text='active' THEN $2::date WHEN $1::text='closed' THEN NULL ELSE next_invoice_date END,
         expiry_date=CASE WHEN $1::text='active' AND $7::text='paused' AND $6::text='shift'
           THEN expiry_date + GREATEST(0,$5::date-(paused_at AT TIME ZONE $8)::date) ELSE expiry_date END,
         paused_at=CASE WHEN $1::text='paused' THEN now() WHEN $1::text='active' THEN NULL ELSE paused_at END,
         closed_at=CASE WHEN $1::text='closed' THEN now() ELSE closed_at END,
         close_reason=CASE WHEN $1::text='closed' THEN $3 ELSE close_reason END
       WHERE id=$4 RETURNING *`,
      [to, nextInvoiceDate ?? null, reason ?? null, id, today, config.PAUSE_POLICY, sub.status, config.BUSINESS_TZ],
    );
    if (to === 'closed') {
      await client.query(
        `UPDATE invoices SET status='cancelled', cancelled_at=now()
          WHERE subscription_id=$1 AND status='draft' AND period_start > $2::date`,
        [id, today],
      );
    }
    return result.rows[0];
  });
  res.json({ data: updated });
}

async function portalAction(req, res, to, reason) {
  await ownedSub(req.auth.userId, req.validated.params.id);
  req.validated.body = { to, ...(reason ? { reason } : {}) };
  return transition(req, res);
}

export const portalAccept = (req, res) => portalAction(req, res, 'confirmed');
export const portalPause = (req, res) => portalAction(req, res, 'paused');
export const portalResume = (req, res) => portalAction(req, res, 'active');
export const portalClose = (req, res) => portalAction(req, res, 'closed', 'CUSTOMER_REQUEST');

export async function portalRenew(req, res) {
  await ownedSub(req.auth.userId, req.validated.params.id);
  return renew(req, res);
}

export async function renew(req, res) {
  const parentId = req.validated.params.id;
  const created = await withTransaction(async client => {
    const parent = await client.query(
      `SELECT s.*, p.is_renewable FROM subscriptions s JOIN plans p ON p.id=s.plan_id
        WHERE s.id=$1 FOR UPDATE OF s`,
      [parentId],
    );
    if (!parent.rowCount) throw new AppError(404, 'NOT_FOUND', 'Subscription not found.');
    const old = parent.rows[0];
    if (!old.is_renewable) throw new AppError(409, 'NOT_RENEWABLE', 'The plan does not allow renewal.');
    if (!['active', 'closed'].includes(old.status)) {
      throw new AppError(409, 'NOT_RENEWABLE', 'Only active or closed subscriptions can be renewed.');
    }
    const child = await client.query(
      `INSERT INTO subscriptions
        (customer_id, plan_id, template_id, salesperson_id, payment_term_id, start_date, expiry_date,
         notes, created_by, renewed_from_id)
       VALUES ($1,$2,$3,$4,$5,($6::date + 1),($7::date + ($7::date-$6::date)), $8, $9, $10)
       RETURNING *`,
      [old.customer_id, old.plan_id, old.template_id, old.salesperson_id, old.payment_term_id,
        old.expiry_date, old.expiry_date, old.notes, req.auth.userId, parentId],
    );
    const lines = await client.query(
      `SELECT sl.product_id, sl.variant_id, sl.quantity,
              p.sales_price + COALESCE(v.extra_price,0) AS effective_price, p.tax_id
         FROM subscription_lines sl JOIN products p ON p.id=sl.product_id
         LEFT JOIN product_variants v ON v.id=sl.variant_id AND v.product_id=p.id
        WHERE sl.subscription_id=$1 ORDER BY sl.sort_order, sl.id`,
      [parentId],
    );
    await insertLines(client, child.rows[0].id, lines.rows.map(line => ({
      productId: line.product_id, variantId: line.variant_id, quantity: line.quantity,
      unitPrice: String(line.effective_price), taxId: line.tax_id,
    })), { allowBelowCost: req.auth.role === 'admin' });
    return child.rows[0];
  });
  res.status(201).json({ data: created });
}

async function eligibleDiscountQuery(client, subscriptionId, discountId = null, asOf = dateInTimezone(config.BUSINESS_TZ)) {
  return client.query(
    `WITH bases AS (
       SELECT d.id, d.name, d.kind, d.value, d.scope, d.min_purchase_amount, d.min_quantity,
              d.start_date, d.end_date, d.usage_limit, d.times_used,
              COALESCE(SUM(sl.line_subtotal) FILTER (WHERE d.scope='subscription' OR dp.product_id=sl.product_id),0) AS base,
              COALESCE(SUM(sl.quantity) FILTER (WHERE d.scope='subscription' OR dp.product_id=sl.product_id),0) AS quantity
         FROM discount_rules d
         JOIN subscriptions s ON s.id=$1
         LEFT JOIN subscription_lines sl ON sl.subscription_id=s.id
         LEFT JOIN discount_products dp ON dp.discount_id=d.id AND dp.product_id=sl.product_id
        WHERE ($2::bigint IS NULL OR d.id=$2)
        GROUP BY d.id
     )
     SELECT * FROM bases
      WHERE start_date <= $3::date AND (end_date IS NULL OR end_date >= $3::date)
        AND (usage_limit IS NULL OR times_used < usage_limit)
        AND base >= min_purchase_amount AND quantity >= min_quantity`,
    [subscriptionId, discountId, asOf],
  );
}

export async function eligibleDiscounts(req, res) {
  const sub = await pool.query('SELECT id FROM subscriptions WHERE id=$1', [req.validated.params.id]);
  if (!sub.rowCount) throw new AppError(404, 'NOT_FOUND', 'Subscription not found.');
  const result = await eligibleDiscountQuery(pool, req.validated.params.id);
  res.json({ data: result.rows.map(row => ({
    ...row, value: String(row.value), base: String(row.base),
  })) });
}

export async function attachDiscount(req, res) {
  const { id } = req.validated.params;
  const discountId = req.validated.body.discountId;
  await withTransaction(async client => {
    const sub = await client.query('SELECT id FROM subscriptions WHERE id=$1 FOR UPDATE', [id]);
    if (!sub.rowCount) throw new AppError(404, 'NOT_FOUND', 'Subscription not found.');
    const eligible = await eligibleDiscountQuery(client, id, discountId);
    if (!eligible.rowCount) throw new AppError(422, 'DISCOUNT_INELIGIBLE', 'Discount is inactive, expired, exhausted, or its thresholds are not met.');
    await client.query(
      `INSERT INTO subscription_discounts (subscription_id, discount_id, added_by)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [id, discountId, req.auth.userId],
    );
  });
  res.status(201).json({ data: { subscription_id: id, discount_id: discountId } });
}

export async function detachDiscount(req, res) {
  const result = await pool.query(
    'DELETE FROM subscription_discounts WHERE subscription_id=$1 AND discount_id=$2 RETURNING subscription_id',
    [req.validated.params.id, req.validated.params.discountId],
  );
  if (!result.rowCount) throw new AppError(404, 'NOT_FOUND', 'Attached discount not found.');
  res.status(204).end();
}

function requestedDate(req) {
  const value = req.query.asOf ?? dateInTimezone(config.BUSINESS_TZ);
  if (!isValidDateOnly(value)) {
    throw new AppError(422, 'VALIDATION_FAILED', 'asOf must be a valid YYYY-MM-DD date.');
  }
  return value;
}

export async function invoicePreview(req, res) {
  res.json({ data: await previewInvoice(req.validated.params.id, requestedDate(req)) });
}

export async function generateInvoice(req, res) {
  const result = await billOne(req.validated.params.id, requestedDate(req), null, null, req.auth.userId);
  if (result.status !== 'billed') {
    throw new AppError(409, result.status.toUpperCase(), 'Subscription is not due for a new invoice.');
  }
  res.status(201).json({ data: result });
}
