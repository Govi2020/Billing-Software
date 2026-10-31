import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';

const fields = [
  'name', 'company_name', 'email', 'phone', 'tax_number', 'address_line1',
  'address_line2', 'city', 'state', 'postal_code', 'country',
];
const serialize = row => ({ ...row });

export async function list(req, res) {
  const { page, limit, q } = req.validated.query;
  const search = q ? `%${q}%` : null;
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM customers
      WHERE $1::text IS NULL OR name ILIKE $1 OR company_name ILIKE $1 OR email ILIKE $1`,
    [search],
  );
  const result = await pool.query(
    `SELECT id, user_id, name, company_name, email, phone, tax_number, address_line1,
            address_line2, city, state, postal_code, country, created_at, updated_at
       FROM customers WHERE $1::text IS NULL OR name ILIKE $1 OR company_name ILIKE $1 OR email ILIKE $1
      ORDER BY id DESC LIMIT $2 OFFSET $3`,
    [search, limit, (page - 1) * limit],
  );
  res.json({ data: result.rows, meta: { page, limit, total: count.rows[0].total } });
}

export async function create(req, res) {
  const body = req.validated.body;
  const result = await pool.query(
    `INSERT INTO customers
      (${fields.join(', ')}, created_by)
     VALUES (${fields.map((_, i) => `$${i + 1}`).join(', ')}, $${fields.length + 1})
     RETURNING *`,
    [...fields.map(field => body[field] ?? null), req.auth.userId],
  );
  res.status(201).json({ data: serialize(result.rows[0]) });
}

async function getById(id) {
  const result = await pool.query('SELECT * FROM customers WHERE id=$1', [id]);
  if (!result.rowCount) throw new AppError(404, 'NOT_FOUND', 'Customer not found.');
  return result.rows[0];
}

export async function get(req, res) {
  res.json({ data: await getById(req.validated.params.id) });
}

async function ownCustomer(userId) {
  const result = await pool.query('SELECT * FROM customers WHERE user_id=$1', [userId]);
  if (!result.rowCount) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer profile not found.');
  return result.rows[0];
}

export async function getOwn(req, res) {
  res.json({ data: await ownCustomer(req.auth.userId) });
}

async function update(id, body, ifMatch, res) {
  const changedFields = Object.keys(body);
  const values = changedFields.map(field => body[field]);
  const result = await pool.query(
    `UPDATE customers SET ${changedFields.map((field, i) => `${field}=$${i + 1}`).join(', ')}
      WHERE id=$${changedFields.length + 1} AND updated_at=$${changedFields.length + 2}::timestamptz RETURNING *`,
    [...values, id, ifMatch],
  );
  if (!result.rowCount) {
    const exists = await pool.query('SELECT 1 FROM customers WHERE id=$1', [id]);
    if (!exists.rowCount) throw new AppError(404, 'NOT_FOUND', 'Customer not found.');
    throw new AppError(409, 'STALE_RECORD', 'The customer changed since it was loaded.');
  }
  res.json({ data: serialize(result.rows[0]) });
}

export async function patch(req, res) {
  await update(req.validated.params.id, req.validated.body, req.ifMatch, res);
}

export async function patchOwn(req, res) {
  const customer = await ownCustomer(req.auth.userId);
  await update(customer.id, req.validated.body, req.ifMatch, res);
}

async function related(req, res, query) {
  const id = req.validated.params.id;
  await getById(id);
  const result = await pool.query(query, [id]);
  res.json({ data: result.rows });
}

export async function subscriptions(req, res) {
  await related(req, res, 'SELECT id, number, plan_id, status, start_date, expiry_date, next_invoice_date FROM subscriptions WHERE customer_id=$1 ORDER BY id DESC');
}

export async function invoices(req, res) {
  await related(req, res, 'SELECT id, number, subscription_id, status, invoice_date, due_date, total, amount_paid FROM invoices WHERE customer_id=$1 ORDER BY id DESC');
}

export async function payments(req, res) {
  await related(req, res, 'SELECT p.id, p.invoice_id, p.method, p.amount, p.payment_date, p.reference, p.note FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE i.customer_id=$1 ORDER BY p.id DESC');
}
