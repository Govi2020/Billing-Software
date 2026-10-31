import { createHash } from 'node:crypto';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { billOne } from '../billing/service.js';
import { renderInvoicePdf } from '../../services/invoice-pdf.js';
import { config } from '../../config.js';
import { dateInTimezone, isValidDateOnly } from '../../lib/clock.js';

const id = value => {
  if (!/^[1-9]\d*$/.test(String(value))) throw new AppError(422, 'VALIDATION_FAILED', 'Invalid record id.');
  return String(value);
};
const pageArgs = req => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Invalid pagination parameters.');
  }
  return { page, limit };
};
const moneyBody = (req, today) => {
  const { method, amount, payment_date, reference, note } = req.body ?? {};
  const methods = ['cash', 'card', 'bank_transfer', 'upi', 'cheque', 'other'];
  if (!methods.includes(method) || !/^\d{1,10}\.\d{2}$/.test(String(amount)) || Number(amount) <= 0) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Valid payment method and amount with two decimal places are required.');
  }
  if (payment_date && !isValidDateOnly(payment_date)) throw new AppError(422, 'VALIDATION_FAILED', 'payment_date must be a valid YYYY-MM-DD date.');
  return { method, amount, payment_date: payment_date ?? today, reference: reference ?? null, note: note ?? null };
};

async function invoice(idValue, userId = null) {
  const values = [idValue];
  const ownership = userId ? `AND c.user_id=$2` : '';
  if (userId) values.push(userId);
  const result = await pool.query(
    `SELECT i.*, c.email AS customer_email, c.name AS customer_name, c.user_id
       FROM invoices i JOIN customers c ON c.id=i.customer_id
      WHERE i.id=$1 ${ownership}`,
    values,
  );
  if (!result.rowCount) throw new AppError(404, 'NOT_FOUND', 'Invoice not found.');
  return result.rows[0];
}

export async function listInvoices(req, res) {
  const { page, limit } = pageArgs(req);
  const { status, customerId, subscriptionId, dueFrom, dueTo, dateFrom, dateTo, q } = req.query;
  const statuses = ['draft', 'confirmed', 'paid', 'cancelled'];
  if (status && !statuses.includes(status)) throw new AppError(422, 'VALIDATION_FAILED', 'Invalid invoice status.');
  if (customerId) id(customerId);
  if (subscriptionId) id(subscriptionId);
  for (const value of [dueFrom, dueTo, dateFrom, dateTo].filter(Boolean)) {
    if (!isValidDateOnly(value)) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Date filters must be YYYY-MM-DD.');
    }
  }
  if ((dueFrom && dueTo && dueFrom > dueTo) || (dateFrom && dateTo && dateFrom > dateTo)) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Date ranges must be ordered from earliest to latest.');
  }
  if (q && (typeof q !== 'string' || q.length > 200)) throw new AppError(422, 'VALIDATION_FAILED', 'Search query is too long.');
  const overdue = req.query.overdue === undefined ? null
    : req.query.overdue === 'true' ? true
      : req.query.overdue === 'false' ? false : (() => { throw new AppError(422, 'VALIDATION_FAILED', 'overdue must be true or false.'); })();
  const today = dateInTimezone(config.BUSINESS_TZ);
  const params = [status ?? null, customerId ?? null, subscriptionId ?? null,
    dueFrom ?? null, dueTo ?? null, dateFrom ?? null, dateTo ?? null,
    q ? `%${q}%` : null, overdue, today];
  const where = `WHERE ($1::text IS NULL OR i.status::text=$1)
      AND ($2::bigint IS NULL OR i.customer_id=$2)
      AND ($3::bigint IS NULL OR i.subscription_id=$3)
      AND ($4::date IS NULL OR i.due_date >= $4) AND ($5::date IS NULL OR i.due_date <= $5)
      AND ($6::date IS NULL OR i.invoice_date >= $6) AND ($7::date IS NULL OR i.invoice_date <= $7)
      AND ($8::text IS NULL OR i.number ILIKE $8 OR c.name ILIKE $8)
      AND ($9::boolean IS NULL OR ($9 AND i.status='confirmed' AND i.due_date < $10::date)
        OR (NOT $9 AND (i.status<>'confirmed' OR i.due_date >= $10::date)))`;
  const result = await pool.query(
    `SELECT i.id, i.number, i.customer_id, i.subscription_id, i.status, i.invoice_date, i.due_date,
            i.period_start, i.period_end, i.total, i.amount_paid, (i.total-i.amount_paid) AS amount_due
       FROM invoices i JOIN customers c ON c.id=i.customer_id ${where}
      ORDER BY id DESC LIMIT $11 OFFSET $12`,
    [...params, limit, (page - 1) * limit],
  );
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM invoices i JOIN customers c ON c.id=i.customer_id ${where}`, params,
  );
  res.json({ data: result.rows, meta: { page, limit, total: count.rows[0].total } });
}

export async function listOwnInvoices(req, res) {
  const { page, limit } = pageArgs(req);
  const result = await pool.query(
    `SELECT i.id, i.number, i.status, i.invoice_date, i.due_date, i.total, i.amount_paid,
            (i.total-i.amount_paid) AS amount_due
       FROM invoices i JOIN customers c ON c.id=i.customer_id
      WHERE c.user_id=$1 ORDER BY i.id DESC LIMIT $2 OFFSET $3`,
    [req.auth.userId, limit, (page - 1) * limit],
  );
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE c.user_id=$1`,
    [req.auth.userId],
  );
  res.json({ data: result.rows, meta: { page, limit, total: count.rows[0].total } });
}

async function invoiceDetails(idValue, userId = null) {
  const { user_id: _userId, customer_email: _customerEmail, ...header } = await invoice(idValue, userId);
  const [lines, payments, redemptions] = await Promise.all([
    pool.query(
      `SELECT id, product_id, description, quantity, unit_price, discount_amount,
              tax_id, tax_name, tax_rate, tax_kind, tax_amount, line_subtotal, line_total
         FROM invoice_lines WHERE invoice_id=$1 ORDER BY id`,
      [idValue],
    ),
    pool.query(
      `SELECT id, method, amount, payment_date, reference, note FROM payments WHERE invoice_id=$1 ORDER BY id`,
      [idValue],
    ),
    pool.query(
      `SELECT dr.discount_id, d.name, dr.amount FROM discount_redemptions dr
         JOIN discount_rules d ON d.id=dr.discount_id WHERE dr.invoice_id=$1`,
      [idValue],
    ),
  ]);
  return { ...header, lines: lines.rows, payments: payments.rows, redemptions: redemptions.rows };
}

export async function getInvoice(req, res) {
  const invoiceId = id(req.params.id);
  const userId = req.auth.role === 'customer' ? req.auth.userId : null;
  res.json({ data: await invoiceDetails(invoiceId, userId) });
}

export async function getOwnInvoice(req, res) {
  res.json({ data: await invoiceDetails(id(req.params.id), req.auth.userId) });
}

export async function confirmInvoice(req, res) {
  const invoiceId = id(req.params.id);
  const result = await pool.query(
    `UPDATE invoices SET status='confirmed', confirmed_at=now()
      WHERE id=$1 AND status='draft' RETURNING *`,
    [invoiceId],
  );
  if (!result.rowCount) throw new AppError(409, 'INVALID_STATE', 'Only draft invoices can be confirmed.');
  res.json({ data: result.rows[0] });
}

export async function sendInvoice(req, res) {
  const invoiceId = id(req.params.id);
  const result = await withTransaction(async client => {
    const found = await client.query(
      `SELECT i.id, i.status, i.number, c.email FROM invoices i
         JOIN customers c ON c.id=i.customer_id WHERE i.id=$1 FOR UPDATE OF i`,
      [invoiceId],
    );
    if (!found.rowCount) throw new AppError(404, 'NOT_FOUND', 'Invoice not found.');
    const row = found.rows[0];
    if (row.status === 'draft') {
      await client.query(`UPDATE invoices SET status='confirmed', confirmed_at=now() WHERE id=$1`, [invoiceId]);
    } else if (row.status !== 'confirmed') {
      throw new AppError(409, 'INVALID_STATE', 'Only draft or confirmed invoices can be sent.');
    }
    await client.query(
      `INSERT INTO email_outbox (to_email, template, payload, dedupe_key)
       VALUES ($1,'invoice_sent',$2::jsonb,$3) ON CONFLICT (dedupe_key) DO NOTHING`,
      [row.email, JSON.stringify({ invoice_id: invoiceId, invoice_number: row.number }), `invoice.sent:${invoiceId}`],
    );
    await client.query(`UPDATE invoices SET sent_to=$2 WHERE id=$1`, [invoiceId, row.email]);
    return { id: invoiceId, sent_to: row.email };
  });
  res.status(202).json({ data: result });
}

export async function cancelInvoice(req, res) {
  const invoiceId = id(req.params.id);
  const reason = String(req.body?.reason ?? '').trim();
  if (!reason || reason.length > 500) throw new AppError(422, 'REASON_REQUIRED', 'A cancellation reason is required.');
  const result = await withTransaction(async client => {
    const locked = await client.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE', [invoiceId]);
    if (!locked.rowCount) throw new AppError(404, 'NOT_FOUND', 'Invoice not found.');
    const current = locked.rows[0];
    if (!['draft', 'confirmed'].includes(current.status) || Number(current.amount_paid) > 0) {
      throw new AppError(409, 'INVALID_STATE', 'Only unpaid draft or confirmed invoices can be cancelled.');
    }
    await client.query(
      `UPDATE invoices SET status='cancelled', cancelled_at=now(), cancel_reason=$2, cancelled_by=$3
        WHERE id=$1`,
      [invoiceId, reason, req.auth.userId],
    );
    const redemptions = await client.query(
      'DELETE FROM discount_redemptions WHERE invoice_id=$1 RETURNING discount_id',
      [invoiceId],
    );
    for (const item of redemptions.rows) {
      await client.query('UPDATE discount_rules SET times_used=GREATEST(times_used-1,0) WHERE id=$1', [item.discount_id]);
    }
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1,'invoice.cancel','invoice',$2,$3::jsonb)`,
      [req.auth.userId, invoiceId, JSON.stringify({ reason })],
    );
    return { id: invoiceId, status: 'cancelled' };
  });
  res.json({ data: result });
}

export async function reissueInvoice(req, res) {
  const invoiceId = id(req.params.id);
  const reason = String(req.body?.reason ?? '').trim();
  if (!reason || reason.length > 500) throw new AppError(422, 'REASON_REQUIRED', 'A reissue reason is required.');
  const old = await pool.query(
    'SELECT id, subscription_id, status, period_start, period_end FROM invoices WHERE id=$1',
    [invoiceId],
  );
  if (!old.rowCount) throw new AppError(404, 'NOT_FOUND', 'Invoice not found.');
  if (old.rows[0].status !== 'cancelled') throw new AppError(409, 'INVALID_STATE', 'Only a cancelled invoice period can be reissued.');
  const asOf = dateInTimezone(config.BUSINESS_TZ);
  const result = await billOne(old.rows[0].subscription_id, asOf, null, {
    periodStart: String(old.rows[0].period_start).slice(0, 10),
    periodEnd: String(old.rows[0].period_end).slice(0, 10),
  }, req.auth.userId);
  if (result.status !== 'billed') throw new AppError(409, 'ALREADY_BILLED', 'A non-cancelled invoice already exists for this period.');
  await pool.query(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
     VALUES ($1,'invoice.reissue','invoice',$2,$3::jsonb)`,
    [req.auth.userId, result.invoiceId, JSON.stringify({ cancelledInvoiceId: invoiceId, reason })],
  );
  res.status(201).json({ data: result });
}

export async function createPayment(req, res) {
  const invoiceId = id(req.params.id);
  const today = dateInTimezone(config.BUSINESS_TZ);
  const body = moneyBody(req, today);
  if (body.payment_date > today) throw new AppError(422, 'FUTURE_PAYMENT', 'Payment date cannot be in the future.');
  const key = req.get('idempotency-key');
  if (!key || key.length > 200) throw new AppError(422, 'IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header.');
  const hash = createHash('sha256').update(JSON.stringify({ invoiceId, ...body })).digest('hex');
  const result = await withTransaction(async client => {
    await client.query(
      `INSERT INTO idempotency_keys (key, actor_id, endpoint, request_hash)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [key, req.auth.userId, `/invoices/${invoiceId}/payments`, hash],
    );
    const idem = await client.query(
      `SELECT request_hash, status_code, response FROM idempotency_keys
        WHERE key=$1 AND actor_id=$2 AND endpoint=$3 FOR UPDATE`,
      [key, req.auth.userId, `/invoices/${invoiceId}/payments`],
    );
    if (idem.rows[0].request_hash !== hash) throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency key was already used with a different request.');
    if (idem.rows[0].response) return { replay: true, statusCode: idem.rows[0].status_code, data: idem.rows[0].response };
    const locked = await client.query('SELECT status,total,amount_paid FROM invoices WHERE id=$1 FOR NO KEY UPDATE', [invoiceId]);
    if (!locked.rowCount) throw new AppError(404, 'NOT_FOUND', 'Invoice not found.');
    if (locked.rows[0].status !== 'confirmed') throw new AppError(409, 'INVALID_STATE', 'Payments require a confirmed invoice.');
    if (Number(body.amount) > Number(locked.rows[0].total) - Number(locked.rows[0].amount_paid)) {
      throw new AppError(409, 'OVERPAYMENT', 'Payment exceeds the outstanding invoice balance.');
    }
    if (body.reference) {
      const dup = await client.query(
        `SELECT id FROM payments WHERE invoice_id=$1 AND amount=$2 AND method=$3 AND reference=$4
           AND created_at > now() - interval '24 hours' LIMIT 1`,
        [invoiceId, body.amount, body.method, body.reference],
      );
      if (dup.rowCount && req.body?.override !== true) {
        throw new AppError(409, 'POSSIBLE_DUPLICATE', 'A similar payment was recorded in the last 24 hours.', { override: true });
      }
    }
    const payment = await client.query(
      `INSERT INTO payments (invoice_id, method, amount, payment_date, reference, note, recorded_by)
       VALUES ($1,$2,$3,$4::date,$5,$6,$7) RETURNING *`,
      [invoiceId, body.method, body.amount, body.payment_date, body.reference, body.note, req.auth.userId],
    );
    const data = payment.rows[0];
    await client.query(
      `UPDATE idempotency_keys SET status_code=201, response=$1::jsonb
        WHERE key=$2 AND actor_id=$3 AND endpoint=$4`,
      [JSON.stringify(data), key, req.auth.userId, `/invoices/${invoiceId}/payments`],
    );
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1,'payment.record','payment',$2,$3::jsonb)`,
      [req.auth.userId, data.id, JSON.stringify({ invoiceId, amount: body.amount })],
    );
    return { replay: false, statusCode: 201, data };
  }, { retries: 3 });
  res.status(result.statusCode).json({ data: result.data, ...(result.replay ? { meta: { idempotentReplay: true } } : {}) });
}

export async function listPayments(req, res) {
  const { page, limit } = pageArgs(req);
  const methods = ['cash', 'card', 'bank_transfer', 'upi', 'cheque', 'other'];
  const { method, dateFrom, dateTo, customerId, invoiceId } = req.query;
  if (method && !methods.includes(method)) throw new AppError(422, 'VALIDATION_FAILED', 'Invalid payment method.');
  if (customerId) id(customerId);
  if (invoiceId) id(invoiceId);
  for (const value of [dateFrom, dateTo].filter(Boolean)) {
    if (!isValidDateOnly(value)) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Date filters must be YYYY-MM-DD.');
    }
  }
  if (dateFrom && dateTo && dateFrom > dateTo) throw new AppError(422, 'VALIDATION_FAILED', 'Date ranges must be ordered from earliest to latest.');
  const filters = [method ?? null, dateFrom ?? null, dateTo ?? null, customerId ?? null, invoiceId ?? null];
  const where = `WHERE ($1::text IS NULL OR p.method::text=$1)
      AND ($2::date IS NULL OR p.payment_date >= $2) AND ($3::date IS NULL OR p.payment_date <= $3)
      AND ($4::bigint IS NULL OR i.customer_id=$4) AND ($5::bigint IS NULL OR p.invoice_id=$5)`;
  const result = await pool.query(
    `SELECT p.id, p.invoice_id, i.customer_id, p.method, p.amount, p.payment_date, p.reference, p.note
       FROM payments p JOIN invoices i ON i.id=p.invoice_id ${where}
      ORDER BY p.id DESC LIMIT $6 OFFSET $7`,
    [...filters, limit, (page - 1) * limit],
  );
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM payments p JOIN invoices i ON i.id=p.invoice_id ${where}`,
    filters,
  );
  res.json({ data: result.rows, meta: { page, limit, total: count.rows[0].total } });
}

export async function listOwnPayments(req, res) {
  const result = await pool.query(
    `SELECT p.id, p.invoice_id, p.method, p.amount, p.payment_date, p.reference, p.note
       FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN customers c ON c.id=i.customer_id
      WHERE c.user_id=$1 ORDER BY p.id DESC`,
    [req.auth.userId],
  );
  res.json({ data: result.rows });
}

export async function deletePayment(req, res) {
  const paymentId = id(req.params.id);
  const reason = String(req.body?.reason ?? '').trim();
  if (!reason || reason.length > 500) throw new AppError(422, 'REASON_REQUIRED', 'A correction reason is required.');
  const result = await withTransaction(async client => {
    const payment = await client.query('DELETE FROM payments WHERE id=$1 RETURNING id, invoice_id, amount', [paymentId]);
    if (!payment.rowCount) throw new AppError(404, 'NOT_FOUND', 'Payment not found.');
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1,'payment.delete','payment',$2,$3::jsonb)`,
      [req.auth.userId, paymentId, JSON.stringify({ reason, invoiceId: payment.rows[0].invoice_id, amount: payment.rows[0].amount })],
    );
    return { deleted: true };
  });
  res.json({ data: result });
}

export async function invoicePdf(req, res) {
  const invoiceId = id(req.params.id);
  const userId = req.auth.role === 'customer' ? req.auth.userId : null;
  const details = await invoiceDetails(invoiceId, userId);
  const buffer = await renderInvoicePdf(details);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${details.number}.pdf"`);
  res.send(buffer);
}
